import { CdcHandler } from '@databases/cdc/decorators'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATABASE_SCHEMA } from '@databases/constants'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

@CdcHandler({
	schema: DATABASE_SCHEMA,
	sourceName: 'dv_rfidmatchmst_cust',
	dataSourceToken: DATA_SOURCE_DATA_LAKE,
	pollIntervalMs: 1000,
	originMarkerColumn: 'sync_id'
})
export class FinishedGoodsEpcMatchCdcHandler implements ICdcHandler {
	constructor(@InjectPinoLogger(FinishedGoodsEpcMatchCdcHandler.name) private readonly logger: PinoLogger) {}
	async handle({ changes }: CdcChangeContext<any>): Promise<void> {
		this.logger.debug(changes)
	}
}
