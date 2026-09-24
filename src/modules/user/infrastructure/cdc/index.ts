import { env } from '@common/utils'
import { CdcHandler } from '@databases/cdc/decorators'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_SYSCLOUD, DATA_WAREHOUSE_CONNECTION, DATABASE_SCHEMA } from '@databases/constants'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { InjectModel } from '@nestjs/mongoose'
import { hashSync } from 'bcrypt'
import type { AnyBulkWriteOperation } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { User, UserDocument, UserModel } from '../persistence/mongodb/schemas/user.schema'

@CdcHandler({
	schema: DATABASE_SCHEMA,
	sourceName: 'ts_user',
	dataSourceToken: DATA_SOURCE_SYSCLOUD,
	pollIntervalMs: 1000,
	originMarkerColumn: 'sync_id'
})
export class UserCdcHandler implements ICdcHandler<{
	usercode: string
	user_password: string
}> {
	constructor(
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>,
		@InjectPinoLogger(UserCdcHandler.name) private readonly logger: PinoLogger,
		@InjectModel(User.name, DATA_WAREHOUSE_CONNECTION) private readonly userModel: UserModel
	) {}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	async handle({
		table,
		changes
	}: CdcChangeContext<{
		usercode: string
		user_password: string
	}>): Promise<void> {
		this.logger.debug(`Handling ${changes.length} changes for ${table}`)

		const bulkWriteOps: AnyBulkWriteOperation<UserDocument>[] = changes.flatMap((change) => {
			if (change.operation === 'delete')
				return {
					updateMany: {
						filter: { username: { $in: change.data.map((row) => row.usercode) } },
						update: { $set: { deleted: true } }
					}
				}

			return change.data.map<AnyBulkWriteOperation<UserDocument>>((row) => ({
				updateOne: {
					filter: { username: row.usercode },
					update: {
						$set: {
							password: hashSync(
								row.user_password,
								env<number>('SALT_ROUND', { serialize: (value) => Number.parseInt(value) })
							)
						}
					},
					upsert: true
				}
			}))
		})

		await this.userModel.bulkWrite(bulkWriteOps, { session: this.txHost.tx })
	}
}
