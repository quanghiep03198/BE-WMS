import { VALID_EPC_PATTERN } from '@common/constants/regex'
import { RequestUser } from '@common/decorators'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IUpsertInventoryEventPayload } from '@modules/inventory/interfaces'
import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { chunk, omit } from 'lodash'
import { FilterQuery, PipelineStage } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { DataSource } from 'typeorm'
import { POST_DATA_OUTBOUND_QUEUE } from '../../infrastructure/constants/queue'
import {
	EpcDocument,
	EpcModel,
	EpcOutbound
} from '../../infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import archivedOutboundEpcCountQuery from '../../infrastructure/persistence/mssql/sql/archived-outbound-epc-count.sql'
import archivedOutboundEpcQuery from '../../infrastructure/persistence/mssql/sql/archived-outbound-epc.sql'
import poOutboundProgessQuery from '../../infrastructure/persistence/mssql/sql/po-outbound-progess.sql'
import upsertOutboundQuery from '../../infrastructure/persistence/mssql/sql/upsert-outbound.sql'
import { EpcInformation, RFIDSearchParams } from '../../infrastructure/types'
import { UpsertStockOutDTO } from '../../presentation/dto/rfid-outbound.dto'
import { PostReaderDataDTO } from '../../presentation/dto/rfid-shared.dto'
@Injectable()
export class RFIDOutboundService {
	private readonly archivedOutboundEpcQuery: string = archivedOutboundEpcQuery
	private readonly archivedOutboundEpcCountQuery: string = archivedOutboundEpcCountQuery
	private readonly missingOutboundQtyQuery: string = poOutboundProgessQuery

