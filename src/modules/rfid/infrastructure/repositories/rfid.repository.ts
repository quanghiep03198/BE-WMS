import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Brackets, DataSource } from 'typeorm'
import { EXCLUDED_ORDERS } from '../../domain/constants'
import { ElectronicProductCode } from '../../domain/entities/epc.entity'
import { InventoryEpc, InventoryEpcModel } from '../persistence/mongodb/epc.schema'

@Injectable()
export class RFIDRepository {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async getEpcInformation(epcs: ElectronicProductCode[]) {
		return await this.dataSourceDL
			.createQueryBuilder()
			.select([
				'a.value AS epc',
				'b.mo_no AS mo_no',
				'b.shoestyle_codefactory as factory_shoes_style',
				'b.color_sn',
				'b.size_numcode',
				'b.factory_code_produce'
			])
			.from(/* SQL */ `OPENJSON(:epcs)`, 'a')
			.leftJoin('dv_rfidmatchmst_cust', 'b', /* SQL */ `a.value = b.epc`)
			.where(/* SQL */ `LEN(a.value) = 24`)
			.andWhere(
				new Brackets((qb) =>
					qb.where(/* SQL */ ` b.mo_no IS NULL `).orWhere(/* SQL */ `b.mo_no NOT IN (:...excludedCommandNumbers)`)
				)
			)
			.setParameter('epcs', JSON.stringify(epcs.map((item) => item.getCode())))
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
	}

	public async bulkWriteInventoryEpcs(epcs: ElectronicProductCode[], action: 'inbound' | 'outbound', sn: string) {
		const bulkWriteOptions = epcs.map((item) => ({
			updateOne: {
				filter: { epc: item.getCode(), scannable: true },
				update: {
					epc: item.getCode(),
					...(action === 'inbound' && { inbound_at: null, inbound_device_sn: sn }),
					...(action === 'outbound' && { outbound_at: null, outbound_device_sn: sn })
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
