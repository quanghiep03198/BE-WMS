import 'dotenv/config'
import Redis from 'ioredis'
import type { ClientSession } from 'mongoose'
import mssql from 'mssql'
import { MongoManager } from '../../migrations/libs/mongoose'
import { MssqlManager } from '../../migrations/libs/mssql'
import { getArgs } from '../../migrations/utils/get-args'
import { Logger } from '../../migrations/utils/logger'
import { SuperJson } from '../../src/common/utils/json.util'

/**
 * Restore data after a stock-in / recall / stock-out transaction saved during development.
 * Usage: tsx scripts/.private/restore-tx.ts --tx <transaction_id>
 *
 * MSSQL is ALWAYS the test server below. Never change it.
 */
const TEST_MSSQL_HOST = '10.30.0.18'

const args = getArgs({ tx: { type: 'string' } })
const logger = new Logger('Restore Tx')

type Qty = { stocked_in_qty: number; total_recall_tx: number; total_return_tx: number; shipped_out_qty: number }
type EpcDoc = {
	epc: string
	mo_no: string
	size_numcode: string
	po?: string
	status: string
	inbound_times?: number
}
type RedisTx = {
	id: string
	mo_no?: string
	po?: string
	tx_type: 'stock_in' | 'recall' | 'stock_out'
	tx_at: string
	changes: Record<string, Partial<Qty>> | Array<{ mo_no: string; size_ledger: Record<string, Partial<Qty>> }>
	voided: boolean
}

const emptyQty = (): Qty => ({ stocked_in_qty: 0, total_recall_tx: 0, total_return_tx: 0, shipped_out_qty: 0 })

function inc(target: Record<string, number>, key: string, value: number) {
	if (!value) return
	target[key] = (target[key] ?? 0) + value
}

/** Group epcs of the transaction into { mo_no -> { size -> qty } } from what is actually persisted */
function summarize(epcs: EpcDoc[], txType: RedisTx['tx_type']) {
	const result: Record<string, Record<string, Qty>> = {}
	for (const epc of epcs) {
		const qty = ((result[epc.mo_no] ??= {})[epc.size_numcode] ??= emptyQty())
		if (txType === 'stock_out') qty.shipped_out_qty++
		else if (txType === 'recall') qty.total_recall_tx++
		else if ((epc.inbound_times ?? 0) > 1) qty.total_return_tx++
		else qty.stocked_in_qty++
	}
	return result
}

function normalizeSnapshot(tx: RedisTx): Record<string, Record<string, Qty>> {
	const entries = Array.isArray(tx.changes) ? tx.changes : [{ mo_no: tx.mo_no, size_ledger: tx.changes }]
	const result: Record<string, Record<string, Qty>> = {}
	for (const { mo_no, size_ledger } of entries) {
		const moKey = mo_no ?? ''
		const ledger = size_ledger ?? {}
		for (const [size, qty] of Object.entries(ledger)) {
			const target = ((result[moKey] ??= {})[size] ??= emptyQty())
			for (const key of Object.keys(target) as Array<keyof Qty>) target[key] += qty[key] ?? 0
		}
	}
	// Drop all-zero sizes so they do not affect the comparison
	for (const mo of Object.keys(result))
		for (const size of Object.keys(result[mo]))
			if (Object.values(result[mo][size]).every((v) => v === 0)) delete result[mo][size]
	return result
}

function isSameSummary(a: Record<string, Record<string, Qty>>, b: Record<string, Record<string, Qty>>) {
	return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b))
}

function sortDeep(value: any): any {
	if (!value || typeof value !== 'object') return value
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((k) => [k, sortDeep(value[k])])
	)
}

