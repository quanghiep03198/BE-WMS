import { InventoryActions, InventoryStorageType } from '@modules/finished-goods/domain/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { generateStation, StationNO } from '@modules/finished-goods/domain/utils'
import { COMMIT_STOCK_BALANCES_QUEUE } from '@modules/finished-goods/infrastructure/queues'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { chunk } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CommitStockBalancesCommand } from './commit-stock-balances.command'

@CommandHandler(CommitStockBalancesCommand)
export class CommitStockBalancesHandler implements ICommandHandler<CommitStockBalancesCommand> {
	constructor(
		@InjectPinoLogger(CommitStockBalancesHandler.name) private readonly logger: PinoLogger,
		@InjectQueue(COMMIT_STOCK_BALANCES_QUEUE)
		private readonly commitStockBalancesQueue: Queue<
			Array<
				Array<{
					epc: string
					mo_no: string
					size_numcode: string
					factory_code: string
					status: string
					inventory_ledger_type: string
					dept_code: string
					dept_name: string
					storage: string
					station_no: StationNO
				}>
			>
		>,
		private readonly eventBus: EventBus
	) {}

	public async execute({ pendingInboundEpcs, stockFlow }: CommitStockBalancesCommand): Promise<void> {
		try {
			const data = chunk(pendingInboundEpcs, 100).map((ck) => {
				return ck
					.filter((item) => item.getIsWritable() && !item.getIsInternal())
					.map((item) => {
						const stockFlowMapping: Map<
							StockFlow,
							{ status: InventoryActions; inventory_ledger_type: InventoryStorageType }
						> = new Map([
							[
								'inbound',
								{
									status: InventoryActions.INBOUND,
									inventory_ledger_type: InventoryStorageType.NORMAL_IMPORT
								}
							],
							[
								'outbound',
								{
									status: InventoryActions.OUTBOUND,
									inventory_ledger_type: InventoryStorageType.RECYCLING
								}
							]
						])

						return {
							epc: item.getStockKeepingUnit(),
							mo_no: item.getManufacturingOrder(),
							size_numcode: item.getSize(),
							factory_code: item.getFactoryProduce(),
							dept_code: item.getAssemblyLine('code'),
							dept_name: item.getAssemblyLine('name', 'sanitized'),
							storage: item.getStorageLocation('code'),
							station_no: generateStation(item.getFactoryProduce(), 'WH101'),
							...stockFlowMapping.get(stockFlow)
						}
					})
			})

			const queueNameMap: Map<StockFlow, string> = new Map([
				['inbound', 'COMMIT_STOCK_IN'],
				['outbound', 'COMMIT_RECALL']
			])

			const metrics = this.commitStockBalancesQueue.exportPrometheusMetrics()
			await this.commitStockBalancesQueue.add(queueNameMap.get(stockFlow), data, {
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
