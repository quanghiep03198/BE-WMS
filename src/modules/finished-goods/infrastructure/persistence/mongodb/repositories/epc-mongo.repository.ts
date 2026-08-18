import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IEpcMongoRepository } from '@modules/finished-goods/application/ports/epc-mongo.repository.port'
import { GetScanningEpcsBySizeQuery } from '@modules/finished-goods/application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { FALLBACK_VALUE, FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { StockFlow, UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cache } from 'cache-manager'
import { FilterQuery, PipelineStage, mongo } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { FinishedGoodsEpcMatch, FinishedGoodsEpcMatchModel } from '../schemas/epc-match.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'

@Injectable()
export class EpcMongoRepository implements IEpcMongoRepository {
	constructor(
		@InjectPinoLogger(EpcMongoRepository.name) private readonly logger: PinoLogger,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(FinishedGoodsEpcMatch.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcMatchModel: FinishedGoodsEpcMatchModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache
	) {}

	public async getEpcsInformation(epcs: Array<string>): Promise<
		Array<{
			epc: string
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			size_numcode: string
			factory_code_produce: string
		}>
	> {
		const data = await this.finishedGoodsEpcMatchModel
			.find(
				{ epc: { $in: epcs } },
				{ epc: 1, mo_no: 1, factory_code_produce: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1 }
			)
			.lean(true)

		const dataByEpc = new Map(data.map((item) => [item.epc, item]))

		return epcs.map((epc) => {
			const matched = dataByEpc.get(epc)

			return (
				matched ?? {
					epc,
					factory_code_produce: FALLBACK_VALUE,
					mo_no: FALLBACK_VALUE,
					factory_shoes_style: FALLBACK_VALUE,
					color_sn: FALLBACK_VALUE,
					size_numcode: FALLBACK_VALUE
				}
			)
		})
	}

	public async getPendingStockMoveEpcs(
		deviceSerialNumber: string,
		manufacturingOrder: string,
		assemblyLine?: `${string}/${string}`,
		storageLocation?: `${string}/${string}`
	): Promise<ElectronicProductCode[]> {
		const rawData = await this.finishedGoodsEpcModel
			.find({
				scannable: true,
				inbound_device_sn: deviceSerialNumber,
				mo_no: manufacturingOrder,
				storage_location: null
			})
			.lean()

		return ElectronicProductCode.createFactory(
			rawData.map((item) => ({
				sku: item.epc,
				attributes: {
					scannable: item.scannable,
					mo_no: item.mo_no,
					factory_shoes_style: item.factory_shoes_style,
					color_sn: item.color_sn,
					size_numcode: item.size_numcode,
					factory_code_produce: item.factory_code_produce,
					assembly_line: assemblyLine,
					storage_location: storageLocation,
					po: item.po
				}
			}))
		).filter((item) => item.getIsWritable())
	}

	public async getPendingShipOutEpcs(
		purchaseOrder: string,
		manufacturingOrders: string | Array<string>,
		outboundSizeQuantities?: Array<{ size_numcode: string; qty: number }>
	): Promise<ElectronicProductCode[]> {
		const baseFilterQuery: FilterQuery<FinishedGoodsEpcDocument> = {
			scannable: true,
			status: FinishedGoodsEpcStatus.SCANNING,
			inbound_times: { $gte: 1 }
		}

		this.logger.info(`Is outboundSizeQuantities an array? ${Array.isArray(outboundSizeQuantities)}`)

		if (!Array.isArray(outboundSizeQuantities)) {
			const pendingOutboundEpcs = await this.finishedGoodsEpcModel
				.find({
					...baseFilterQuery,
					mo_no: {
						...(Array.isArray(manufacturingOrders)
							? { $in: manufacturingOrders }
							: typeof manufacturingOrders === 'string'
								? { $eq: manufacturingOrders }
								: {})
					}
				})
				.lean(true)

			return ElectronicProductCode.createFactory(
				pendingOutboundEpcs.map((item) => ({
					sku: item.epc,
					attributes: {
						mo_no: item.mo_no,
						factory_shoes_style: item.factory_shoes_style,
						color_sn: item.color_sn,
						size_numcode: item.size_numcode,
						factory_code_produce: item.factory_code_produce,
						po: purchaseOrder
					}
				}))
			)
		}

		const facetPipeline = outboundSizeQuantities.reduce<PipelineStage.Facet['$facet']>((acc, curr) => {
			return {
				...acc,
				[curr.size_numcode.replace('.', '')]: [
					{ $match: { ...baseFilterQuery, mo_no: manufacturingOrders, size_numcode: curr.size_numcode } },
					{
						$project: {
							_id: 0,
							epc: 1,
							mo_no: 1,
							po: 1,
							size_numcode: 1,
							station_no: 1,
							factory_code_produce: 1
						}
					},
					{ $limit: curr.qty }
				]
			}
		}, {})
		const aggregatedEpcData = await this.finishedGoodsEpcModel.aggregateWithDeleted([{ $facet: facetPipeline }])
		const extractedValues = Object.values<Partial<FinishedGoodsEpcDocument>[]>(aggregatedEpcData[0])
		const pendingOutboundEpcs = extractedValues.every((facetGroup) => Array.isArray(facetGroup))
			? extractedValues.flat()
			: []

		return ElectronicProductCode.createFactory(
			pendingOutboundEpcs.map((item) => ({
				sku: item.epc,
				attributes: {
					mo_no: item.mo_no,
					factory_shoes_style: item.factory_shoes_style,
					color_sn: item.color_sn,
					size_numcode: item.size_numcode,
					factory_code_produce: item.factory_code_produce,
					po: purchaseOrder
				}
			}))
		)
	}

	public async getPendingExchangeEpcs(query: {
		deviceSerialNumber: string
		manufacturingOrder: string
		sizeNumber: string
		quantity: number
	}): Promise<
		Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	> {
		return await this.finishedGoodsEpcModel.find(
			{
				mo_no: query.manufacturingOrder,
				size_numcode: query.sizeNumber,
				inbound_device_sn: query.deviceSerialNumber,
				deleted: false,
				scannable: true
			},
			{ _id: 0, epc: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1 },
			{ limit: query.quantity, lean: true }
		)
	}

	public async getPendingExchangeMos(
		deviceSerialNumber: string,
		sourceMos: string[]
	): Promise<
		Array<{
			epcs: Array<string>
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			sizes: Array<string>
		}>
	> {
		const epcs = await this.finishedGoodsEpcModel
			.find(
				{
					inbound_device_sn: deviceSerialNumber,
					mo_no: { $in: sourceMos },
					scannable: true
				},
				{ epc: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1, _id: 0 }
			)
			.lean()

		const result = Object.entries(
			Object.groupBy(epcs, (item) => `${item.mo_no}/${item.factory_shoes_style}/${item.color_sn}`)
		).map(([aggregateAttributes, value]) => {
			const [mo_no, factory_shoes_style, color_sn] = aggregateAttributes.split('/')
			return {
				epcs: [...new Set(value.map((item) => item.epc))],
				mo_no,
				factory_shoes_style,
				color_sn,
				sizes: [...new Set(value.map((item) => item.size_numcode))].map((size_numcode) => size_numcode)
			}
		})

		return result
	}

	public async getScanningEpcsBySize(query: GetScanningEpcsBySizeQuery): Promise<Array<{ epc: string }>> {
		const queryHint: Record<StockFlow, mongo.Hint> = {
			inbound: 'idx_inbound_active',
			outbound: 'idx_outbound_active'
		}

		const filterQuery: FilterQuery<FinishedGoodsEpcDocument> = {
			scannable: true,
			mo_no: query.manufacturingOrder,
			size_numcode: query.sizeNumber,
			status: FinishedGoodsEpcStatus.SCANNING
		}

		if (query.stockFlow === 'inbound' && query.inboundDeviceSerialNumber) {
			filterQuery.inbound_device_sn = { $eq: query.inboundDeviceSerialNumber }
			filterQuery.storage_location = { $eq: null }
		}

		if (query.stockFlow === 'outbound') {
			filterQuery.outbound_at = { $eq: null }
			filterQuery.po = { $eq: null }
		}

		return await this.finishedGoodsEpcModel
			.find(filterQuery, { _id: 0, epc: 1 }, { lean: true, limit: query.limit ?? 0 })
			.hint(queryHint[query.stockFlow])
	}

	public async bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: StockFlow
		payload: {
			epcs: Array<{
				epc: string
				mo_no: string
				factory_shoes_style: string
				color_sn: string
				size_numcode: string
				factory_code_produce: string
			}>
			deviceSerialNumber: string
		}
	}): Promise<void> {
		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')

		const bulkWriteOptions = payload.epcs.map((item) => ({
			updateOne: {
				filter: { epc: item.epc, scannable: true },
				update: {
					epc: item.epc,
					mo_no: item.mo_no,
					factory_shoes_style: item.factory_shoes_style,
					color_sn: item.color_sn,
					size_numcode: item.size_numcode,
					last_scanned_at: new Date(),
					factory_code_produce: item.factory_code_produce,
					status: FinishedGoodsEpcStatus.SCANNING,
					...(action === 'inbound' && {
						inbound_device_sn: payload.deviceSerialNumber,
						storage_location: null,
						...(!isDeduplicationEnabled && { deleted: false })
					}),
					...(action === 'outbound' && {
						outbound_device_sn: payload.deviceSerialNumber
					})
				},
				setDefaultsOnInsert: false,
				upsert: true,
				...(action === 'inbound' && isDeduplicationEnabled && { overwriteImmutable: true })
			}
		}))

		await this.finishedGoodsEpcModel.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}

	public async exchangeManufacturingOrder(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void> {
		await this.finishedGoodsEpcMatchModel.updateMany({ epc: { $in: pendingExchangeEpcs } }, [
			{ $set: { old_mo_no: '$mo_no' } },
			{ $set: { mo_no: targetMo } }
		])

		await this.finishedGoodsEpcModel.updateMany({ epc: { $in: pendingExchangeEpcs } }, { mo_no: targetMo })
	}

	public async upsertEpcsMatch(data: UpsertEpcsMatchData, insertOnly: boolean = false): Promise<void> {
		this.logger.debug(data)

		await this.finishedGoodsEpcMatchModel.bulkWrite(
			data.map((item) => ({
				updateOne: {
					filter: { epc: item.epc },
					update: [
						{ $set: { old_mo_no: '$mo_no' } },
						...(insertOnly
							? []
							: [
									{
										$set: {
											mo_no: item.mo_no,
											factory_code_produce: item.factory_code_produce,
											cust_shoes_style: item.cust_shoes_style,
											factory_shoes_style: item.factory_shoes_style,
											color_sn: item.color_sn,
											size_numcode: item.size_numcode
										}
									}
								])
					],
					upsert: insertOnly
				}
			})),
			{
				ordered: false,
				retryWrites: true,
				timestamps: true
			}
		)

		await this.finishedGoodsEpcModel.bulkWrite(
			data.map((item) => ({
				updateOne: {
					filter: { epc: item.epc },
					update: {
						$set: {
							mo_no: item.mo_no,
							factory_code_produce: item.factory_code_produce,
							cust_shoes_style: item.cust_shoes_style,
							factory_shoes_style: item.factory_shoes_style,
							color_sn: item.color_sn,
							size_numcode: item.size_numcode
						}
					}
				}
			})),
			{
				ordered: false,
				retryWrites: true,
				timestamps: true
			}
		)
	}
}
