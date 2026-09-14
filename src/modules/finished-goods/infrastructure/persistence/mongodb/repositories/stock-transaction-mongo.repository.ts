import { SuperJson } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	INVENTORY_LEDGER_REPOSITORY,
	IPendingInventoryFluctuation
} from '@modules/finished-goods/application/ports/inventory-ledger.repository.port'
import { SHIPPING_PROGRESS_REPOSITORY } from '@modules/finished-goods/application/ports/shipping-progress.repository.port'
import { IStockTransactionRepository } from '@modules/finished-goods/application/ports/stock-transaction.repository.port'
import { IInoutboundTransaction } from '@modules/finished-goods/application/types'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectRedisClient } from '@redis/decorators'
import { format } from 'date-fns'
import Redis from 'ioredis'
import { AnyBulkWriteOperation, mongo, type FilterQuery, type MongooseBulkWriteOptions } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import { InventoryLedgerRepository } from './inventory-ledger.repository'
import { ShippingProgressMongoRepository } from './shipping-progress-mongo.repository'

@Injectable()
export class StockTransactionMongoRepository implements IStockTransactionRepository {
	constructor(
		@InjectPinoLogger(StockTransactionMongoRepository.name) private readonly logger: PinoLogger,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@Inject(INVENTORY_LEDGER_REPOSITORY)
		private readonly inventoryLedgerMongoRepository: InventoryLedgerRepository,
		@Inject(SHIPPING_PROGRESS_REPOSITORY)
		private readonly shippingProgressMongoRepository: ShippingProgressMongoRepository,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>,
		@InjectRedisClient()
		private readonly redisClient: Redis
	) {}

