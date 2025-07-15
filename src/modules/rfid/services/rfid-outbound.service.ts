import { EXCLUDED_EPC_REGEX } from '@/common/constants/regex'
import { DATA_SOURCE_DATA_LAKE, RecordStatus } from '@/databases/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { readFileSync } from 'fs'
import { chunk } from 'lodash'
import { FilterQuery, PipelineStage } from 'mongoose'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { join, resolve } from 'path'
import { Brackets, DataSource } from 'typeorm'
import { Logger } from 'winston'
import { InventoryActions, POST_DATA_OUTBOUND_QUEUE } from '../constants'
import { PostReaderDataDTO, UpsertStockOutDTO } from '../dto/rfid.dto'
import { RFIDInventoryBackupEntity } from '../entities/rifd-inventory.entity'
import { EpcDocument, EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { EpcInformation, RFIDSearchParams } from '../types'
import { generateStation } from '../utils'

@Injectable()
export class RFIDOutboundService {
	constructor(
		@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE)
		private readonly postDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel
	) {}

	public async postOutboundRFIDData(payload: PostReaderDataDTO) {
		return await this.postDataQueue.add('RFID_OUTBOUND', payload)
	}

	public async upsertStockOut(factoryCode: string, payload: UpsertStockOutDTO) {
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
					factory_code_produce: factoryCode,
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
					{ $set: { deleted: true, stored_at: new Date(), factory_code_produce: factoryCode, po: payload.po } }
				)
				.exec()

			await queryRunner.commitTransaction()
			await session.commitTransaction()
		} catch (error) {
			this.logger.error(error)
			if (session.inTransaction()) await session.abortTransaction()
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error.message)
		} finally {
			if (!session.hasEnded) await session.endSession()
			await queryRunner.release()
		}
	}

	public async getArchivedEpcs(factoryCode: string, args: RFIDSearchParams & { 'scanned.eq'?: boolean }) {
		const filterQuery: FilterQuery<EpcDocument> = {
			deleted: true,
			scannable: true,
			epc: { $not: { $regex: EXCLUDED_EPC_REGEX } },
			factory_code_produce: factoryCode,
			po: null,
			...(args.q && { epc: { $regex: args.q, $options: 'i' } }),
			...(args['mo_no.eq'] && { mo_no: args['mo_no.eq'] }),
			...(args['size_numcode.eq'] && { size_numcode: args['size_numcode.eq'] }),
			...(args['shoes_style.eq'] && { shoes_style_code_factory: args['shoes_style.eq'] }),
			...(args['color_sn.eq'] && { color_sn: args['color_sn.eq'] })
		}

		const [undeletedEpcs, deletedEpcs] = await Promise.all([
			this.epcOutboundModel.distinct('epc', {
				deleted: false,
				scannable: true,
				stored_at: null
			}),
			this.epcOutboundModel.findWithDeleted(filterQuery, { _id: 0, epc: 1, stored_at: 1 }).lean(true)
		])

		const subQuery = this.dataSourceDL
			.createQueryBuilder()
			.select('b.EPC_Code', 'EPC_Code')
			.from('dv_InvRFIDrecorddet_backup_Daily', 'b')
			.where('b.rfid_status = :_status')
			.andWhere('b.stationNO = :_station')
			.setParameters({
				_status: InventoryActions.OUTBOUND,
				_station: generateStation(factoryCode, 'WH103')
			})

		const queryBuilder = await this.dataSourceDL
			.getRepository(RFIDInventoryBackupEntity)
			.createQueryBuilder('a')
			.select([
				/* SQL */ `DISTINCT a.EPC_Code AS epc`,
				/* SQL */ `a.mo_no AS mo_no`,
				/* SQL */ `a.size_code AS size_numcode`,
				/* SQL */ `c.shoestyle_codefactory AS shoes_style_code_factory`,
				/* SQL */ `d.color_sn AS color_sn`,
				/* SQL */ `CAST(COALESCE(e.scanned, 0) AS BIT) AS scanned`,
				/* SQL */ `e.stored_at AS stored_at`
			])
			.innerJoin(
				'dv_rfidmatchmst_cust',
				'c',
				/* SQL */ `a.EPC_Code = c.EPC_Code AND a.mo_no = c.mo_no AND a.size_code = c.size_numcode`
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
				/* SQL */ `c.mat_code = d.mat_code`
			)
			.leftJoin(
				(qb) => {
					return qb
						.select(/* SQL */ `JSON_VALUE(value, '$.epc')`, 'epc')
						.addSelect(/* SQL */ `JSON_VALUE(value, '$.stored_at')`, 'stored_at')
						.addSelect(/* SQL */ `CAST(1 AS BIT)`, 'scanned')
						.from(/* SQL */ `OPENJSON(N'${JSON.stringify(deletedEpcs)}')`, 'e')
						.disableEscaping()
				},
				'e',
				/* SQL */ `a.EPC_Code = e.epc`
			)
			.andWhere('a.stationNO = :station')
			.where('a.rfid_status = :status')
			.andWhere(/* SQL */ `a.EPC_Code NOT IN (${subQuery.getQuery()})`)
			.andWhere(
				new Brackets((qb) => {
					if (undeletedEpcs.length > 0) {
						qb.andWhere(/* SQL */ `a.EPC_Code NOT IN (:...undeleted)`)
					}
				})
			)
			.andWhere(
				new Brackets((qb) => {
					// Filter by EPC code (search query)
					if (args.q) {
						qb.andWhere(/* SQL */ `a.EPC_Code LIKE CONCAT('%',:search, '%')`, { search: args.q })
					}

					// Filter by manufacturing order number
					if (args['mo_no.eq']) {
						qb.andWhere(/* SQL */ `a.mo_no = :mo_no`, { mo_no: args['mo_no.eq'] })
					}

					// Filter by size number code
					if (args['size_numcode.eq']) {
						qb.andWhere(/* SQL */ `a.size_code = :size_numcode`, { size_numcode: args['size_numcode.eq'] })
					}

					// Filter by shoes style code (factory)
					if (args['shoes_style.eq']) {
						qb.andWhere(/* SQL */ `c.shoestyle_codefactory = :shoes_style_code`, {
							shoes_style_code: args['shoes_style.eq']
						})
					}

					// Filter by color serial number
					if (args['color_sn.eq']) {
						qb.andWhere(/* SQL */ `d.color_sn = :color_sn`, { color_sn: args['color_sn.eq'] })
					}

					// Filter by scanned status (boolean)
					if (typeof args['scanned.eq'] === 'boolean') {
						qb.andWhere(/* SQL */ `CAST(COALESCE(e.scanned, 0) AS BIT) = :scanned`, {
							scanned: args['scanned.eq'] ? 1 : 0
						})
					}
					return qb
				})
			)
			.orderBy(/* SQL */ `CAST(COALESCE(e.scanned, 0) AS BIT)`, 'DESC')
			.addOrderBy('a.mo_no', 'DESC')
			.addOrderBy('a.size_code', 'DESC')
			.addOrderBy('c.shoestyle_codefactory', 'ASC')
			.addOrderBy('d.color_sn', 'ASC')
			.addOrderBy('a.EPC_Code')
			.offset((args.page - 1) * args.limit)
			.limit(args.limit)
			.setParameters({
				status: InventoryActions.INBOUND,
				station: generateStation(factoryCode, 'WH101'),
				undeleted: undeletedEpcs,
				...subQuery.getParameters()
			})

		const [totalDocs, data] = await Promise.all([queryBuilder.getCount(), queryBuilder.getRawMany<EpcInformation>()])

		const totalPages = Math.ceil(totalDocs / args.limit)

		return {
			data,
			totalDocs,
			totalPages,
			page: args.page,
			limit: args.limit,
			hasNextPage: args.page < totalPages,
			hasPrevPage: args.page > 1,
			nextPage: args.page < totalPages ? args.page + 1 : null,
			prevPage: args.page > 1 ? args.page - 1 : null
		} as Pagination<EpcInformation>
	}
}
