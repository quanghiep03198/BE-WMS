import { SuperJson } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { INVENTORY_LEDGER_REPOSITORY } from '@modules/finished-goods/application/ports/inventory-ledger.repository.port'
import { SHIPPING_PROGRESS_REPOSITORY } from '@modules/finished-goods/application/ports/shipping-progress.repository.port'
import { IStockTransactionRepository } from '@modules/finished-goods/application/ports/stock-transaction.repository.port'
import { IInoutboundTransaction } from '@modules/finished-goods/application/types'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { ExcessInboundOrderException } from '@modules/finished-goods/domain/exceptions/excess-order.exception'
import { InsufficientInventoryException } from '@modules/finished-goods/domain/exceptions/insufficient-inventory.exception'
import { StockTransactionNotRollbackableException } from '@modules/finished-goods/domain/exceptions/stock-transaction-not-rollbackable.exception'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectRedisClient } from '@redis/decorators'
import { format } from 'date-fns'
import Redis from 'ioredis'
import { AnyBulkWriteOperation, mongo, type MongooseBulkWriteOptions } from 'mongoose'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import { InventoryLedgerRepository } from './inventory-ledger.repository'
import { ShippingProgressMongoRepository } from './shipping-progress-mongo.repository'

type RollbackEpc = {
	epc: string
	last_tx: string
	status: FinishedGoodsEpcStatus
	mo_no: string
	size_numcode: string
	scannable: boolean
	deleted: boolean
	inbound_times?: number
	status_before_recall?: FinishedGoodsEpcStatus.SCANNING | FinishedGoodsEpcStatus.IN_STOCK
}

type RollbackResult = {
	epcs: Array<{ epc: string; status: FinishedGoodsEpcStatus; last_tx: string }>
	syncRedisHistory: boolean
}

