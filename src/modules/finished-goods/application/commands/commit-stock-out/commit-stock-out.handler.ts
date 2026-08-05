// import { IIoMongoRepository as IIoMssqlRepository } from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { InventoryActions, InventoryStorageType } from '@modules/finished-goods/domain/constants'
import { CommitStockInFailureEvent } from '@modules/finished-goods/domain/events/commit-stock-in-failure/commit-stock-in-failure.event'
import { CommittedStockOutEvent } from '@modules/finished-goods/domain/events/committed-stock-out/committed-stock-out.event'
import { generateStation, StationNO } from '@modules/finished-goods/domain/utils'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { chunk } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
// import { IO_MSSQL_REPOSITORY } from '../../ports/io-mssql.repository.port'
import { COMMIT_STOCK_OUT_QUEUE } from '@modules/finished-goods/infrastructure/queues'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { CommitStockOutCommand } from './commit-stock-out.command'

@CommandHandler(CommitStockOutCommand)
export class CommitStockOutHandler implements ICommandHandler<CommitStockOutCommand> {
	constructor(
		@InjectPinoLogger(CommitStockOutHandler.name) private readonly logger: PinoLogger,
		@InjectQueue(COMMIT_STOCK_OUT_QUEUE)
		private readonly commitStockOutQueue: Queue<
			Array<
				Array<{
					epc: string
					mo_no: string
					size_numcode: string
					factory_code: string
					status: string
					inventory_variation_type: string
					station_no: StationNO
				}>
			>
		>,
		private readonly eventBus: EventBus
	) {}

	public async execute({ pendingStockOutEpcs }: CommitStockOutCommand): Promise<void> {
		try {
			const data = chunk(pendingStockOutEpcs, 100).map((ck) => {
				return ck
					.filter((item) => item.getIsWritable() && !item.getIsInternal())
					.map((item) => {
						return {
							epc: item.getStockKeepingUnit(),
							mo_no: item.getManufacturingOrder(),
							size_numcode: item.getSize(),
							factory_code: item.getFactoryProduce(),
							station_no: generateStation(item.getFactoryProduce(), 'WH103'),
							status: InventoryActions.OUTBOUND,
							inventory_variation_type: InventoryStorageType.NORMAL_EXPORT
							// ...variationFlow.get(stockFlow)
						}
					})
			})
			await this.commitStockOutQueue.add('COMMIT_STOCK_OUT', data, {
				removeOnFail: false,
				removeOnComplete: true,
				attempts: 10,
				backoff: { type: 'fixed', delay: 10_000 }
			})
			// await this.ioMssqlRepository.stockOut(pendingStockOutEpcs)
			this.eventBus.publish(new CommittedStockOutEvent(pendingStockOutEpcs.length))
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new CommitStockInFailureEvent('WH103', pendingStockOutEpcs))

			throw error
		}
	}
}
