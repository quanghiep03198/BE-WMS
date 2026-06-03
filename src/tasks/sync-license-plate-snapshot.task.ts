import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryFailedError } from 'typeorm'

@Injectable()
export class SyncLicensePlateSnapshotTask {
	private readonly logger = new Logger(SyncLicensePlateSnapshotTask.name)

	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource) {}

	@Cron(CronExpression.EVERY_5_MINUTES, {
		name: 'SYNC_LICENSE_PLATE_SNAPSHOT'
	})
	async handleSyncLicensePlateSnapshot() {
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
