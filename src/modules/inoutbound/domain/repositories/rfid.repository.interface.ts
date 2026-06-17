import { ElectronicProductCode } from '../entities/epc.entity'

export interface IInoutboundMssqlRepository {
	getEPCInformation(epcs: ElectronicProductCode[]): Promise<ElectronicProductCode[]>
}

export const INOUTBOUND_MSSQL_REPOSITORY = 'IInoutboundMssqlRepository'
