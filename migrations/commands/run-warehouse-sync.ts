import { StockTransactionIdMongoGenerator } from '@modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-id-mongo.generator'
import { format } from 'date-fns'
import type { mongo } from 'mongoose'
import type { MssqlStreamRequest } from '../helpers/mssql-stream'
import { getVietnamDayCutoff } from './cutoff'
import { runDailyMoInventoryLedgerStep } from './daily-mo-inventory-ledger'
import { runDefectiveGoodsStep } from './defective-goods'
import { DEFAULT_EPC_SYNC_SETTINGS, type EpcSyncSettings } from './epc-sync-settings'
import { exportWarehouseSyncReport } from './export-warehouse-sync-report'
import { runFinishedGoodsEpcStep } from './finished-goods-epcs'
import { runMoInventoryAuditStep } from './mo-inventory-audit'
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
	inboundDeviceSn: string
	outboundDeviceSn: string
	includeBackups: boolean
	noCutoff?: boolean
	epcSync?: EpcSyncSettings
	creatorUsername: string
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
	cutoff: Date | undefined
	generateId: (date: string) => Promise<string>
	generateLedgerId: (date: string) => Promise<string>
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
		runManufacturingOrderStep(pool, database, config.factoryCode, cutoff),
	'daily PO progress': ({ pool, database, config, generateId, cutoff }) =>
		runDailyPoStep(pool, database, config.factoryCode, generateId, cutoff),
	'RFID devices': ({ pool, database, config }) =>
		runRfidStep(pool, database, config.factoryCode, config.creatorUsername),
	'EPC matches': ({ pool, database, config }) =>
		runEpcMatchStep(pool, database, config.epcSync ?? DEFAULT_EPC_SYNC_SETTINGS),
	'finished goods EPCs': ({ pool, database, config }) =>
		runFinishedGoodsEpcStep(pool, database, {
			...(config.epcSync ?? DEFAULT_EPC_SYNC_SETTINGS),
			inboundDeviceSn: config.inboundDeviceSn,
			outboundDeviceSn: config.outboundDeviceSn,
			includeBackups: config.includeBackups
		}),
	'inventory audit': ({ pool, database, config }) => runMoInventoryAuditStep(pool, database, config.factoryCode),
	'daily MO inventory ledger': ({ pool, database, generateLedgerId }) =>
		runDailyMoInventoryLedgerStep(pool, database, generateLedgerId),
	'truckload deliveries': ({ pool, database, config }) =>
		runTruckloadDeliveryStep(pool, database, config.creatorUsername),
	'defective goods': ({ pool, database, config }) =>
		runDefectiveGoodsStep(pool, database, undefined, config.creatorUsername),
	'Excel report': ({ database, config }) => exportWarehouseSyncReport(database, config.outputFilename)
}

export function createWarehouseSyncRunner(
	dependencies: WarehouseSyncDependencies,
	shouldContinue?: (step: WarehouseSyncStep, error: unknown) => Promise<boolean>
): (pool: WarehouseSyncPool, database: mongo.Db, config: WarehouseSyncConfig, now?: Date) => Promise<void> {
	return async (pool, database, config, now = new Date()) => {
		let generator: StockTransactionIdMongoGenerator | undefined
		const nextId = (type: 'stock_in' | 'stock_out', date: string) => {
			const transactionDate = new Date(`${date}T12:00:00`)
			if (!Number.isFinite(transactionDate.getTime()) || format(transactionDate, 'yyyy-MM-dd') !== date) {
				throw new Error(`Invalid stock transaction date: ${date}`)
			}
			generator ??= StockTransactionIdMongoGenerator.fromDatabase(database)
			return generator.nextId(type, transactionDate)
		}
		const context: WarehouseSyncContext = {
			pool,
			database,
			config,
			now,
			cutoff: config.noCutoff ? undefined : getVietnamDayCutoff(now),
			generateId: (date) => nextId('stock_out', date),
			generateLedgerId: (date) => nextId('stock_in', date)
		}
		const steps: WarehouseSyncStep[] = selectWarehouseSyncStages(config.step, config.fromStep).flatMap((name) => {
			const step: WarehouseSyncStep = { name, run: () => dependencies[name](context).then(() => undefined) }

			if (name === 'purchase orders')
				return [
					{
						name: 'deduplicate RFID backup records',
						run: async () => {
							await pool.request().query(/* SQL */ `
							WITH CTE AS (
								SELECT EPC_Code, keyid, record_time,
									ROW_NUMBER() OVER (
										PARTITION BY EPC_Code, stationNO, rfid_status, rfid_use
										ORDER BY record_time ASC
									) AS row_num
								FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
							)
							DELETE CTE
							WHERE row_num > 1;
						`)
						}
					},
					step
				]
			else if (name === 'inventory audit')
				return [
					{
						name: 'import mo inventory audit',
						run: async () => {
							const lastDayOfPreviousMonth = format(new Date(now.getFullYear(), now.getMonth(), 0), 'yyyy-MM-dd')
							const today = format(now, 'yyyy-MM-dd')

							await pool.request().query(/* SQL */ `
							DECLARE @lastDayOfPreviousMonth DATETIME = CAST('${lastDayOfPreviousMonth}' AS DATETIME);
							DECLARE @today DATETIME = CAST('${today}' AS DATETIME);
							EXEC DV_DATA_LAKE.dbo.sp_import_invprod_VER2 @lastDayOfPreviousMonth;
							EXEC DV_DATA_LAKE.dbo.sp_import_invprod_VER2 @today;
						`)
						}
					},
					step
				]
			else return [step]
		})
		await runSteps(steps, config.logFilename, shouldContinue)
	}
}

export async function runWarehouseSync(
	pool: WarehouseSyncPool,
	database: mongo.Db,
	config: WarehouseSyncConfig,
	now?: Date,
	shouldContinue?: (step: WarehouseSyncStep, error: unknown) => Promise<boolean>
): Promise<void> {
	await createWarehouseSyncRunner(defaultDependencies, shouldContinue)(pool, database, config, now)
}