@Injectable()
export class StockTransactionMongoRepository implements IStockTransactionRepository {
	constructor(
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

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockIn(transactionId: string, pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkUpdateEpcOperators: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingStockInEpcs.map(
			(epc) => ({
				updateOne: {
					filter: {
						epc: epc.getStockKeepingUnit(),
						scannable: true,
						deleted: false,
						status: { $in: [FinishedGoodsEpcStatus.SCANNING, FinishedGoodsEpcStatus.RECALLED] },
						storage_location: null
					},
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
								assembly_line: epc.getAssemblyLine('id'),
								storage_location: epc.getStorageLocation('id')
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

		const epcUpdate = await this.finishedGoodsEpcModel.bulkWrite(bulkUpdateEpcOperators, bulkWriteConcernSettings)
		if (epcUpdate.matchedCount !== pendingStockInEpcs.length)
			throw new ExcessInboundOrderException('One or more EPCs are no longer eligible for stock-in')

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
				filter: {
					epc: epc.getStockKeepingUnit(),
					scannable: true,
					deleted: false,
					status: FinishedGoodsEpcStatus.SCANNING,
					inbound_times: { $gte: 1 },
					outbound_at: null
				},
				update: {
					outbound_at: new Date(),
					po: epc.getPurchaseOrder(),
					status: FinishedGoodsEpcStatus.SHIPPED,
					scannable: false,
					last_tx: transactionId
				}
			}
		}))

		const epcUpdate = await this.finishedGoodsEpcModel.bulkWrite(bulkWriteOperations, {
			session: this.txHost.tx,
			ordered: false,
			timestamps: true
		})
		if (epcUpdate.matchedCount !== pendingShipOutEpcs.length)
			throw new InsufficientInventoryException('One or more EPCs are no longer eligible for stock-out')

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
		const epcUpdate = await this.finishedGoodsEpcModel.updateMany(
			{
				scannable: true,
				deleted: false,
				status: { $in: [FinishedGoodsEpcStatus.SCANNING, FinishedGoodsEpcStatus.IN_STOCK] },
				epc: { $in: pendingRecallEpcs.map((e) => e.getStockKeepingUnit()) }
			},
			[
				{
					$set: {
						status_before_recall: '$status',
						recalled_at: '$$NOW',
						status: FinishedGoodsEpcStatus.RECALLED,
						storage_location: null,
						last_tx: { $literal: transactionId }
					}
				}
			],
			{ session: this.txHost.tx }
		)
		if (epcUpdate.matchedCount !== pendingRecallEpcs.length)
			throw new InsufficientInventoryException('One or more EPCs are no longer eligible for recall')

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

	public async rollbackInboundTransaction(
		transactionId: string
	): Promise<Array<{ epc: string; status: FinishedGoodsEpcStatus }>> {
		const result = await this.rollbackInboundTransactionInMongo(transactionId).catch(async (error: unknown) => {
			const persisted = await this.inventoryLedgerMongoRepository.getInboundTransactionHistory(transactionId)
			if (persisted?.voided) return { epcs: [], syncRedisHistory: true }
			throw error
		})
		if (result.syncRedisHistory) await this.syncRedisTransactionVoid('transactions:inbound', transactionId)
		return result.epcs
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	private async rollbackInboundTransactionInMongo(transactionId: string): Promise<RollbackResult> {
		const transaction = await this.inventoryLedgerMongoRepository.getInboundTransactionHistory(transactionId)
		if (!transaction) return { epcs: [], syncRedisHistory: false }
		if (transaction.voided) return { epcs: [], syncRedisHistory: true }

		const expectedStatus =
			transaction.tx_type === 'recall' ? FinishedGoodsEpcStatus.RECALLED : FinishedGoodsEpcStatus.IN_STOCK
		const epcs = (await this.finishedGoodsEpcModel
			.find(
				{ last_tx: transactionId },
				{
					_id: 0,
					epc: 1,
					last_tx: 1,
					status: 1,
					mo_no: 1,
					size_numcode: 1,
					scannable: 1,
					deleted: 1,
					inbound_times: 1,
					status_before_recall: 1
				},
				{ lean: true, session: this.txHost.tx, readPreference: 'primary' }
			)
			.exec()) as RollbackEpc[]
		this.assertInboundEpcsMatchTransaction(transaction, epcs, expectedStatus)

		const epcUpdate = await this.finishedGoodsEpcModel.updateMany(
			{
				epc: { $in: epcs.map((item) => item.epc) },
				last_tx: transactionId,
				scannable: true,
				deleted: false,
				status: expectedStatus,
				...(transaction.tx_type === 'stock_in' ? { inbound_times: { $gte: 1 } } : {})
			},
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
								'$status_before_recall',
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
				},
				{ $unset: 'status_before_recall' }
			],
			{ session: this.txHost.tx }
		)
		if (epcUpdate.matchedCount !== epcs.length)
			throw new StockTransactionNotRollbackableException('Inbound EPCs changed before rollback could complete')

		await this.inventoryLedgerMongoRepository.rollbackInboundFluctuation(transaction)
		return {
			epcs: epcs.map(({ epc, last_tx, status }) => ({ epc, last_tx, status })),
			syncRedisHistory: true
		}
	}

	public async rollbackOutboundTransaction(transactionId: string) {
		const result = await this.rollbackOutboundTransactionInMongo(transactionId).catch(async (error: unknown) => {
			const persisted = await this.inventoryLedgerMongoRepository.getOutboundTransactionHistory(transactionId)
			if (persisted?.voided) return { epcs: [], syncRedisHistory: true }
			throw error
		})
		if (result.syncRedisHistory) await this.syncRedisTransactionVoid('transactions:outbound', transactionId)
		return result.epcs
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	private async rollbackOutboundTransactionInMongo(transactionId: string): Promise<RollbackResult> {
		const transaction = await this.inventoryLedgerMongoRepository.getOutboundTransactionHistory(transactionId)
		if (!transaction) return { epcs: [], syncRedisHistory: false }
		if (transaction.voided) return { epcs: [], syncRedisHistory: true }

		const epcs = (await this.finishedGoodsEpcModel
			.find(
				{ last_tx: transactionId },
				{ _id: 0, epc: 1, last_tx: 1, status: 1, mo_no: 1, size_numcode: 1, scannable: 1, deleted: 1 },
				{ lean: true, session: this.txHost.tx, readPreference: 'primary' }
			)
			.exec()) as RollbackEpc[]
		this.assertOutboundEpcsMatchTransaction(transaction, epcs)

		const epcUpdate = await this.finishedGoodsEpcModel.updateMany(
			{
				epc: { $in: epcs.map((item) => item.epc) },
				last_tx: transactionId,
				scannable: false,
				deleted: false,
				status: FinishedGoodsEpcStatus.SHIPPED
			},
			[{ $set: { scannable: true, status: FinishedGoodsEpcStatus.SCANNING } }, { $unset: ['po', 'outbound_at'] }],
			{ session: this.txHost.tx }
		)
		if (epcUpdate.matchedCount !== epcs.length)
			throw new StockTransactionNotRollbackableException('Outbound EPCs changed before rollback could complete')

		await this.inventoryLedgerMongoRepository.rollbackOutboundFluctuation(transaction)
		return {
			epcs: epcs.map(({ epc, last_tx, status }) => ({ epc, last_tx, status })),
			syncRedisHistory: true
		}
	}

	private assertInboundEpcsMatchTransaction(
		transaction: IInoutboundTransaction<'inbound'>,
		epcs: RollbackEpc[],
		expectedStatus: FinishedGoodsEpcStatus
	): void {
		if (!transaction.mo_no) throw new StockTransactionNotRollbackableException()

		const expected = new Map<string, number>()
		for (const [size, fluctuation] of Object.entries(transaction.changes)) {
			const count =
				transaction.tx_type === 'stock_in'
					? fluctuation.stocked_in_qty + fluctuation.total_return_tx
					: fluctuation.total_recall_tx
			if (count > 0) expected.set(`${transaction.mo_no}\u0000${size}`, count)
		}
		const actual = new Map<string, number>()
		for (const epc of epcs) {
			const key = `${epc.mo_no}\u0000${epc.size_numcode}`
			actual.set(key, (actual.get(key) ?? 0) + 1)
			if (
				epc.status !== expectedStatus ||
				!epc.scannable ||
				epc.deleted ||
				(transaction.tx_type === 'stock_in' && (epc.inbound_times ?? 0) < 1)
			)
				throw new StockTransactionNotRollbackableException('Inbound EPC state no longer matches its transaction')
			if (
				transaction.tx_type === 'recall' &&
				epc.status_before_recall !== FinishedGoodsEpcStatus.SCANNING &&
				epc.status_before_recall !== FinishedGoodsEpcStatus.IN_STOCK
			)
				throw new StockTransactionNotRollbackableException('EPC status before recall is unknown')
		}

		if (expected.size === 0 || !this.haveSameCounts(expected, actual))
			throw new StockTransactionNotRollbackableException('Inbound transaction no longer has its complete EPC set')
	}

	private assertOutboundEpcsMatchTransaction(
		transaction: IInoutboundTransaction<'outbound'>,
		epcs: RollbackEpc[]
	): void {
		const expected = new Map<string, number>()
		for (const change of transaction.changes)
			for (const [size, fluctuation] of Object.entries(change.size_ledger))
				if (fluctuation.shipped_out_qty > 0)
					expected.set(
						`${change.mo_no}\u0000${size}`,
						(expected.get(`${change.mo_no}\u0000${size}`) ?? 0) + fluctuation.shipped_out_qty
					)

		const actual = new Map<string, number>()
		for (const epc of epcs) {
			const key = `${epc.mo_no}\u0000${epc.size_numcode}`
			actual.set(key, (actual.get(key) ?? 0) + 1)
			if (epc.status !== FinishedGoodsEpcStatus.SHIPPED || epc.scannable || epc.deleted)
				throw new StockTransactionNotRollbackableException('Outbound EPC state no longer matches its transaction')
		}

		if (expected.size === 0 || !this.haveSameCounts(expected, actual))
			throw new StockTransactionNotRollbackableException('Outbound transaction no longer has its complete EPC set')
	}

	private haveSameCounts(expected: Map<string, number>, actual: Map<string, number>): boolean {
		return expected.size === actual.size && Array.from(expected).every(([key, count]) => actual.get(key) === count)
	}

	private async syncRedisTransactionVoid(listKey: string, transactionId: string): Promise<void> {
		const transactionHistory = await this.redisClient.lrange(listKey, 0, -1)
		const entry = transactionHistory.find((item) => {
			const transaction = SuperJson.parse<{ id: string; voided: boolean }>(item)
			return transaction.id === transactionId
		})
		if (!entry) return

		const transaction = SuperJson.parse<{ id: string; voided: boolean }>(entry)
		if (transaction.voided) return

		await this.redisClient.eval(
			`local index = redis.call('LPOS', KEYS[1], ARGV[1])
			if index then redis.call('LSET', KEYS[1], index, ARGV[2]) end`,
			1,
			listKey,
			entry,
			SuperJson.stringify({ ...transaction, voided: true })
		)
	}
}
