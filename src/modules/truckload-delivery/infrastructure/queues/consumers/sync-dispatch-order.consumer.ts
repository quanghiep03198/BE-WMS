import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { SYNC_DISPATCH_ORDER_QUEUE } from '..'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../../application/ports/truckload-delivery.repository.port'
import {
	IRmdbsTruckloadDeliveryRepository,
	RMDBS_TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../../application/ports/truckload-delivery.rmdbs.repository.port'

// * Single worker concurrency: jobs run one at a time, so a stale snapshot can never overwrite a newer one
@Processor(SYNC_DISPATCH_ORDER_QUEUE)
export class SyncDispatchOrderConsumer extends WorkerHost {
	constructor(
		@InjectPinoLogger(SyncDispatchOrderConsumer.name) private readonly logger: PinoLogger,
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly truckloadDeliveryRepository: ITruckloadDeliveryRepository,
		@Inject(RMDBS_TRUCKLOAD_DELIVERY_REPOSITORY)
		private readonly rmdbsTruckloadDeliveryRepository: IRmdbsTruckloadDeliveryRepository
	) {
		super()
	}

	async process({ data }: Job<{ dispatchOrder: string }>): Promise<void> {
		// * Always sync the latest state, never the state carried by the event
		const model = await this.truckloadDeliveryRepository.findByDispatchOrder(data.dispatchOrder)
		const snapshot = model?.toProps() ?? null
		if (snapshot) {
			snapshot.packing = snapshot.packing.map((line) => {
				delete line.created_by
				delete line.updated_by

				return line
			})
		}
		await this.rmdbsTruckloadDeliveryRepository.reconcileDispatchOrder(data.dispatchOrder, snapshot)
		this.logger.info(`Synced dispatch order ${data.dispatchOrder} to MSSQL`)
	}
}
