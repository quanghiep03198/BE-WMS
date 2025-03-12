import { DATA_SOURCE_ERP } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'fs-extra'
import { uniqBy } from 'lodash'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { SizeRun } from './types'

@Injectable()
export class OrderService {
	private readonly orderInformationQuery: string = readFileSync(
		resolve(join(__dirname, './sql/order-information.sql')),
		'utf-8'
	)
	private readonly searchPurchaseOrderQuery: string = readFileSync(
		resolve(join(__dirname, './sql/search-purchase-order.sql')),
		'utf-8'
	)
	private readonly sizeRunQuery = readFileSync(resolve(join(__dirname, './sql/order-size-run.sql')), 'utf-8')

	constructor(@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource) {}

	async searchCommandNumber(factoryCode: string, searchTerm: string) {
		return await this.dataSourceERP
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 manu.mo_no`, 'mo_no')
			.addSelect(/* SQL */ `manu.created`, 'created')
			.from(/* SQL */ `wuerp_vnrd.dbo.ta_manufacturmst`, 'manu')
			.where(/* SQL */ `manu.cofactory_code = :factoryCode`, { factoryCode })
			.andWhere(/* SQL */ `manu.mo_no LIKE :searchTerm`, { searchTerm: `%${searchTerm}%` })
			.andWhere(/* SQL */ `manu.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			.orderBy(/* SQL */ `manu.created`, 'DESC')
			.getRawMany()
	}

	async searchPurchaseOrder(searchTerm: string) {
		return await this.dataSourceERP.query<Array<{ po: string }>>(this.searchPurchaseOrderQuery, [searchTerm])
	}

	async getCustOrderDetails(commandNumbers: Array<string>): Promise<Partial<RFIDMatchCustomerEntity>[]> {
		let orderInformation: Partial<RFIDMatchCustomerEntity>[] = []
		for (const commandNumber of commandNumbers) {
			const orderInfo = await this.getCustOrderByCommandNumber(commandNumber)
			if (orderInfo?.length === 0) continue
			orderInformation = [...orderInformation, ...orderInfo.slice(0)]
		}
		return orderInformation
	}

	async getCustOrderByCommandNumber(commandNumber: string) {
		const data = await this.dataSourceERP.query<Array<Partial<RFIDMatchCustomerEntity> & { size_sumqty: number }>>(
			this.orderInformationQuery,
			[commandNumber]
		)
		return uniqBy(data, 'mo_no')
	}

	async getSizeRunByCommandNumber(commandNumber: string) {
		return await this.dataSourceERP.query<Array<SizeRun>>(this.sizeRunQuery, [commandNumber])
	}
}
