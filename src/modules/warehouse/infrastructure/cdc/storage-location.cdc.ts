import { CdcHandler } from '@databases/cdc/decorators'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION, DATABASE_SCHEMA } from '@databases/constants'
import { IUserRepository, USER_REPOSITORY } from '@modules/user/application/ports/user.repository.port'
import { Inject } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { AnyBulkWriteOperation, Types } from 'mongoose'
import {
	StorageLocation,
	StorageLocationDocument,
	StorageLocationModel
} from '../persistence/mongodb/schemas/storage-location.schema'
import { StorageLocationEntity } from '../persistence/mssql/entities/storage-location.entity'

@CdcHandler({
	schema: DATABASE_SCHEMA,
	dataSourceToken: DATA_SOURCE_DATA_LAKE,
	sourceName: 'dv_warehouseccodedet',
	originMarkerColumn: 'sync_id',
	pollIntervalMs: 5000
})
export class StorageLocationCdcHandler implements ICdcHandler<StorageLocationEntity> {
	constructor(
		@InjectModel(StorageLocation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly storageLocationModel: StorageLocationModel,
		@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository
	) {}

	public async handle({ changes }: CdcChangeContext<StorageLocationEntity>) {
		const user = await this.userRepository.findOne({ is_system_user: true })

		for (const change of changes) {
			if (change.operation === 'insert' || change.operation === 'update')
				await this.storageLocationModel.bulkWrite(
					change.data.map<AnyBulkWriteOperation<StorageLocationDocument>>((row) => ({
						updateOne: {
							filter: { name: row.name },
							update: {
								$set: { name: row.name, created_by: user._id as Types.ObjectId }
							},
							upsert: true
						}
					}))
				)
		}
	}
}
