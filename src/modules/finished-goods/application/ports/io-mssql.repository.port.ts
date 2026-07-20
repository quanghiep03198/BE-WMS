import { TManufacturingOrder, UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { InventoryActions, InventoryStorageType } from '../../domain/constants'
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
			size_qty: number
			accumulated_qty: number
		}>
	>

	stockIn(
		epcs: ReadonlyArray<ElectronicProductCode>,
		stockInDetails: {
			mo_no: string
			inbound_device_sn: string
			rfid_status: InventoryActions
			rfid_use: InventoryStorageType
			dept_code: string
			dept_name: string
			storage: string
			quantity: number
			factory_code_produce: string
			username: string
			display_name: string
		}
	): Promise<void>

	stockOut(epcs: Array<ElectronicProductCode>): Promise<void>

	getExchangeTargetMo(targetMo: string, moSeq?: string): Promise<TManufacturingOrder>

	rollbackStockTransaction(stationNO: 'WH101' | 'WH103', epcs: Array<ElectronicProductCode>): Promise<void>

	exchangeManufacturingOrder(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void>

	rollbackExchangeMoTransaction(exchangedEpcs: Array<string>): void

	upsertEpcsMatch(payload: UpsertEpcsMatchData): Promise<void>
}

export const IO_MSSQL_REPOSITORY = 'IInoutboundMssqlRepository'
