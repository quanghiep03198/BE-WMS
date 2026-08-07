import { InventoryActions, InventoryStorageType } from '@modules/finished-goods/domain/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { generateStation, StationNO } from '@modules/finished-goods/domain/utils'
import { COMMIT_STOCK_VARIATION_QUEUE } from '@modules/finished-goods/infrastructure/queues'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { chunk } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CommitStockVariationCommand } from './commit-stock-variation.command'

@CommandHandler(CommitStockVariationCommand)
export class CommitStockVariationHandler implements ICommandHandler<CommitStockVariationCommand> {
	constructor(
		@InjectPinoLogger(CommitStockVariationHandler.name) private readonly logger: PinoLogger,
		@InjectQueue(COMMIT_STOCK_VARIATION_QUEUE)
		private readonly commitStockVariationQueue: Queue<
			Array<
				Array<{
					epc: string
					mo_no: string
					size_numcode: string
					factory_code: string
					status: string
					inventory_variation_type: string
					dept_code: string
					dept_name: string
					storage: string
					station_no: StationNO
				}>
			>
		>,
		private readonly eventBus: EventBus
	) {}

	public async execute({ pendingInboundEpcs, stockFlow }: CommitStockVariationCommand): Promise<void> {
		try {
			const data = chunk(pendingInboundEpcs, 100).map((ck) => {
				return ck
					.filter((item) => item.getIsWritable() && !item.getIsInternal())
					.map((item) => {
						const variationFlow: Map<
							StockFlow,
							{ status: InventoryActions; inventory_variation_type: InventoryStorageType }
						> = new Map([
							[
								'inbound',
								{
									status: InventoryActions.INBOUND,
									inventory_variation_type: InventoryStorageType.NORMAL_IMPORT
								}
							],
							[
								'outbound',
								{
									status: InventoryActions.OUTBOUND,
									inventory_variation_type: InventoryStorageType.RECYCLING
								}
							]
						])

						return {
							epc: item.getStockKeepingUnit(),
							mo_no: item.getManufacturingOrder(),
							size_numcode: item.getSize(),
							factory_code: item.getFactoryProduce(),
							dept_code: item.getAssemblyLine('code'),
							dept_name: item.getAssemblyLine('name'),
							storage: item.getStorageLocation('code'),
							station_no: generateStation(item.getFactoryProduce(), 'WH101'),
							...variationFlow.get(stockFlow)
						}
					})
			})

			const queueNameMap: Map<StockFlow, string> = new Map([
				['inbound', 'COMMIT_STOCK_IN'],
				['outbound', 'COMMIT_RECALL']
			])

			await this.commitStockVariationQueue.add(queueNameMap.get(stockFlow), data, {
				removeOnFail: false,
				removeOnComplete: true,
				attempts: 10,
				backoff: { type: 'fixed', delay: 10_000 }
			})
		} catch (error) {
			this.logger.error(error)
		}
	}
}
