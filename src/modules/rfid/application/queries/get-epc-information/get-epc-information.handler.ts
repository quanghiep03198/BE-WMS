import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EXCLUDED_ORDERS } from '@/modules/rfid/domain/constants'
import { RFIDMatchCustomerEntity } from '@/modules/rfid/infrastructure/persistence/mssql/rfid-customer-match.entity'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectDataSource } from '@nestjs/typeorm'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { GetEpcInformationQuery } from './get-epc-information.query'

export type EpcInformation = Pick<RFIDMatchCustomerEntity, 'epc' | 'mo_no' | 'size_numcode' | 'factory_shoes_style'> & {
	scanned?: boolean
	stored_at?: null | Date | string
}

export type StoredRFIDReaderItem = EpcInformation & Record<'station_no' | 'factory_code_produce', string>

export type StoredRFIDReaderData = {
	epcs: Array<StoredRFIDReaderItem>
}

@QueryHandler(GetEpcInformationQuery)
export class GetEpcInformationQueryHandler implements IQueryHandler<GetEpcInformationQuery> {
	private readonly getEpcInformationQuery: string = resolve(
		join(__dirname, '../../../infrastructure/sql/epc-information.sql')
	)

	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE)
		private readonly dataSourceDL: DataSource
	) {}

	async execute({ data }: GetEpcInformationQuery): Promise<any> {
		const queryParamters: string[] = []
		queryParamters[0] = JSON.stringify(data)
		queryParamters[1] = JSON.stringify(EXCLUDED_ORDERS)

		return await this.dataSourceDL.query<StoredRFIDReaderItem[]>(this.getEpcInformationQuery, queryParamters)
	}
}
