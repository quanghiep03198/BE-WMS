import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { MssqlQueueGuard } from '@databases/mssql-availability/mssql-queue-guard.service'
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
	ITruckloadDeliveryAuditRepository,
	TRUCKLOAD_DELIVERY_AUDIT_REPOSITORY
} from '../../../application/ports/truckload-delivery.rmdbs.repository.port'

// * Single worker concurrency: jobs run one at a time, so a stale snapshot can never overwrite a newer one
@Processor(SYNC_DISPATCH_ORDER_QUEUE)
export class SyncDispatchOrderConsumer extends WorkerHost {
	constructor(
		@InjectPinoLogger(SyncDispatchOrderConsumer.name) private readonly logger: PinoLogger,
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly truckloadDeliveryRepository: ITruckloadDeliveryRepository,
		@Inject(TRUCKLOAD_DELIVERY_AUDIT_REPOSITORY)
		private readonly rmdbsTruckloadDeliveryRepository: ITruckloadDeliveryAuditRepository,
		private readonly guard: MssqlQueueGuard
	) {
		super()
	}

	async process(job: Job<{ dispatchOrder: string }>, token?: string): Promise<void> {
		return this.guard.run(DATA_SOURCE_DATA_LAKE, job, token, async () => {
			const { data } = job
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
		})
	}
}
