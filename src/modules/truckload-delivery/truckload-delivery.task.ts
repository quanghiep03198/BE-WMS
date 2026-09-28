import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryFailedError } from 'typeorm'

/**
 * @deprecated - This task is no longer in use and will be removed in future versions.
 * This task is responsible for syncing license plate snapshots with truckload delivery records.
 */
@Injectable()
export class TruckloadDeliveryTask {
	private readonly logger = new Logger(TruckloadDeliveryTask.name)

	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource) {}

	@Cron(CronExpression.EVERY_5_MINUTES, {
		name: 'SYNC_LICENSE_PLATE_SNAPSHOT'
	})
	async handleSyncLicensePlateSnapshot() {
		if (1 === 1) return

		try {
			await this.dataSource.query(/* SQL */ `
				UPDATE a
				SET a.actual_factory_departure_time = b.snap_time
				FROM DV_DATA_LAKE.dbo.dv_truckload_delivery a
				LEFT JOIN DV_DATA_LAKE.dbo.dv_carlicenseplates b 
				ON 
					TRIM(UPPER(a.license_plate)) = TRIM(UPPER(b.plate_name)) 
					AND 
						(
							b.snap_time BETWEEN DATEADD(MINUTE, 1, a.container_sealing_time) AND DATEADD(MINUTE, 30, a.factory_departure_time)
							OR b.snap_time BETWEEN DATEADD(MINUTE, -30, a.container_sealing_time) AND DATEADD(MINUTE, 30, a.container_sealing_time)
						)
	
				WHERE a.actual_factory_departure_time IS NULL
			`)

			this.logger.log('Sync license plate snapshot completed.')
		} catch (error) {
			this.logger.error(
				error instanceof QueryFailedError
					? error.message
					: 'An unknown error occurred during sync license plate snapshot.'
			)
		}
	}
}