	public async getStockTransactionById(
		stockFlow: StockFlow,
		transactionId: string
	): Promise<IPendingInventoryFluctuation | Array<IPendingInventoryFluctuation>> {
		const filterQueryMap: Map<StockFlow, FilterQuery<FinishedGoodsEpcDocument>> = new Map([
			['inbound', { status: { $in: [FinishedGoodsEpcStatus.IN_STOCK, FinishedGoodsEpcStatus.RECALLED] } }],
			['outbound', { status: { $eq: FinishedGoodsEpcStatus.SHIPPED } }]
		])

		const data = await this.finishedGoodsEpcModel.aggregate<IPendingInventoryFluctuation>([
			{ $match: { last_tx: transactionId, ...filterQueryMap.get(stockFlow) } },
			{
				$group: {
					_id: {
						mo_no: '$mo_no',
						factory_code_produce: '$factory_code_produce',
						factory_shoes_style: '$factory_shoes_style',
						color_sn: '$color_sn',
						size_numcode: '$size_numcode'
					},
					po: { $first: '$po' },
					stocked_in_qty: {
						$sum: {
							$cond: [
								{
									$and: [{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] }, { $eq: ['$inbound_times', 1] }]
								},
								1,
								0
							]
						}
					},
					total_recall_tx: {
						$sum: {
							$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.RECALLED] }, 1, 0]
						}
					},
					total_return_tx: {
						$sum: {
							$cond: [
								{
									$and: [{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] }, { $gt: ['$inbound_times', 1] }]
								},
								1,
								0
							]
						}
					},
					shipped_out_qty: {
						$sum: {
							$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.SHIPPED] }, 1, 0]
						}
					}
				}
			},
			{
				$group: {
					_id: {
						mo_no: '$_id.mo_no',
						factory_code_produce: '$_id.factory_code_produce',
						factory_shoes_style: '$_id.factory_shoes_style',
						color_sn: '$_id.color_sn'
					},
					po: { $first: '$po' },
					size_ledger: {
						$push: {
							k: '$_id.size_numcode',
							v: {
								stocked_in_qty: '$stocked_in_qty',
								total_recall_tx: '$total_recall_tx',
								total_return_tx: '$total_return_tx',
								shipped_out_qty: '$shipped_out_qty'
							}
						}
					}
				}
			},
			{
				$project: {
					_id: 0,
					mo_no: '$_id.mo_no',
					po: {
						$cond: {
							if: { $eq: ['$po', null] },
							then: '$$REMOVE',
							else: '$po'
						}
					},
					size_ledger: { $arrayToObject: '$size_ledger' }
				}
			}
		])

		return data.length === 1 ? data[0] : data
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockIn(transactionId: string, pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkUpdateEpcOperators: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingStockInEpcs.map(
			(epc) => ({
				updateOne: {
					filter: { epc: epc.getStockKeepingUnit() },
					update: [
						{
							$set: {
								status: {
									$cond: [
										{ $in: ['$status', [FinishedGoodsEpcStatus.SCANNING, FinishedGoodsEpcStatus.RECALLED]] },
										FinishedGoodsEpcStatus.IN_STOCK,
										'$status'
									]
								},
								inbound_times: { $add: [{ $ifNull: ['$inbound_times', 0] }, 1] },
								last_tx: transactionId
							}
						},
						{
							$set: {
								inbound_at: {
									$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.SCANNING] }, '$inbound_at', '$$NOW']
								},
								assembly_line: {
									code: epc.getAssemblyLine('code'),
									name: epc.getAssemblyLine('name', 'sanitized')
								},
								storage_location: { code: epc.getStorageLocation('code'), name: epc.getStorageLocation('name') }
							}
						},
						{
							$set: {
								returned_at: {
									$cond: [
										{
											$and: [
												{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] },
												{ $gt: ['$inbound_times', 1] }
											]
										},
										'$$NOW',
										'$returned_at'
									]
								}
							}
						},
						{
							$set: {
								recalled_at: {
									$cond: [
										{
											$and: [
												{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] },
												{ $gt: ['$inbound_times', 1] },
												{ $in: [{ $type: '$recalled_at' }, ['null', 'undefined', 'missing']] }
											]
										},
										'$$NOW',
										'$recalled_at'
									]
								}
							}
						}
					]
				}
			})
		)

		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			timestamps: true
		}

		await this.finishedGoodsEpcModel.bulkWrite(bulkUpdateEpcOperators, bulkWriteConcernSettings)

		const balances = await this.inventoryLedgerMongoRepository.commitInventoryLedgerOnStockIn(
			transactionId,
			pendingStockInEpcs
		)

		await this.redisClient.lpush(
			`transactions:inbound`,
			SuperJson.stringify({
				id: transactionId,
				mo_no: balances.mo_no,
				qty: Object.values(balances.size_ledger).reduce((sum, item) => {
					const stockedInQty = item.stocked_in_qty || item.total_return_tx
					return sum + stockedInQty
				}, 0),
				changes: balances.size_ledger,
				tx_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
				tx_type: 'stock_in',
				voided: false
			} satisfies IInoutboundTransaction<'inbound'>)
		)

		// * Apply expiry after writes to avoid missing TTL when key is first created by RPUSH.
		const expiryTime = Math.floor(new Date().setHours(23, 0, 0, 0) / 1000)
		const inboundTtl = await this.redisClient.ttl('transactions:inbound')
		if (inboundTtl < 0) await this.redisClient.expireat('transactions:inbound', expiryTime)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockOut(
		transactionId: string,
		purchaseOrder: string,
		pendingShipOutEpcs: Array<ElectronicProductCode>
	): Promise<void> {
		const bulkWriteOperations: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingShipOutEpcs.map((epc) => ({
			updateOne: {
				filter: { epc: epc.getStockKeepingUnit(), status: FinishedGoodsEpcStatus.SCANNING, outbound_at: null },
				update: {
					outbound_at: new Date(),
					po: epc.getPurchaseOrder(),
					status: FinishedGoodsEpcStatus.SHIPPED,
					scannable: false,
					last_tx: transactionId
				}
			}
		}))

		await this.finishedGoodsEpcModel.bulkWrite(bulkWriteOperations, {
			session: this.txHost.tx,
			ordered: false,
			timestamps: true
		})

		const balances = await this.inventoryLedgerMongoRepository.commitInventoryLedgerOnStockOut(pendingShipOutEpcs)
		await this.shippingProgressMongoRepository.applyShippingProgressForStockOut(transactionId, balances)

		await this.redisClient.lpush(
			`transactions:outbound`,
			SuperJson.stringify({
				id: transactionId,
				po: purchaseOrder,
				qty: balances.reduce(
					(sum, item) =>
						sum + Object.values(item.size_ledger).reduce((subSum, curr) => subSum + curr.shipped_out_qty, 0),
					0
				),
				changes: balances.map((item) => ({
					mo_no: item.mo_no,
					size_ledger: Object.fromEntries(
						Object.entries(item.size_ledger).map(([size, fluctuation]) => [
							size,
							{ shipped_out_qty: fluctuation.shipped_out_qty }
						])
					)
				})),
				tx_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
				tx_type: 'stock_out',
				voided: false
			} satisfies IInoutboundTransaction<'outbound'>)
		)

		// * Apply expiry after writes to avoid missing TTL when key is first created by RPUSH.
		const expiryTime = Math.floor(new Date().setHours(23, 0, 0, 0) / 1000)
		const outboundTtl = await this.redisClient.ttl('transactions:outbound')
		if (outboundTtl < 0) await this.redisClient.expireat('transactions:outbound', expiryTime)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async recallFromStock(transactionId: string, pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void> {
		await this.finishedGoodsEpcModel.updateMany(
			{ epc: { $in: pendingRecallEpcs.map((e) => e.getStockKeepingUnit()) } },
			{
				recalled_at: new Date(),
				status: FinishedGoodsEpcStatus.RECALLED,
				storage_location: null,
				last_tx: transactionId
			},
			{ session: this.txHost.tx }
		)

		const balances = await this.inventoryLedgerMongoRepository.commitInventoryLedgerOnRecall(
			transactionId,
			pendingRecallEpcs
		)

		await this.redisClient.lpush(
			`transactions:inbound`,
			SuperJson.stringify({
				id: transactionId,
				mo_no: balances.mo_no,
				qty: Object.values(balances.size_ledger).reduce((sum, item) => sum + item.total_recall_tx, 0),
				changes: balances.size_ledger,
				tx_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
				tx_type: 'recall',
				voided: false
			} satisfies IInoutboundTransaction<'inbound'>)
		)

		// * Apply expiry after writes to avoid missing TTL when key is first created by RPUSH.
		const expiryTime = Math.floor(new Date().setHours(23, 0, 0, 0) / 1000)
		const inboundTtl = await this.redisClient.ttl('transactions:inbound')
		if (inboundTtl < 0) await this.redisClient.expireat('transactions:inbound', expiryTime)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async rollbackInboundTransaction(
		transactionId: string
	): Promise<Array<{ epc: string; status: FinishedGoodsEpcStatus }>> {
		const transactionHistory = await this.redisClient.lrange('transactions:inbound', 0, -1)
		const inboundStockTransactions = transactionHistory.find((item) => {
			const parsedItem = SuperJson.parse(item) as IInoutboundTransaction<'inbound'>
			return parsedItem.id === transactionId
		})

		if (!inboundStockTransactions) return

		const transaction = SuperJson.parse<IInoutboundTransaction<'inbound'>>(inboundStockTransactions)

		const epcsToRollback = await this.finishedGoodsEpcModel.find(
			{
				status: { $in: [FinishedGoodsEpcStatus.IN_STOCK, FinishedGoodsEpcStatus.RECALLED] },
				inbound_times: { $gte: 1 },
				last_tx: transactionId
			},
			{ _id: 0, epc: 1, last_tx: 1, status: 1 },
			{ lean: true, session: this.txHost.tx, readPreference: 'primary' }
		)

		if (epcsToRollback.length === 0) return

		await this.finishedGoodsEpcModel.updateMany(
			{ epc: { $in: epcsToRollback.map((item) => item.epc) } },
			[
				{
					$set: {
						inbound_times: {
							$cond: [
								{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] },
								{ $subtract: ['$inbound_times', 1] },
								'$inbound_times'
							]
						},
						status: {
							$cond: [
								{ $eq: ['$status', FinishedGoodsEpcStatus.RECALLED] },
								FinishedGoodsEpcStatus.IN_STOCK,
								FinishedGoodsEpcStatus.SCANNING
							]
						},
						storage_location: {
							$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] }, null, '$storage_location']
						},
						assembly_line: {
							$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] }, null, '$assembly_line']
						}
					}
				}
			],
			{ session: this.txHost.tx }
		)

		await this.inventoryLedgerMongoRepository.rollbackInboundFluctuation(transaction)

		await this.redisClient.lset(
			'transactions:inbound',
			transactionHistory.indexOf(inboundStockTransactions),
			SuperJson.stringify({ ...transaction, voided: true })
		)

		return epcsToRollback
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async rollbackOutboundTransaction(transactionId: string) {
		const transactionHistory = await this.redisClient.lrange('transactions:outbound', 0, -1)
		const inboundStockTransactions = transactionHistory.find((item) => {
			const parsedItem = SuperJson.parse(item) as IInoutboundTransaction<'outbound'>
			return parsedItem.id === transactionId
		})

		if (!inboundStockTransactions) return

		const transaction = SuperJson.parse<IInoutboundTransaction<'outbound'>>(inboundStockTransactions)

		const epcsToRollback = await this.finishedGoodsEpcModel.find(
			{ status: FinishedGoodsEpcStatus.SHIPPED, last_tx: transactionId },
			{ _id: 0, epc: 1, last_tx: 1, status: 1 },
			{ lean: true, session: this.txHost.tx, readPreference: 'primary' }
		)

		if (epcsToRollback.length === 0) return

		await this.finishedGoodsEpcModel.updateMany(
			{ epc: { $in: epcsToRollback.map((item) => item.epc) } },
			[{ $set: { scannable: true, status: FinishedGoodsEpcStatus.SCANNING } }, { $unset: ['po', 'outbound_at'] }],
			{ session: this.txHost.tx }
		)

		await this.inventoryLedgerMongoRepository.rollbackOutboundFluctuation(transaction)

		await this.redisClient.lset(
			'transactions:outbound',
			transactionHistory.indexOf(inboundStockTransactions),
			SuperJson.stringify({ ...transaction, voided: true })
		)

		return epcsToRollback
	}
}