	constructor(
		private readonly logger: PinoLogger,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE)
		private readonly postDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcOutbound.name, DATA_WAREHOUSE_CONNECTION) private readonly epcOutboundModel: EpcModel,
		private readonly i18nService: I18nService,
		private readonly eventEmitter: EventEmitter2
	) {}

	public async postOutboundRFIDData(payload: PostReaderDataDTO) {
		return await this.postDataQueue.add('RFID_OUTBOUND', payload)
	}

	public async upsertStockOut(
		factoryCode: string,
		payload: UpsertStockOutDTO & Pick<RequestUser, 'username' | 'display_name'>
	) {
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
				return (await this.epcOutboundModel
					.findWithDeleted({ ...baseFilterQuery, mo_no: payload.mo_no })
					.lean(true)) as Awaited<Partial<EpcDocument>[]>
			}

			const facetPipeline = payload.sizes.reduce<PipelineStage.Facet['$facet']>((acc, curr) => {
				return {
					...acc,
					[curr.size_numcode.replace('.', '')]: [
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
			const extractedValues = Object.values<Partial<EpcDocument>[]>(aggregatedEpcData[0])
			return extractedValues.every((facetGroup) => Array.isArray(facetGroup)) ? extractedValues.flat() : []
		})()

		const session = await this.epcOutboundModel.startSession()
		const queryRunner = this.dataSourceDL.createQueryRunner()
		const upsertStockoutQuery: string = upsertOutboundQuery

		const missingOutboundQty = await this.getPurchaseOrderOutboundProgress(payload.po, epcToUpsert)

		const excessOutboundQuantities = missingOutboundQty.filter((size) => size.missing_qty < 0)

		if (excessOutboundQuantities.length > 0)
			throw new BadRequestException(
				this.i18nService.t('inoutbound.notification.over_outbound_limit', {
					lang: I18nContext.current()?.lang
				}),
				{ cause: excessOutboundQuantities }
			)

		try {
			await session.startTransaction()
			await queryRunner.startTransaction()

			const data = epcToUpsert.map((value) => {
				return {
					...value,
					factory_code: factoryCode,
					po: payload.po
				}
			})

			for (const item of chunk(data, 100)) {
				await this.dataSourceDL.query(upsertStockoutQuery, [JSON.stringify(item)])
			}

			const outboundTime = new Date()

			await this.epcOutboundModel
				.updateMany(
					{ ...baseFilterQuery, epc: { $in: epcToUpsert.map((item) => item.epc) } },
					{ $set: { deleted: true, stored_at: outboundTime, factory_code_produce: factoryCode, po: payload.po } }
				)
				.exec()

			// TODO: update inventory audit table to reflect outbound action

			await queryRunner.commitTransaction()
			await session.commitTransaction()

			if (typeof payload.mo_no === 'string' && Array.isArray(payload.sizes))
				await this.eventEmitter.emitAsync('inventory.outbound', {
					po: payload.po,
					mo_no: payload.mo_no,
					sizes: payload.sizes.map((item) => item.size_numcode),
					username: payload.username,
					display_name: payload.display_name
				} satisfies Required<IUpsertInventoryEventPayload>)
			if (Array.isArray(payload.mo_no)) {
				const scannedOrderSizes = await this.epcOutboundModel
					.aggregateWithDeleted<{ mo_no: string; sizes: string[] }>([
						{
							$match: {
								mo_no: { $in: payload.mo_no },
								po: payload.po,
								factory_code_produce: factoryCode,
								stored_at: { $eq: outboundTime },
								deleted: true,
								scannable: true
							}
						},
						{
							$group: {
								_id: '$mo_no',
								sizes: {
									$addToSet: '$size_numcode'
								}
							}
						},
						{
							$project: {
								_id: 0,
								mo_no: '$_id',
								sizes: 1
							}
						}
					])
					.exec()
				for (const item of scannedOrderSizes) {
					await this.eventEmitter.emitAsync('inventory.outbound', {
						...item,
						po: payload.po,
						username: payload.username,
						display_name: payload.display_name
					} satisfies Required<IUpsertInventoryEventPayload>)
				}
			}
		} catch (error) {
			this.logger.error(error)
			if (session.inTransaction()) await session.abortTransaction()
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException((error as Error).message)
		} finally {
			if (!session.hasEnded) await session.endSession()
			if (!queryRunner.isReleased) await queryRunner.release()
		}
	}

	public async getArchivedEpcs(factoryCode: string, args: RFIDSearchParams & { 'scanned:eq'?: boolean }) {
		const filterQuery: FilterQuery<EpcDocument> = {
			deleted: true,
			scannable: true,
			$and: [
				{ epc: { $regex: VALID_EPC_PATTERN, $options: 'i' } },
				...(!!args['epc:contains'] ? [{ epc: { $regex: args['epc:contains'], $options: 'i' } }] : [])
			],
			factory_code_produce: factoryCode,
			po: null,

			...(args['mo_no:eq'] && { mo_no: args['mo_no:eq'] }),
			...(args['size_numcode:eq'] && { size_numcode: args['size_numcode:eq'] }),
			...(args['shoes_style:eq'] && { factory_shoes_style: args['shoes_style:eq'] }),
			...(args['color_sn:eq'] && { color_sn: args['color_sn:eq'] })
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
			(args['_page'] - 1) * args['_limit'],
			args._limit,
			args['epc:contains'] ?? null,
			args['shoes_style:eq'] ?? null,
			args['color_sn:eq'] ?? null,
			args['size_numcode:eq'] ?? null,
			args['mo_no:eq'] ?? null,
			typeof args['scanned:eq'] === 'undefined'
				? null
				: typeof args['scanned:eq'] === 'boolean' && args['scanned:eq']
					? 1
					: 0
		]

		const [data, totalDocs] = await Promise.all([
			this.dataSourceDL.query<EpcInformation[]>(this.archivedOutboundEpcQuery, parameters),
			this.dataSourceDL
				.query<Array<{ count: number }>>(this.archivedOutboundEpcCountQuery, parameters)
				.then((result) => result[0]?.count ?? 0)
		])

		const totalPages = Math.ceil(totalDocs / args._limit)

		return {
			data,
			totalDocs,
			totalPages,
			page: args._page,
			limit: args._limit,
			hasNextPage: args._page < totalPages,
			hasPrevPage: args._page > 1,
			nextPage: args._page < totalPages ? args._page + 1 : null,
			prevPage: args._page > 1 ? args._page - 1 : null
		} satisfies Pagination<EpcInformation>
	}

	private async getPurchaseOrderOutboundProgress(purchaseOrder: string, outboundEpcs: Partial<EpcDocument>[]) {
		return await this.dataSourceERP.query<Array<{ size_numcode: string; missing_qty: number }>>(
			this.missingOutboundQtyQuery,
			[purchaseOrder, JSON.stringify(outboundEpcs)]
		)
	}
}
