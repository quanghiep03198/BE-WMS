import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IStockTransactionMongoRepository } from '@modules/finished-goods/application/ports/stock-transaction-mongo.repository.port'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { AnyBulkWriteOperation, mongo, type MongooseBulkWriteOptions } from 'mongoose'

import { INVENTORY_VARIATION_MONGO_REPOSITORY } from '@modules/finished-goods/application/ports/inventory-variation-mongo.repository.port'
import { SHIPPING_PROGRESS_MONGO_REPOSITORY } from '@modules/finished-goods/application/ports/shipping-progress-mongo.repository.port'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import { InventoryVariationMongoRepository } from './inventory-variation-mongo.repository'
import { ShippingProgressMongoRepository } from './shipping-progress-mongo.repository'

@Injectable()
export class StockTransactionMongoRepository implements IStockTransactionMongoRepository {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@Inject(INVENTORY_VARIATION_MONGO_REPOSITORY)
		private readonly inventoryVariationMongoRepository: InventoryVariationMongoRepository,
		@Inject(SHIPPING_PROGRESS_MONGO_REPOSITORY)
		private readonly shippingProgressMongoRepository: ShippingProgressMongoRepository,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockIn(pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void> {
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
								inbound_times: { $add: [{ $ifNull: ['$inbound_times', 0] }, 1] }
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
		await this.inventoryVariationMongoRepository.applyInventoryVariationForStockIn(pendingStockInEpcs)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockOut(pendingShipOutEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkWriteOperations: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingShipOutEpcs.map((epc) => ({
			updateOne: {
				filter: { epc: epc.getStockKeepingUnit(), status: FinishedGoodsEpcStatus.SCANNING, outbound_at: null },
				update: {
					outbound_at: new Date(),
					po: epc.getPurchaseOrder(),
					status: FinishedGoodsEpcStatus.SHIPPED,
					scannable: false
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
		const pendingInventoryVariation =
			await this.inventoryVariationMongoRepository.getPendingInventoryVariation(pendingShipOutEpcs)
		await this.inventoryVariationMongoRepository.applyInventoryVariationForStockOut(pendingShipOutEpcs)
		await this.shippingProgressMongoRepository.applyShippingProgressForStockOut(pendingInventoryVariation)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async recallFromStock(pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void> {
		await this.finishedGoodsEpcModel.updateMany(
			{ epc: { $in: pendingRecallEpcs.map((e) => e.getStockKeepingUnit()) } },
			{
				recalled_at: new Date(),
				status: FinishedGoodsEpcStatus.RECALLED,
				storage_location: null
			},
			{ session: this.txHost.tx }
		)

		await this.inventoryVariationMongoRepository.applyInventoryVariationForRecall(pendingRecallEpcs)
	}
}
