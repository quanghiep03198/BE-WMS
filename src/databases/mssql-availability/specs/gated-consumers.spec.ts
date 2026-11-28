import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { SyncDefectiveGoodsConsumer } from '@modules/defective-goods/infrastructure/queues/consumers/sync-defective-goods.consumer'
import { CommitExchangeMoConsumer } from '@modules/finished-goods/infrastructure/queues/consumers/commit-exchange-mo.consumer'
import { RollbackStockTxConsumer } from '@modules/finished-goods/infrastructure/queues/consumers/commit-rollback-stock-tx.consumer'
import { CommitStockBalancesConsumer } from '@modules/finished-goods/infrastructure/queues/consumers/commit-stock-balances.consumer'
import { CommitStockOutConsumer } from '@modules/finished-goods/infrastructure/queues/consumers/commit-stock-out.consumer'
import { CommitUpsertEpcsMatchConsumer } from '@modules/finished-goods/infrastructure/queues/consumers/commit-upsert-epcs-match.consumer'
import { SyncDispatchOrderConsumer } from '@modules/truckload-delivery/infrastructure/queues/consumers/sync-dispatch-order.consumer'
import { WorkerHost } from '@nestjs/bullmq'

describe('MSSQL queue consumers', () => {
	const guard = { run: jest.fn().mockResolvedValue(undefined) }
	const job = { id: '1', data: [], queueName: 'Q' }
	const stub = {}
	beforeEach(() => guard.run.mockClear())

	it.each<[string, () => WorkerHost]>([
		['stock balances', () => new CommitStockBalancesConsumer(stub as never, guard as never)],
		['stock out', () => new CommitStockOutConsumer(stub as never, guard as never)],
		['exchange MO', () => new CommitExchangeMoConsumer(stub as never, guard as never)],
		['EPC match', () => new CommitUpsertEpcsMatchConsumer(stub as never, stub as never, guard as never)],
		['rollback', () => new RollbackStockTxConsumer(stub as never, guard as never)],
		[
			'defective goods',
			() =>
				new SyncDefectiveGoodsConsumer(stub as never, stub as never, stub as never, stub as never, guard as never)
		],
		[
			'dispatch order',
			() => new SyncDispatchOrderConsumer(stub as never, stub as never, stub as never, guard as never)
		]
	])('runs %s through the guard', async (_name, create) => {
		await create().process(job as never, 'tok')
		expect(guard.run).toHaveBeenCalledWith(DATA_SOURCE_DATA_LAKE, job, 'tok', expect.any(Function))
	})

	it('still writes stock balances through the guard', async () => {
		const repository = { commitStockFluctuation: jest.fn().mockResolvedValue(undefined) }
		guard.run.mockImplementationOnce((_ds: string, _job: unknown, _token: string, work: () => Promise<void>) =>
			work()
		)
		await new CommitStockBalancesConsumer(repository as never, guard as never).process(job as never, 'tok')
		expect(repository.commitStockFluctuation).toHaveBeenCalledWith(job.data)
	})

	it('waits for the CDC marker and fails without writing MSSQL when marker registration fails', async () => {
		const failure = new Error('Redis unavailable')
		const echo = { registerOrigin: jest.fn().mockRejectedValue(failure) }
		const repository = { upsertEpcsMatch: jest.fn() }
		guard.run.mockImplementationOnce((_ds: string, _job: unknown, _token: string, work: () => Promise<void>) =>
			work()
		)
		const consumer = new CommitUpsertEpcsMatchConsumer(repository as never, echo as never, guard as never)
		await expect(consumer.process(job as never, 'tok')).rejects.toBe(failure)
		expect(repository.upsertEpcsMatch).not.toHaveBeenCalled()
	})
})
