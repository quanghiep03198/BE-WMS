import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IStockTransactionMongoRepository } from '@modules/finished-goods/application/ports/stock-transaction-mongo.repository.port'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { AnyBulkWriteOperation, mongo, type MongooseBulkWriteOptions } from 'mongoose'

import { SuperJson } from '@common/utils'
import {
	INVENTORY_LEDGER_MG_REPOSITORY,
	IPendingInventoryFluctuation
} from '@modules/finished-goods/application/ports/inventory-ledger-mongo.repository.port'
import { SHIPPING_PROGRESS_MONGO_REPOSITORY } from '@modules/finished-goods/application/ports/shipping-progress-mongo.repository.port'
import { IStockTransaction } from '@modules/finished-goods/application/types'
import { InjectRedisClient } from '@redis/decorators'
import { format } from 'date-fns'
import Redis from 'ioredis'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import { InventoryLedgerMongoRepository } from './inventory-ledger-mongo.repository'
import { ShippingProgressMongoRepository } from './shipping-progress-mongo.repository'

@Injectable()
export class StockTransactionMongoRepository implements IStockTransactionMongoRepository {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@Inject(INVENTORY_LEDGER_MG_REPOSITORY)
		private readonly inventoryLedgerMongoRepository: InventoryLedgerMongoRepository,
		@Inject(SHIPPING_PROGRESS_MONGO_REPOSITORY)
		private readonly shippingProgressMongoRepository: ShippingProgressMongoRepository,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>,
		@InjectPinoLogger(StockTransactionMongoRepository.name)
		private readonly logger: PinoLogger,
		@InjectRedisClient()
		private readonly redisClient: Redis
	) {}

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
			retryWrites: true,
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
				reversed: false
			} satisfies IStockTransaction<'inbound'>)
		)

		// * Apply expiry after writes to avoid missing TTL when key is first created by RPUSH.
		const expiryTime = Math.floor(new Date().setHours(23, 0, 0, 0) / 1000)
		const inboundTtl = await this.redisClient.ttl('transactions:inbound')
		if (inboundTtl < 0) await this.redisClient.expireat('transactions:inbound', expiryTime)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockOut(transactionId: string, pendingShipOutEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkWriteOperations: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingShipOutEpcs.map((epc) => ({
			updateOne: {
				filter: { epc: epc.getStockKeepingUnit(), status: FinishedGoodsEpcStatus.SCANNING, outbound_at: null },
				update: {
					outbound_at: new Date(),
					po: epc.getPurchaseOrder(),
					status: FinishedGoodsEpcStatus.SHIPPED,
					scannable: false,
					ship_out_tx: transactionId
				}
			}
		}))

		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		}

		await this.finishedGoodsEpcModel.bulkWrite(bulkWriteOperations, bulkWriteConcernSettings)
		const pendingInventoryFluctuation = (await this.inventoryLedgerMongoRepository.getPendingInventoryFluctuation(
			pendingShipOutEpcs
		)) as Array<IPendingInventoryFluctuation>
		const balances = await this.inventoryLedgerMongoRepository.commitInventoryLedgerOnStockOut(pendingShipOutEpcs)
		await this.shippingProgressMongoRepository.applyShippingProgressForStockOut(pendingInventoryFluctuation)

		for (const blc of balances) {
			await this.redisClient.lpush(
				`transactions:outbound`,
				SuperJson.stringify({
					id: transactionId,
					mo_no: blc.mo_no,
					po: blc.po,
					qty: Object.values(blc.size_ledger).reduce((sum, item) => sum + item.stocked_in_qty, 0),
					changes: blc.size_ledger,
					tx_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
					tx_type: 'stock_out',
					reversed: false
				} satisfies IStockTransaction<'outbound'>)
			)
		}

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
				reversed: false
			} satisfies IStockTransaction<'inbound'>)
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
			const parsedItem = SuperJson.parse(item) as IStockTransaction<'inbound'>
			return parsedItem.id === transactionId
		})

		if (!inboundStockTransactions) return

		const transaction = SuperJson.parse<IStockTransaction<'inbound'>>(inboundStockTransactions)

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
			SuperJson.stringify({ ...transaction, reversed: true })
		)

		return epcsToRollback
	}
}
