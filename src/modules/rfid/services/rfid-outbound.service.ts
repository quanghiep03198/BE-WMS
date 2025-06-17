import { EXCLUDED_EPC_REGEX } from '@/common/constants/regex'
import { FileLogger } from '@/common/helpers'
import { DATA_SOURCE_DATA_LAKE, RecordStatus } from '@/databases/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { readFileSync } from 'fs'
import { chunk } from 'lodash'
import { FilterQuery, PipelineStage } from 'mongoose'
import { join, resolve } from 'path'
// import { DataSource } from 'typeorm'
import { Brackets, DataSource } from 'typeorm'
import { InventoryActions, POST_DATA_OUTBOUND_QUEUE } from '../constants'
import { PostReaderDataDTO, UpsertStockOutDTO } from '../dto/rfid.dto'
import { EpcDocument, EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { EpcInformation, RFIDSearchParams } from '../types'

@Injectable()
export class RFIDOutboundService {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE)
		private readonly postDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel
	) {}

	public async postOutboundRFIDData(payload: PostReaderDataDTO) {
		return await this.postDataQueue.add('RFID_OUTBOUND', payload)
	}

	public async upsertStockOut(payload: UpsertStockOutDTO) {
		const baseFilterQuery: FilterQuery<EpcDocument> = {
			$or: [{ deleted: false }, { deleted: null }],
			scannable: true
		}

		/**
		 * ? In case of multiple command numbers, filter by mo_no and size_numcode
		 * ? Otherwise, with single command number, filter by mo_no, size_numcode and limit quantity
		 */
		const epcToUpsert = await (async () => {
			if (!Array.isArray(payload.sizes)) {
				return await this.epcOutboundModel.findWithDeleted({ ...baseFilterQuery, mo_no: payload.mo_no }).lean(true)
			}

			const facetPipeline = payload.sizes.reduce<PipelineStage.Facet['$facet']>((acc, curr) => {
				return {
					...acc,
					[curr.size_numcode]: [
						{ $match: { ...baseFilterQuery, mo_no: payload.mo_no, size_numcode: curr.size_numcode } },
						{
							$project: {
								_id: 0,
								epc: 1,
								mo_no: 1,
								size_numcode: 1,
								station_no: 1,
								factory_code_produce: 1
							}
						},
						{ $limit: curr.qty }
					]
				}
			}, {})
			const aggregatedEpcData = await this.epcOutboundModel.aggregateWithDeleted([{ $facet: facetPipeline }])
			const extractedValues = Object.values<Array<Partial<EpcDocument>>>(aggregatedEpcData[0])
			return extractedValues.every((facetGroup) => Array.isArray(facetGroup)) ? extractedValues.flat() : []
		})()

		const session = await this.epcOutboundModel.startSession()
		const queryRunner = this.dataSourceDL.createQueryRunner()
		const upsertStockoutQuery: string = readFileSync(resolve(join(__dirname, '../sql/upsert-outbound.sql')), 'utf-8')
		try {
			await session.startTransaction()
			await queryRunner.startTransaction()

			const data = epcToUpsert.map((value) => {
				return {
					...value,
					po: payload.po
				}
			})
			for (const item of chunk(data, 100)) {
				const values = item
					.map((value) => {
						return `('${value.epc}', '${value.po}', '${value.mo_no}', '${value.size_numcode}', '${value.station_no}', '${value.factory_code_produce}')`
					})
					.join(',')

				await this.dataSourceDL.query(upsertStockoutQuery.replace(/:values/g, values))
			}
			await this.epcOutboundModel
				.updateMany(
					{ ...baseFilterQuery, epc: { $in: epcToUpsert.map((item) => item.epc) } },
					{ $set: { deleted: true, po: payload.po } }
				)
				.exec()

			await queryRunner.commitTransaction()
			await session.commitTransaction()
		} catch (error) {
			FileLogger.error(error)
			if (session.inTransaction()) await session.abortTransaction()
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error.message)
		} finally {
			if (!session.hasEnded) await session.endSession()
			await queryRunner.release()
		}
	}

	public async getArchivedEpcs(factoryCode: string, args: RFIDSearchParams) {
		const filterQuery: FilterQuery<EpcDocument> = {
			deleted: true,
			scannable: true,
			epc: { $not: { $regex: EXCLUDED_EPC_REGEX } },
			factory_code_produce: factoryCode,
			po: null,
			...(args.q && { epc: { $regex: args.q, $options: 'i' } }),
			...(args['shoes_style.eq'] && { shoes_style_code_factory: args['shoes_style.eq'] }),
			...(args['color_sn.eq'] && { color_sn: args['color_sn.eq'] }),
			...(args['mo_no.eq'] && { mo_no: args['mo_no.eq'] }),
			...(args['size_numcode.eq'] && { size_numcode: args['size_numcode.eq'] })
		}

		const deletedEpcs = await this.epcOutboundModel
			.findWithDeleted(filterQuery)
			.select({ _id: 0, epc: 1, record_time: 1 })
			.lean(true)

		const subQuery = this.dataSourceDL
			.createQueryBuilder()
			.select('b.EPC_Code', 'EPC_Code')
			.from('dv_InvRFIDrecorddet_backup_Daily', 'b')
			.where('b.rfid_status = :_status')
			.andWhere('b.stationNO = :_station')
			.setParameters({
				_status: InventoryActions.OUTBOUND,
				_station: `CUS_${factoryCode}_WH103`
			})

		return await this.dataSourceDL
			.createQueryBuilder()
			.distinct()
			.select('a.EPC_Code', 'epc')
			.addSelect('a.mo_no', 'mo_no')
			.addSelect('a.size_code', 'size_numcode')
			.addSelect('c.shoestyle_codefactory', 'shoes_style_code_factory')
			.addSelect('d.color_sn', 'color_sn')
			.addSelect('ISNULL(e.scanned, 0)', 'scanned')
			.from('dv_InvRFIDrecorddet_backup_Daily', 'a')
			.innerJoin(
				'dv_rfidmatchmst_cust',
				'c',
				'a.EPC_Code = c.EPC_Code AND a.mo_no = c.mo_no AND a.size_code = c.size_numcode'
			)
			.innerJoin(
				(qb) => {
					return qb
						.subQuery()
						.select('d.color_sn')
						.addSelect('d.mat_code')
						.from('wuerp_vnrd.dbo.ta_productmst', 'd')
						.where('d.isactive = :record_status')
						.setParameters({ record_status: RecordStatus.ACTIVE })
				},
				'd',
				'c.mat_code = d.mat_code'
			)
			.leftJoin(
				(qb) => {
					const values = deletedEpcs.map((item) => ({ epc: item.epc, scanned: 1 }))
					return qb
						.select(/* SQL */ `JSON_VALUE(value, '$.epc')`, 'epc')
						.addSelect(/* SQL */ `CAST(JSON_VALUE(value, '$.scanned') AS INT)`, 'scanned')
						.from(/* SQL */ `OPENJSON(N'${JSON.stringify(values)}')`, 'e')
						.disableEscaping()
				},
				'e',
				'a.EPC_Code = e.epc'
			)
			.where('a.rfid_status = :status')
			.andWhere('a.stationNO = :station')
			.andWhere(
				new Brackets((qb) => {
					if (args.q) qb.andWhere(`a.EPC_Code LIKE :search`, { search: `%${args.q}%` })
					if (args['shoes_style.eq'])
						qb.andWhere('c.shoestyle_codefactory = :shoes_style', {
							shoes_style: args['shoes_style.eq']
						})
					if (args['color_sn.eq']) qb.andWhere('d.color_sn = :color_sn', { color_sn: args['color_sn.eq'] })
					if (args['mo_no.eq']) qb.andWhere('a.mo_no = :mo_no', { mo_no: args['mo_no.eq'] })
					if (args['size_numcode.eq'])
						qb.andWhere('a.size_code = :size_numcode', { size_numcode: args['size_numcode.eq'] })
					return qb
				})
			)
			// .andWhere('a.mo_no = :mo_no')
			.andWhere(`a.EPC_Code NOT IN (${subQuery.getQuery()})`)
			.orderBy('a.size_code', 'ASC')
			.addOrderBy('a.EPC_Code', 'ASC')
			.skip((args._page - 1) * args._limit)
			.take(args._limit)
			.setParameters({
				status: InventoryActions.INBOUND,
				station: `CUS_${factoryCode}_WH101`,
				search: args.q,
				shoes_style: args['shoes_style.eq'],
				color_sn: args['color_sn.eq'],
				mo_no: args['mo_no.eq'],
				size_numcode: args['size_numcode.eq'],
				...subQuery.getParameters()
			})
			.getRawMany<EpcInformation>()
	}

	public async getArchivedEpcFeatures() {
		return await this.epcOutboundModel
			.aggregateWithDeleted([
				{
					$match: {
						deleted: true,
						scannable: true,
						epc: { $not: { $regex: EXCLUDED_EPC_REGEX } },
						po: null
					}
				},
				{
					$group: {
						_id: {
							shoes_style_code_factory: '$shoes_style_code_factory',
							color_sn: '$color_sn',
							mo_no: '$mo_no',
							size_numcode: '$size_numcode'
						}
					}
				},
				{
					$group: {
						_id: {
							shoes_style_code_factory: '$_id.shoes_style_code_factory',
							color_sn: '$_id.color_sn',
							mo_no: '$_id.mo_no'
						},
						sizes: {
							$push: '$_id.size_numcode'
						}
					}
				},
				{
					$group: {
						_id: {
							shoes_style_code_factory: '$_id.shoes_style_code_factory',
							color_sn: '$_id.color_sn'
						},
						batches: {
							$push: {
								mo_no: '$_id.mo_no',
								sizes: '$sizes'
							}
						}
					}
				},
				{
					$group: {
						_id: '$_id.shoes_style_code_factory',
						colorways: {
							$push: {
								color_sn: '$_id.color_sn',
								batches: '$batches'
							}
						}
					}
				},
				{
					$project: {
						_id: 0,
						shoes_style_code_factory: '$_id',
						colorways: '$colorways'
					}
				}
			])
			.exec()
	}

	public async restoreArchivedEpcs(epcs: string[]) {
		return await this.epcOutboundModel
			.restore({
				scannable: true,
				$and: [{ epc: { $in: epcs } }, { epc: { $not: { $regex: EXCLUDED_EPC_REGEX } } }],
				po: null
			})
			.exec()
	}
}
