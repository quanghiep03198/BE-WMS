import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Brackets, DataSource } from 'typeorm'
import { EXCLUDED_ORDERS } from '../../domain/constants'
import { ElectronicProductCode } from '../../domain/entities/epc.entity'
import { InventoryEpc, InventoryEpcModel } from '../persistence/mongodb/epc.schema'
import { RFIDSearchParams, ScannedOrderDetail } from '../types'

@Injectable()
export class RFIDRepository {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async getEpcInformation(epcs: ElectronicProductCode[]) {
		const rawData = await this.dataSourceDL
			.createQueryBuilder()
			.select([
				'a.value AS epc',
				'b.mo_no AS mo_no',
				'b.shoestyle_codefactory AS factory_shoes_style',
				'b.color_sn AS color_sn',
				'b.size_numcode AS size_numcode',
				'b.factory_code_produce AS factory_code_produce'
			])
			.from(/* SQL */ `OPENJSON(:epcs)`, 'a')
			.leftJoin('dv_rfidmatchmst_cust', 'b', /* SQL */ `a.value = b.epc`)
			.where(/* SQL */ `LEN(a.value) = 24`)
			.andWhere(
				new Brackets((qb) =>
					qb.where(/* SQL */ ` b.mo_no IS NULL `).orWhere(/* SQL */ `b.mo_no NOT IN (:...excludedCommandNumbers)`)
				)
			)
			.setParameter('epcs', JSON.stringify(epcs.map((item) => item.getProductCode())))
			.setParameter('excludedCommandNumbers', EXCLUDED_ORDERS)
			.disableEscaping()
			.getRawMany<{
				epc: string
				mo_no: string
				factory_shoes_style: string
				color_sn: string
				size_numcode: string
				factory_code_produce: string
			}>()

		return rawData.map(
			(item) =>
				new ElectronicProductCode(
					item.epc,
					undefined,
					item.mo_no,
					item.factory_shoes_style,
					item.color_sn,
					item.size_numcode
				)
		)
	}

	public async getScanningMOs(
		params:
			| Required<Pick<RFIDSearchParams, 'inbound_device_sn.eq'>>
			| Required<Pick<RFIDSearchParams, 'outbound_device_sn.eq'>>
	): Promise<ScannedOrderDetail[]> {
		return await this.inventoryEpcModel.aggregate<ScannedOrderDetail>(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: {
						scannable: true,
						...(params['inbound_device_sn.eq'] && {
							inbound_device_sn: params['inbound_device_sn.eq'],
							inbound_at: null,
							outbound_at: null,
							po: null
						}),
						...(params['outbound_device_sn.eq'] && {
							outbound_device_sn: params['outbound_device_sn.eq'],
							inbound_at: { $ne: null },
							outbound_at: null,
							po: null
						})
					}
				},
				// * Stage 2: Group by mo_no, color_sn, and factory_shoes_style, and aggregate sizes
				{
					$group: {
						_id: {
							mo_no: '$mo_no',
							color_sn: '$color_sn',
							factory_shoes_style: '$factory_shoes_style',
							factory_code_produce: '$factory_code_produce',
							size_numcode: '$size_numcode'
						},
						count: { $sum: 1 }
					}
				},
				// * Stage 3: Reshape the data to group sizes into an array
				{
					$group: {
						_id: {
							mo_no: '$_id.mo_no',
							color_sn: '$_id.color_sn',
							factory_shoes_style: '$_id.factory_shoes_style',
							factory_code_produce: '$_id.factory_code_produce'
						},
						sizes: {
							$push: {
								size_numcode: '$_id.size_numcode',
								count: '$count'
							}
						}
					}
				},
				// * Stage 4: Reshape the final output
				{
					$project: {
						_id: 0,
						mo_no: '$_id.mo_no',
						color_sn: '$_id.color_sn',
						factory_shoes_style: '$_id.factory_shoes_style',
						factory_code_produce: '$_id.factory_code_produce',
						sizes: 1
					}
				},
				// * Stage 5: Sort the results
				{ $sort: { mo_no: 1, color_sn: 1, factory_shoes_style: 1 } }
			],
			{ readPreference: 'nearest' }
		)
	}

	public async getInternalEpcsExist(
		params:
			| Required<Pick<RFIDSearchParams, 'inbound_device_sn.eq'>>
			| Required<Pick<RFIDSearchParams, 'outbound_device_sn.eq'>>
	) {
		const existedRecord = await this.inventoryEpcModel
			.exists({
				scannable: true,
				epc: { $regex: /^E28/i },
				...(params['inbound_device_sn.eq'] && { inbound_device_sn: params['inbound_device_sn.eq'] }),
				...(params['outbound_device_sn.eq'] && { outbound_device_sn: params['outbound_device_sn.eq'] })
			})
			.lean(true)

		return Boolean(existedRecord)
	}

	public async bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: 'inbound' | 'outbound'
		payload: { eProductCodes: ElectronicProductCode[]; deviceSerialNumber: string }
	}) {
		const bulkWriteOptions = payload.eProductCodes.map((item) => ({
			updateOne: {
				filter: { epc: item.getProductCode(), scannable: true },
				update: {
					epc: item.getProductCode(),
					mo_no: item.getCommandNumber(),
					factory_shoes_style: item.getShoeStyle(),
					color_sn: item.getColor(),
					size_numcode: item.getSize(),
					last_scanned_at: new Date(),
					factory_code_produce: item.getFactoryProduce(),
					...(action === 'inbound' && { inbound_at: null, inbound_device_sn: payload.deviceSerialNumber }),
					...(action === 'outbound' && { outbound_at: null, outbound_device_sn: payload.deviceSerialNumber })
				},
				upsert: true
			}
		}))

		await this.inventoryEpcModel.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}
}