async function main() {
	if (!args.tx) {
		logger.error('Missing required argument: --tx <transaction_id>')
		process.exit(1)
	}

	const redis = new Redis({
		host: process.env.REDIS_HOST,
		port: Number(process.env.REDIS_PORT),
		password: process.env.REDIS_PASSWORD,
		db: Number(process.env.REDIS_DB || 0)
	})
	const mssqlManager = new MssqlManager(TEST_MSSQL_HOST)
	const mongoManager = new MongoManager()
	let exitCode = 0

	try {
		await mongoManager.connect()

		// 1. Find redis snapshot
		let redisKey: 'transactions:inbound' | 'transactions:outbound' | undefined
		let snapshotIndex = -1
		let snapshot: RedisTx | undefined
		for (const key of ['transactions:inbound', 'transactions:outbound'] as const) {
			const list = await redis.lrange(key, 0, -1)
			const index = list.findIndex((item) => SuperJson.parse<RedisTx>(item).id === args.tx)
			if (index >= 0) {
				redisKey = key
				snapshotIndex = index
				snapshot = SuperJson.parse<RedisTx>(list[index])
				break
			}
		}
		if (!snapshot || !redisKey) throw new Error(`Transaction ${args.tx} not found in redis snapshot`)
		if (snapshot.voided) throw new Error(`Transaction ${args.tx} was already voided`)

		const txType = snapshot.tx_type
		const isOutbound = txType === 'stock_out'
		const txDate = snapshot.tx_at.slice(0, 10)
		const yearMonth = txDate.slice(0, 7)

		// 2. Verify the persisted epcs match the snapshot
		const epcCollection = mongoManager.getRepository<any>('finished_goods_epcs')
		const statusFilter = isOutbound ? { status: 'shipped' } : { status: txType === 'recall' ? 'recalled' : 'instock' }
		const epcs = await epcCollection
			.find<EpcDoc>(
				{ last_tx: args.tx, deleted: false, ...statusFilter },
				{ projection: { _id: 0, epc: 1, mo_no: 1, size_numcode: 1, po: 1, status: 1, inbound_times: 1 } }
			)
			.toArray()

		const persisted = summarize(epcs, txType)
		if (!epcs.length || !isSameSummary(persisted, normalizeSnapshot(snapshot))) {
			logger.error('Persisted data does not match redis snapshot, aborting.')
			logger.error(`Redis: ${JSON.stringify(sortDeep(normalizeSnapshot(snapshot)))}`)
			logger.error(`DB:    ${JSON.stringify(sortDeep(persisted))}`)
			throw new Error(`Transaction ${args.tx} is not intact`)
		}
		logger.info(`Transaction ${args.tx} (${txType}) is intact with ${epcs.length} epcs. Restoring ...`)

		const po = isOutbound ? (snapshot.po ?? epcs[0].po) : undefined
		const epcsOf = (predicate: (e: EpcDoc) => boolean) => epcs.filter(predicate).map((e) => e.epc)

		await mongoManager.withTransaction(async (session: ClientSession) => {
			// 3. Restore epcs
			if (isOutbound) {
				await epcCollection.updateMany(
					{ epc: { $in: epcsOf(() => true) } },
					{ $set: { status: 'scanning', scannable: true }, $unset: { po: '', outbound_at: '' } },
					{ session }
				)
			} else if (txType === 'recall') {
				await epcCollection.updateMany(
					{ epc: { $in: epcsOf(() => true) } },
					{ $set: { status: 'instock' }, $unset: { recalled_at: '' } },
					{ session }
				)
			} else {
				const first = epcsOf((e) => (e.inbound_times ?? 0) <= 1)
				const returned = epcsOf((e) => (e.inbound_times ?? 0) > 1)
				if (first.length)
					await epcCollection.updateMany(
						{ epc: { $in: first } },
						{
							$set: { status: 'scanning', inbound_times: 0 },
							$unset: {
								inbound_at: '',
								storage_location: '',
								assembly_line: '',
								returned_at: '',
								recalled_at: ''
							}
						},
						{ session }
					)
				if (returned.length)
					await epcCollection.updateMany(
						{ epc: { $in: returned } },
						{
							$set: { status: 'recalled' },
							$inc: { inbound_times: -1 },
							$unset: { storage_location: '', assembly_line: '', returned_at: '' }
						},
						{ session }
					)
			}

			// 4. Subtract quantities
			const poShipping: Record<string, number> = {}
			for (const [moNo, sizes] of Object.entries(persisted)) {
				const mo: Record<string, number> = {}
				const audit: Record<string, number> = {}
				const daily: Record<string, number> = {}

				for (const [size, q] of Object.entries(sizes)) {
					if (isOutbound) {
						inc(mo, `size_ledger.${size}.shipped_out_qty`, -q.shipped_out_qty)
						inc(audit, `size_ledger.${size}.shipped_out_qty`, -q.shipped_out_qty)
						inc(daily, `shipping_progress.${moNo}.${size}`, -q.shipped_out_qty)
						inc(poShipping, `shipping_progress.${size}.shipped_out_qty`, -q.shipped_out_qty)
					} else {
						// first-time stock in counts as stocked_in_qty, later ones as total_return_tx
						inc(mo, `size_ledger.${size}.stocked_in_qty`, -q.stocked_in_qty)
						inc(mo, `size_ledger.${size}.total_return_tx`, -q.total_return_tx)
						inc(mo, `size_ledger.${size}.total_recall_tx`, -q.total_recall_tx)
						inc(daily, `size_ledger.${size}.stocked_in_qty`, -q.stocked_in_qty)
						inc(daily, `size_ledger.${size}.total_return_tx`, -q.total_return_tx)
						inc(daily, `size_ledger.${size}.total_recall_tx`, -q.total_recall_tx)
						// audit stocked_in_qty is net: in - recall + return
						inc(
							audit,
							`size_ledger.${size}.stocked_in_qty`,
							-(q.stocked_in_qty - q.total_recall_tx + q.total_return_tx)
						)
					}
				}

				if (isOutbound) {
					await mongoManager
						.getRepository('daily_po_shipping_progress')
						.updateOne(
							{ po, date: txDate },
							{ $inc: daily, $set: { [`transaction_history.${args.tx}.voided`]: true } },
							{ session }
						)
				} else {
					await mongoManager
						.getRepository('daily_mo_inventory_ledger')
						.updateOne(
							{ mo_no: moNo, date: txDate },
							{ $inc: daily, $set: { [`transaction_history.${args.tx}.voided`]: true } },
							{ session }
						)
				}

				if (Object.keys(mo).length)
					await mongoManager
						.getRepository('manufacturing_orders')
						.updateOne({ mo_no: moNo }, { $inc: mo }, { session })

				const storageLocations = isOutbound
					? undefined
					: await epcCollection.distinct(
							'storage_location',
							{ mo_no: moNo, scannable: true, status: 'instock' },
							{ session }
						)
				await mongoManager.getRepository('mo_inventory_audit').updateOne(
					{ mo_no: moNo, year_month: yearMonth },
					{
						$inc: audit,
						...(storageLocations && { $set: { storage_locations: storageLocations } })
					},
					{ session }
				)
			}

			if (isOutbound && Object.keys(poShipping).length)
				await mongoManager.getRepository('purchase_orders').updateOne({ po }, { $inc: poShipping }, { session })
		})

		// 5. Delete MSSQL records (test server only)
		if (txType === 'recall') {
			logger.info('Recall transaction: no MSSQL records to delete')
		} else {
			const targetEpcs = isOutbound ? epcsOf(() => true) : epcsOf((e) => (e.inbound_times ?? 0) <= 1)
			if (targetEpcs.length) {
				await mssqlManager.connect()
				await mssqlManager.query(
					/* SQL */ `
					DELETE FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
					WHERE EPC_Code IN (SELECT value FROM OPENJSON(@epcs))
					AND RIGHT(stationNO, 3) = @station`,
					{
						epcs: { type: mssql.NVarChar(mssql.MAX), value: JSON.stringify(targetEpcs) },
						station: { type: mssql.NVarChar(3), value: isOutbound ? '103' : '101' }
					}
				)
			}
		}

		// 6. Mark redis snapshot as voided
		await redis.lset(redisKey, snapshotIndex, SuperJson.stringify({ ...snapshot, voided: true }))

		logger.info('✅ Transaction restored successfully.')
	} catch (error) {
		exitCode = 1
		logger.error(error instanceof Error ? error : String(error))
	} finally {
		await mssqlManager.disconnect()
		await mongoManager.disconnect()
		redis.disconnect()
		process.exit(exitCode)
	}
}

main()
