import { InventoryActions, InventoryStorageType } from '../../domain/constants'
import { MoExchangeSession } from '../../domain/models/mo-exchange-session.model'
import { ElectronicProductCode } from '../../domain/value-objects/epc.vo'

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
			size_numcode: string
			size_qty: number
			accumulated_inbound_qty: number
		}>
	>

	stockIn(
		epcs: Array<ElectronicProductCode>,
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

	getPendingExchangeMosDetails(sourceMos: Array<string>, targetMo: string): Promise<MoExchangeSession>

	rollbackInoutboundTransaction(stationNO: 'WH101' | 'WH103', epcs: Array<ElectronicProductCode>): Promise<void>

	exchangeManufacturingOrder(exchangeSkus: Array<string>, targetMo: string): Promise<void>
}

export const IO_MSSQL_REPOSITORY = 'IInoutboundMssqlRepository'
