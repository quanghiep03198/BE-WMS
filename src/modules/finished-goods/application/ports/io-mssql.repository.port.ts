import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { StationNO } from '@modules/finished-goods/domain/utils'
import { ElectronicProductCode } from '../../domain/value-objects/epc.vo'
import { SizeNumber } from '../../domain/value-objects/size-number.vo'

/**
 * @description
 * - This interface defines methods for retrieving raw data from SQL Server for business operations related to inventory management.
 * - Interface này định nghĩa các phương thức lấy dữ liệu thô từ SQL Server cho các thao tác nghiệp vụ liên quan đến kho hàng
 */
export interface IIoMssqlRepository {
	getEpcsInformation(epcs: ElectronicProductCode[]): Promise<ElectronicProductCode[]>

	getMoInboundProgress(
		manufacturingOrder: string,
		pendingInboundEpcs: ElectronicProductCode[]
	): Promise<
		Array<{
			size_numcode: SizeNumber
			size_qty: number
			accumulated_qty: number
		}>
	>

	getPoOutboundProgress(
		purchaseOrder: string,
		pendingInboundEpcs: ElectronicProductCode[]
	): Promise<
		Array<{
			size_numcode: SizeNumber
			order_qty: number
			accumulated_qty: number
		}>
	>

	commitStockVariation(
		data: Array<
			Array<{
				epc: string
				mo_no: string
				size_numcode: string
				factory_code: string
				status: string
				inventory_variation_type: string
				dept_code: string
				dept_name: string
				storage: string
				station_no: StationNO
			}>
		>
	): Promise<void>

	stockOut(epcs: Array<ElectronicProductCode>): Promise<void>

	rollbackStockTransaction(stationNO: 'WH101' | 'WH103', epcs: Array<ElectronicProductCode>): Promise<void>

	exchangeManufacturingOrder(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void>

	rollbackExchangeMoTransaction(exchangedEpcs: Array<string>): void

	upsertEpcsMatch(payload: UpsertEpcsMatchData): Promise<void>
}

export const IO_MSSQL_REPOSITORY = Symbol('IInoutboundMssqlRepository')
