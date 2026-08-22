import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { StationNO } from '@modules/finished-goods/domain/utils'

/**
 * @description
 * - This interface defines methods for retrieving raw data from SQL Server for business operations related to inventory management.
 * - Interface này định nghĩa các phương thức lấy dữ liệu thô từ SQL Server cho các thao tác nghiệp vụ liên quan đến kho hàng
 */
export interface IMssqlFinishedGoodsRepository {
	commitStockFluctuation(
		data: Array<
			Array<{
				epc: string
				mo_no: string
				size_numcode: string
				factory_code: string
				status: string
				inventory_ledger_type: string
				dept_code: string
				dept_name: string
				storage: string
				station_no: StationNO
			}>
		>
	): Promise<void>

	commitStockOut(
		epcs: Array<
			Array<{
				epc: string
				mo_no: string
				size_numcode: string
				factory_code: string
				status: string
				inventory_ledger_type: string
				station_no: StationNO
			}>
		>
	): Promise<void>

	exchangeManufacturingOrder(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void>

	upsertEpcsMatch(payload: UpsertEpcsMatchData, insertOnly?: boolean): Promise<void>
}

export const MSSQL_FINISHED_GOODS_REPOSITORY = Symbol('IMssqlFinishedGoodsRepository')
