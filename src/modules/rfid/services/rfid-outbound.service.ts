import { EXCLUDED_EPC_REGEX } from '@/common/constants/regex'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { readFileSync } from 'fs'
import { chunk, omit } from 'lodash'
import { FilterQuery, PipelineStage } from 'mongoose'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join, resolve } from 'path'
import { Brackets, DataSource } from 'typeorm'
import { Logger } from 'winston'
import { InventoryActions, POST_DATA_OUTBOUND_QUEUE } from '../constants'
import { PostReaderDataDTO, UpsertStockOutDTO } from '../dto/rfid.dto'
import { RFIDInventoryBackupEntity } from '../entities/rifd-inventory.entity'
import { EpcDocument, EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { EpcInformation, RFIDSearchParams } from '../types'

@Injectable()
export class RFIDOutboundService {
	constructor(
		@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE)
		private readonly postDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel,
		private readonly i18nService: I18nService
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

		const isPurchaseOrderCompleted = await this.getIsOrderCompleted(payload.po)

		if (isPurchaseOrderCompleted)
			throw new BadRequestException(
				this.i18nService.t('inoutbound.notification.over_outbound_limit', { lang: I18nContext.current()?.lang })
			)

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
			throw new InternalServerErrorException((error as Error).message)
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
			...(args['shoes_style.eq'] && { factory_shoes_style: args['shoes_style.eq'] }),
			...(args['color_sn.eq'] && { color_sn: args['color_sn.eq'] })
		}

		const [undeletedEpcs, deletedEpcs] = await Promise.all([
			this.epcOutboundModel
				.distinct('epc', {
					...omit(filterQuery, ['deleted']),
					deleted: false,
					stored_at: null
				})
				.lean(true),
			this.epcOutboundModel.findWithDeleted(filterQuery, { _id: 0, epc: 1, stored_at: 1 }).lean(true)
		])

		const undeletedSubQuery = this.dataSourceDL
			.createQueryBuilder()
			.select([/* SQL */ `value AS EPC_Code`])
			.from(/* SQL */ `OPENJSON(N'${SuperJson.stringify(undeletedEpcs)}')`, 'a')
			.disableEscaping()

		const scannedEpcQuery = this.dataSourceDL
			.createQueryBuilder()
			.select(/* SQL */ `JSON_VALUE(value, '$.epc')`, 'EPC_Code')
			.addSelect(/* SQL */ `JSON_VALUE(value, '$.stored_at')`, 'stored_at')
			.addSelect(/* SQL */ `CAST(1 AS BIT)`, 'scanned')
			.from(/* SQL */ `OPENJSON(N'${SuperJson.stringify(deletedEpcs)}')`, 'e')
			.disableEscaping()

		const queryBuilder = await this.dataSourceDL
			.createQueryBuilder()
			.addCommonTableExpression(undeletedSubQuery.getQuery(), 'undeleted_epcs')
			.addCommonTableExpression(scannedEpcQuery.getQuery(), 'scanned_epcs')
			.select([
				'DISTINCT a.EPC_Code AS epc',
				'a.mo_no AS mo_no',
				'a.size_code AS size_numcode',
				'c.color_sn AS color_sn',
				'd.shoestyle_codefactory AS factory_shoes_style',
				'CAST(COALESCE(e.scanned, 0) AS BIT) AS scanned',
				'e.stored_at AS stored_at'
			])
			.from('dv_InvRFIDrecorddet_backup_Daily', 'a')
			// .innerJoin('dv_rfidmatchmst_cust', 'b', /* SQL */ `a.EPC_Code = b.EPC_Code`)
			.leftJoin(
				(qb) => {
					return qb
						.subQuery()
						.select('mo_no')
						.addSelect('mat_code')
						.from('wuerp_vnrd.dbo.ta_manufacturmst', 'b')
						.where(/* SQL */ `isactive = 'Y'`)
						.andWhere(/* SQL */ `created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
				},
				'b',
				/* SQL */ `a.mo_no = b.mo_no`
			)
			.leftJoin(
				(qb) => {
					return qb
						.subQuery()
						.select('color_sn')
						.addSelect('mat_code')
						.addSelect('shoestyle_systemcodefty')
						.from('wuerp_vnrd.dbo.ta_productmst', 'c')
						.where(/* SQL */ `c.isactive = 'Y'`)
				},
				'c',
				/* SQL */ `c.mat_code = b.mat_code`
			)
			.leftJoin(
				(qb) => {
					return qb
						.subQuery()
						.select('shoestyle_systemcodefty')
						.addSelect('shoestyle_codefactory')
						.from('wuerp_vnrd.dbo.ta_shoefactorymst', 'd')
						.where(/* SQL */ `isactive = 'Y'`)
				},
				'd',
				/* SQL */ `d.shoestyle_systemcodefty = c.shoestyle_systemcodefty`
			)
			.leftJoin(
				(qb) => qb.select(['EPC_Code', 'stored_at', 'scanned']).from('scanned_epcs', 'e'),
				'e',
				/* SQL */ `a.EPC_Code = e.EPC_Code`
			)
			.where(/* SQL */ `a.rfid_status = 'A'`)
			.andWhere(/* SQL */ `RIGHT(a.station_no, 3) = '101'`)
			.andWhere(/* SQL */ `LEFT(a.EPC_Code, 3) <> 'E28'`)
			.andWhere(/* SQL */ `LEFT(a.EPC_Code, 6) <> '303429'`)
			.andWhere(/* SQL */ `NOT EXISTS (SELECT 1 FROM undeleted_epcs WHERE EPC_Code = a.EPC_Code)`)
			.andWhere(
				new Brackets((qb) => {
					// * Filter by EPC code (search query)
					if (args.q) {
						qb.andWhere(/* SQL */ `a.EPC_Code LIKE '%${args.q}%'`)
					}
					// * Filter by manufacturing order number
					if (args['mo_no.eq']) {
						qb.andWhere(/* SQL */ `a.mo_no = '${args['mo_no.eq']}'`)
					}
					// * Filter by size number code
					if (args['size_numcode.eq']) {
						qb.andWhere(/* SQL */ `a.size_numcode = '${args['size_numcode.eq']}'`)
					}
					// * Filter by shoes style code (factory)
					if (args['shoes_style.eq']) {
						qb.andWhere(/* SQL */ `d.shoestyle_codefactory = '${args['shoes_style.eq']}'`)
					}
					// * Filter by color serial number
					if (args['color_sn.eq']) {
						qb.andWhere(/* SQL */ `c.color_sn = '${args['color_sn.eq']}'`)
					}
					// * Filter by scanned status (boolean)
					if (typeof args['scanned.eq'] === 'boolean') {
						qb.andWhere(/* SQL */ `CAST(COALESCE(e.scanned, 0) AS BIT) = ${args['scanned.eq'] ? 1 : 0}`)
					}
					return qb
				})
			)
			.andWhere(
				/* SQL */ `NOT EXISTS (
					SELECT 1 FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
					WHERE EPC_Code = a.EPC_Code
					AND rfid_status = 'B'
					AND RIGHT(stationNO, 3) = '103'
				)`
			)
			.orderBy(/* SQL */ `CAST(COALESCE(e.scanned, 0) AS BIT)`, 'DESC')
			.addOrderBy('a.mo_no', 'DESC')
			.addOrderBy('a.size_code', 'ASC')
			.addOrderBy('d.shoestyle_codefactory', 'ASC')
			.addOrderBy('c.color_sn', 'ASC')
			.addOrderBy('a.EPC_Code', 'ASC')
			.offset((args.page - 1) * args.limit)
			.limit(args.limit)

		const [data, totalDocs] = await Promise.all([queryBuilder.getRawMany<EpcInformation>(), queryBuilder.getCount()])

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

	private async getIsOrderCompleted(purchaseOrder: string): Promise<boolean> {
		const inboundQueryCTE = this.dataSourceDL
			.getRepository(RFIDInventoryBackupEntity)
			.createQueryBuilder('a')
			.select([/* SQL */ `a.po`, /* SQL */ `COUNT(DISTINCT a.EPC_Code) AS acc_outbound_qty`])
			.where(/* SQL */ `a.rfid_status = '${InventoryActions.OUTBOUND}'`)
			.andWhere(/* SQL */ `RIGHT(a.stationNO, 3) = '103'`)
			.andWhere(/* SQL */ `a.po = '${purchaseOrder}'`)
			.groupBy('a.po')

		const purchaseOrderDetailQueryCTE = this.dataSourceERP
			.createQueryBuilder()
			.select([
				/* SQL */ `IIF(ISNULL(b.or_custpoone, '') = '', b.or_custpo, b.or_custpoone) AS po`,
				/* SQL */ `CAST(SUM(b.or_totalqty) - SUM(b.or_totalcqty) AS INT) AS po_qty`
			])
			.from('wuerp_vnrd.dbo.ta_ordermst', 'b')
			.where(/* SQL */ `b.isactive = 'Y'`)
			.andWhere(/* SQL */ `IIF(ISNULL(b.or_custpoone, '') = '', b.or_custpo, b.or_custpoone) = '${purchaseOrder}'`)
			.groupBy(/* SQL */ `IIF(ISNULL(b.or_custpoone, '') = '', b.or_custpo, b.or_custpoone)`)

		const result = await this.dataSourceDL
			.createQueryBuilder()
			.addCommonTableExpression(inboundQueryCTE.getQuery(), 'outbound_qty_cte')
			.addCommonTableExpression(purchaseOrderDetailQueryCTE.getQuery(), 'po_qty_cte')
			.select([
				/* SQL */ `a.po AS po`,
				/* SQL */ `b.po_qty AS po_qty`,
				/* SQL */ `b.po_qty - a.acc_outbound_qty AS missing_qty`
			])
			.from((qb) => qb.subQuery().select().from('outbound_qty_cte', 'a'), 'a')
			.leftJoin((qb) => qb.subQuery().select().from('po_qty_cte', 'b'), 'b', /* SQL */ `a.po = b.po`)
			.getRawMany<{ po: string; po_qty: number; missing_qty: number }>()

		return result[0]?.missing_qty === 0
	}
}
