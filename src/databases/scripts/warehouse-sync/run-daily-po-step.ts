import { type mongo } from 'mongoose'
import { syncMongoDailyPoProgress } from './mongo-daily-po-progress'
import { readMssqlOutboundScans } from './mssql-outbound-scans'
import type { MssqlStreamRequest } from './mssql-stream'

export async function runDailyPoStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	tenant: string,
	generateId: (date: string) => string | Promise<string>,
	cutoff: Date
) {
	return syncMongoDailyPoProgress(database, readMssqlOutboundScans(pool.request(), tenant, cutoff), generateId)
}
