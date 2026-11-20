import { SuperJson } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IInoutboundTransaction } from '@modules/finished-goods/application/types'
import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { ClientSession, Model } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { StockHistoryDirection, StockHistoryOutbox } from '../schemas/stock-history-outbox.schema'

/**
 * @description Operate on the current list by transaction ID, not on an index from an earlier read.
 */
const PROJECT_HISTORY = /* lua */ `
local deadline = tonumber(ARGV[4])
if tonumber(redis.call('TIME')[1]) >= deadline then return 0 end
for index, value in ipairs(redis.call('LRANGE', KEYS[1], 0, -1)) do
	local ok, item = pcall(cjson.decode, value)
	if ok and type(item) == 'table' and item.id == ARGV[1] then
		if ARGV[2] == '1' and item.voided ~= true then
			item.voided = true
			redis.call('LSET', KEYS[1], index - 1, cjson.encode(item))
		end
		if redis.call('TTL', KEYS[1]) == -1 then redis.call('EXPIREAT', KEYS[1], deadline) end
		return 1
	end
end
if ARGV[3] ~= '' then
	redis.call('LPUSH', KEYS[1], ARGV[3])
	if redis.call('TTL', KEYS[1]) == -1 then redis.call('EXPIREAT', KEYS[1], deadline) end
end
return 1
`

@Injectable()
export class StockHistoryOutboxRepository {
	constructor(
		@InjectModel(StockHistoryOutbox.name, DATA_WAREHOUSE_CONNECTION)
		private readonly model: Model<StockHistoryOutbox>
	) {}

	async enqueue<T extends StockHistoryDirection>(
		direction: T,
		transaction: IInoutboundTransaction<T>,
		session: ClientSession
	): Promise<void> {
		const now = new Date()
		await this.model.create(
			[
				{
					_id: `${direction}:${transaction.id}`,
					direction,
					transactionId: transaction.id,
					revision: randomUUID(),
					payload: SuperJson.stringify(transaction),
					voided: false,
					nextAttemptAt: now,
					expiresAt: this.historyDeadline(now)
				}
			],
			{ session }
		)
	}

	async enqueueVoid(direction: StockHistoryDirection, transactionId: string, session: ClientSession): Promise<void> {
		const now = new Date()
		await this.model.updateOne(
			{ _id: `${direction}:${transactionId}` },
			{
				$set: { revision: randomUUID(), voided: true, nextAttemptAt: now },
				$setOnInsert: { direction, transactionId, expiresAt: this.historyDeadline(now) }
			},
			{ upsert: true, session }
		)
	}

	private historyDeadline(now: Date): Date {
		const deadline = new Date(now)
		deadline.setHours(23, 0, 0, 0)
		if (deadline <= now) deadline.setDate(deadline.getDate() + 1)
		return deadline
	}
}

@Injectable()
export class StockHistoryOutboxWorker {
	private readonly logger = new Logger(StockHistoryOutboxWorker.name)

	constructor(
		@InjectModel(StockHistoryOutbox.name, DATA_WAREHOUSE_CONNECTION)
		private readonly model: Model<StockHistoryOutbox>,
		@InjectRedisClient() private readonly redis: Redis
	) {}

	@Cron(CronExpression.EVERY_SECOND, { waitForCompletion: true })
	async flush(): Promise<void> {
		const now = new Date()
		const batch = await this.model
			.find({ nextAttemptAt: { $lte: now }, expiresAt: { $gt: now } })
			.read('primary')
			.sort({ nextAttemptAt: 1, _id: 1 })
			.limit(50)
			.lean()
			.exec()

		for (const item of batch) {
			const revision = { _id: item._id, revision: item.revision }
			const payload =
				item.voided && item.payload
					? SuperJson.stringify({
							...SuperJson.parse<IInoutboundTransaction<StockHistoryDirection>>(item.payload),
							voided: true
						})
					: (item.payload ?? '')
			try {
				await this.redis.eval(
					PROJECT_HISTORY,
					1,
					`transactions:${item.direction}`,
					item.transactionId,
					item.voided ? '1' : '0',
					payload,
					Math.floor(item.expiresAt.getTime() / 1000)
				)
			} catch (error) {
				this.logger.warn(`Could not project ${item._id} to Redis: ${String(error)}`)
				await this.model.updateOne(revision, { $set: { nextAttemptAt: new Date(Date.now() + 5000) } })
				return
			}
			// A concurrent rollback can replace the pending revision while this worker is sending it.
			await this.model.deleteOne(revision)
		}
	}
}
