import { generateShortId } from '@common/utils/short-id.util'
import type { mongo } from 'mongoose'
import { createHash } from 'node:crypto'
import { getVietnamDayCutoff } from './cutoff'
import { runDailyMoInventoryLedgerStep } from './daily-mo-inventory-ledger'
import { runDefectiveGoodsStep } from './defective-goods'
import { exportWarehouseSyncReport } from './export-warehouse-sync-report'
import { runFinishedGoodsEpcStep } from './finished-goods-epcs'
import { runMoInventoryAuditStep } from './mo-inventory-audit'
import type { MssqlStreamRequest } from './mssql-stream'
import { runDailyPoStep } from './run-daily-po-step'
import { runDepartmentStep } from './run-department-step'
import { runEpcMatchStep } from './run-epc-match-step'
import { runManufacturingOrderStep } from './run-manufacturing-order-step'
import { runProductSpecificationStep } from './run-product-specification-step'
import { runPurchaseOrderStep } from './run-purchase-order-step'
import { runRfidStep } from './run-rfid-step'
import { runSteps, type WarehouseSyncStep } from './run-steps'
import { runUserStep } from './run-user-step'
import { runWarehouseStep } from './run-warehouse-step'
import { runTruckloadDeliveryStep } from './truckload-delivery'
import { selectWarehouseSyncStages, type WarehouseSyncStageName } from './warehouse-sync-stages'

export type { WarehouseSyncStageName } from './warehouse-sync-stages'

export interface WarehouseSyncConfig {
	factoryCode: string
	moPrefix: string
	inboundDeviceSn: string
	outboundDeviceSn: string
	includeBackups: boolean
	creatorUsername: string
	referenceWorkbook: string
	referenceSheet: string
	outputFilename: string
	logFilename: string
	step?: string
	fromStep?: string
}

export interface WarehouseSyncPool {
	request(): MssqlStreamRequest & {
		query(sql: string): Promise<{ recordset: Array<Record<string, unknown>> }>
	}
}

export interface WarehouseSyncContext {
	pool: WarehouseSyncPool
	database: mongo.Db
	config: WarehouseSyncConfig
	now: Date
	cutoff: Date
	generateId: () => string
	generateLedgerId: (signature: string) => string
}

export type WarehouseSyncDependencies = Record<
	WarehouseSyncStageName,
	(context: WarehouseSyncContext) => Promise<unknown>
>

const defaultDependencies: WarehouseSyncDependencies = {
	users: ({ pool, database }) => runUserStep(pool, database, 10),
	warehouses: ({ pool, database, config }) =>
		runWarehouseStep(pool, database, config.factoryCode, config.creatorUsername),
	departments: ({ pool, database, config }) => runDepartmentStep(pool, database, config.factoryCode),
	'product specifications': ({ pool, database }) => runProductSpecificationStep(pool, database),
	'purchase orders': ({ pool, database, cutoff }) => runPurchaseOrderStep(pool, database, cutoff),
	'manufacturing orders': ({ pool, database, config, cutoff }) =>
		runManufacturingOrderStep(pool, database, config.factoryCode, cutoff, config.moPrefix),
	'daily PO progress': ({ pool, database, config, generateId, cutoff }) =>
		runDailyPoStep(pool, database, config.factoryCode, generateId, cutoff),
	'RFID devices': ({ pool, database, config }) => runRfidStep(pool, database, config.factoryCode),
	'EPC matches': ({ pool, database }) => runEpcMatchStep(pool, database),
	'finished goods EPCs': ({ pool, database, config }) =>
		runFinishedGoodsEpcStep(pool, database, {
			inboundDeviceSn: config.inboundDeviceSn,
			outboundDeviceSn: config.outboundDeviceSn,
			includeBackups: config.includeBackups
		}),
	'inventory audit': ({ pool, database, config }) => runMoInventoryAuditStep(pool, database, config.factoryCode),
	'daily MO inventory ledger': ({ pool, database, config, generateLedgerId }) =>
		runDailyMoInventoryLedgerStep(pool, database, config.moPrefix, generateLedgerId),
	'truckload deliveries': ({ pool, database, config }) =>
		runTruckloadDeliveryStep(pool, database, config.creatorUsername),
	'defective goods': ({ pool, database }) => runDefectiveGoodsStep(pool, database),
	'Excel report': ({ database, config }) =>
		exportWarehouseSyncReport(database, config.referenceWorkbook, config.referenceSheet, config.outputFilename)
}

export function createWarehouseSyncRunner(
	dependencies: WarehouseSyncDependencies,
	writeTerminal?: (line: string) => void,
	shouldContinue?: (step: WarehouseSyncStep, error: unknown) => Promise<boolean>
): (pool: WarehouseSyncPool, database: mongo.Db, config: WarehouseSyncConfig, now?: Date) => Promise<void> {
	return async (pool, database, config, now = new Date()) => {
		const context: WarehouseSyncContext = {
			pool,
			database,
			config,
			now,
			cutoff: getVietnamDayCutoff(now),
			generateId: generateShortId,
			generateLedgerId: (signature) => createHash('sha256').update(signature).digest('hex')
		}
		const steps: WarehouseSyncStep[] = selectWarehouseSyncStages(config.step, config.fromStep).map((name) => ({
			name,
			run: () => dependencies[name](context).then(() => undefined)
		}))
		await runSteps(steps, config.logFilename, writeTerminal, shouldContinue)
	}
}

export async function runWarehouseSync(
	pool: WarehouseSyncPool,
	database: mongo.Db,
	config: WarehouseSyncConfig,
	now?: Date,
	shouldContinue?: (step: WarehouseSyncStep, error: unknown) => Promise<boolean>
): Promise<void> {
	await createWarehouseSyncRunner(defaultDependencies, undefined, shouldContinue)(pool, database, config, now)
}
