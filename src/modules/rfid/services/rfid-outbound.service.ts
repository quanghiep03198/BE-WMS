import { VALID_EPC_PATTERN } from '@/common/constants/regex'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { readFileSync } from 'fs'
import { chunk, omit } from 'lodash'
import { FilterQuery, PipelineStage } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { InventoryActions, POST_DATA_OUTBOUND_QUEUE } from '../constants'
import { PostReaderDataDTO, UpsertStockOutDTO } from '../dto/rfid.dto'
import { RFIDInventoryBackupEntity } from '../entities/rifd-inventory.entity'
import { EpcDocument, EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { EpcInformation, RFIDSearchParams } from '../types'

@Injectable()
export class RFIDOutboundService {
	private readonly archivedOutboundEpcQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/archived-outbound-epc.sql')),
		'utf-8'
	)
	private readonly archivedOutboundEpcCountQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/archived-outbound-epc-count.sql')),
		'utf-8'
	)

	constructor(
		private readonly logger: PinoLogger,
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
			$and: [
				{ epc: { $regex: VALID_EPC_PATTERN, $options: 'i' } },
				...(!!args.q ? [{ epc: { $regex: args.q, $options: 'i' } }] : [])
			],
			factory_code_produce: factoryCode,
			po: null,

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
		const parameters = [
			JSON.stringify(undeletedEpcs),
			JSON.stringify(deletedEpcs),
			(args['page'] - 1) * args['limit'],
			args.limit,
			args.q ?? null,
			args['shoes_style.eq'] ?? null,
			args['color_sn.eq'] ?? null,
			args['size_numcode.eq'] ?? null,
			args['mo_no.eq'] ?? null,
			typeof args['scanned.eq'] === 'undefined'
				? null
				: typeof args['scanned.eq'] === 'boolean' && args['scanned.eq']
					? 1
					: 0
		]

		const [data, totalDocs] = await Promise.all([
			this.dataSourceDL.query<EpcInformation[]>(this.archivedOutboundEpcQuery, parameters),
			this.dataSourceDL
				.query<Array<{ count: number }>>(this.archivedOutboundEpcCountQuery, parameters)
				.then((result) => result[0]?.count ?? 0)
		])

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
