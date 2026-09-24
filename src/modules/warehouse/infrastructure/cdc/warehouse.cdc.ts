import { CdcHandler } from '@databases/cdc/decorators'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION, DATABASE_SCHEMA } from '@databases/constants'
import { IUserRepository, USER_REPOSITORY } from '@modules/user/application/ports/user.repository.port'
import { Inject } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { AnyBulkWriteOperation, Types } from 'mongoose'
import { Warehouse, WarehouseDocument, WarehouseModel } from '../persistence/mongodb/schemas/warehouse.schema'
import { WarehouseEntity } from '../persistence/mssql/entities/warehouse.entity'

@CdcHandler({
	schema: DATABASE_SCHEMA,
	sourceName: 'dv_warehouseccodemst',
	dataSourceToken: DATA_SOURCE_DATA_LAKE,
	originMarkerColumn: 'sync_id',
	pollIntervalMs: 5000
})
export class WarehouseCdcHandler implements ICdcHandler<WarehouseEntity> {
	constructor(
		@InjectModel(Warehouse.name, DATA_WAREHOUSE_CONNECTION) private readonly warehouseModel: WarehouseModel,
		@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository
	) {}

	public async handle({ changes }: CdcChangeContext<WarehouseEntity>) {
		const user = await this.userRepository.findOne({ is_system_user: true })

		for (const change of changes) {
			if (change.operation === 'insert' || change.operation === 'update')
				await this.warehouseModel.bulkWrite(
					change.data.map<AnyBulkWriteOperation<WarehouseDocument>>((row) => ({
						updateOne: {
							filter: { name: row.name },
							update: {
								$set: { name: row.name, created_by: user._id as Types.ObjectId, capacity: row.capacity ?? 0 }
							},
							upsert: true
						}
					}))
				)
		}
	}
}
