import { UpsertStockInDTO } from '../../presentation/dto/rfid-inbound.dto'
import { ElectronicProductCode } from '../entities/epc.entity'

export interface IInoutboundMssqlRepository {
	getEpcsInformation(epcs: ElectronicProductCode[]): Promise<ElectronicProductCode[]>

	getExcessInboundQuantities(
		manufacturingOrder: string,
		epcs: ElectronicProductCode[]
	): Promise<
		Array<{
			size_numcode: string
			missing_qty: number
		}>
	>

	stockIn(epcs: Array<ElectronicProductCode>, stockInDetails: UpsertStockInDTO): Promise<void>

	rollbackStoredEpcs(epcs: Array<ElectronicProductCode>): Promise<void>
}

export const IO_MSSQL_REPOSITORY = 'IInoutboundMssqlRepository'
