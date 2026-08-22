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
import { INVENTORY_LEDGER_MG_REPOSITORY } from '@modules/finished-goods/application/ports/inventory-ledger-mongo.repository.port'
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
								stock_in_tx: transactionId
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

		const balances = await this.inventoryLedgerMongoRepository.commitInventoryLedgerOnStockIn(pendingStockInEpcs)

		for (const b of balances) {
			await this.redisClient.lpush(
				`transactions:inbound`,
				SuperJson.stringify({
					id: transactionId,
					mo_no: b.mo_no,
					qty: Object.values(b.size_ledger).reduce((sum, item) => sum + item.stocked_in_qty, 0),
					changes: b.size_ledger,
					tx_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
					tx_type: 'stock_in'
				} satisfies IStockTransaction<'inbound'>)
			)
		}

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
		const pendingInventoryFluctuation =
			await this.inventoryLedgerMongoRepository.getPendingInventoryFluctuation(pendingShipOutEpcs)
		const balances = await this.inventoryLedgerMongoRepository.commitInventoryLedgerOnStockOut(pendingShipOutEpcs)
		await this.shippingProgressMongoRepository.applyShippingProgressForStockOut(pendingInventoryFluctuation)

		for (const b of balances) {
			await this.redisClient.lpush(
				`transactions:outbound`,
				SuperJson.stringify({
					id: transactionId,
					mo_no: b.mo_no,
					po: b.po,
					qty: Object.values(b.size_ledger).reduce((sum, item) => sum + item.stocked_in_qty, 0),
					changes: b.size_ledger,
					tx_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
					tx_type: 'stock_out'
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
				recall_tx: transactionId
			},
			{ session: this.txHost.tx }
		)

		const balances = await this.inventoryLedgerMongoRepository.commitInventoryLedgerOnRecall(pendingRecallEpcs)

		for (const b of balances) {
			await this.redisClient.lpush(
				`transactions:inbound`,
				SuperJson.stringify({
					id: transactionId,
					mo_no: b.mo_no,
					qty: Object.values(b.size_ledger).reduce((sum, item) => sum + item.stocked_in_qty, 0),
					changes: b.size_ledger,
					tx_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
					tx_type: 'recall'
				} satisfies IStockTransaction<'inbound'>)
			)
		}

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
		const inboundStockTransactions = transactionHistory.filter((item) => {
			const parsedItem = SuperJson.parse(item) as IStockTransaction<'inbound'>
			return parsedItem.id === transactionId
		})

		if (!inboundStockTransactions.length) return

		const transactions = SuperJson.parse<IStockTransaction<'inbound'>[]>(inboundStockTransactions)

		const epcsToRollback = await this.finishedGoodsEpcModel.find(
			{
				stock_in_tx: { $in: transactions.map((tx) => tx.id) },
				status: { $in: [FinishedGoodsEpcStatus.IN_STOCK, FinishedGoodsEpcStatus.RECALLED] },
				inbound_times: { $gte: 1 }
			},
			{ _id: 0, epc: 1, status: 1 },
			{ lean: true, session: this.txHost.tx, readPreference: 'primary' }
		)

		await this.finishedGoodsEpcModel.updateMany(
			{
				stock_in_tx: { $in: transactions.map((tx) => tx.id) },
				status: { $in: [FinishedGoodsEpcStatus.IN_STOCK, FinishedGoodsEpcStatus.RECALLED] },
				inbound_times: { $gte: 1 }
			},
			{
				$inc: { inbound_times: -1 },
				$set: { status: FinishedGoodsEpcStatus.SCANNING, storage_location: null, assembly_line: null }
			},
			{ session: this.txHost.tx }
		)

		await this.inventoryLedgerMongoRepository.rollbackInboundFluctuation(transactions)

		for (const tx of inboundStockTransactions) {
			await this.redisClient.lrem('transactions:inbound', 0, tx)
		}

		return epcsToRollback
	}
}
