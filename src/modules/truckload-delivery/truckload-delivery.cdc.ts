import { CdcHandler } from '@databases/cdc/decorators'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATABASE_SCHEMA } from '@databases/constants'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

@CdcHandler({
	schema: DATABASE_SCHEMA,
	sourceName: 'dv_truckload_delivery',
	pollIntervalMs: 1000,
	dataSourceToken: DATA_SOURCE_DATA_LAKE
})
export class TruckloadDeliveryCdcHandler implements ICdcHandler {
	constructor(@InjectPinoLogger(TruckloadDeliveryCdcHandler.name) private readonly logger: PinoLogger) {}

	async handle({ changes }: CdcChangeContext) {
		this.logger.debug(changes)
	}
}
