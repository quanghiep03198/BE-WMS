import { DATA_SOURCE_ERP } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'fs-extra'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'

@Injectable()
export class OrderService {
	constructor(@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource) {}

	async getCustOrderDetails(commandNumbers: Array<string>): Promise<Partial<RFIDMatchCustomerEntity>[]> {
		let orderInformation: Partial<RFIDMatchCustomerEntity>[] = []
		for (const commandNumber of commandNumbers) {
			const orderInfo = await this.getCustOrderByCommandNumber(commandNumber)
			if (orderInfo?.length === 0) continue
			orderInformation = [...orderInformation, ...orderInfo]
		}
		return orderInformation
	}

	async getCustOrderByCommandNumber(commandNumber: string) {
		const orderInformationQuery = readFileSync(join(__dirname, './sql/order-information.sql'), 'utf-8').toString()
		return this.dataSourceERP.query<Partial<RFIDMatchCustomerEntity>[]>(orderInformationQuery, [commandNumber])
	}
}
