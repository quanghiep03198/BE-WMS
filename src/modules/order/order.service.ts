import { DATA_SOURCE_ERP, RecordStatus } from '@/databases/constants'
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

	private readonly sizeRunQuery: string = readFileSync(resolve(join(__dirname, './sql/order-size-run.sql')), 'utf-8')

	constructor(@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource) {}

	async searchCommandNumber(factoryCode: string, searchTerm: string) {
		return await this.dataSourceERP
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 manu.mo_no`, 'mo_no')
			.addSelect(/* SQL */ `manu.created`, 'created')
			.from(/* SQL */ `wuerp_vnrd.dbo.ta_manufacturmst`, 'manu')
			.where(/* SQL */ `manu.cofactory_code = :factoryCode`)
			.andWhere(/* SQL */ `manu.mo_no LIKE :searchTerm`)
			.andWhere(/* SQL */ `manu.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			.andWhere(
				/* SQL */ `(
				(:factoryCode = 'VA1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'A') OR
				(:factoryCode = 'VB1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'B') OR
				(:factoryCode = 'VB2' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'C') OR
				(:factoryCode = 'CA1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'D')
		  		)`
			)
			.setParameters({ factoryCode, searchTerm: `%${searchTerm}%` })
			.orderBy('manu.created', 'DESC')
			.getRawMany()
	}

	async searchPurchaseOrder(searchTerm: string): Promise<Array<{ po: string; is_completed: boolean }>> {
		const cusBrandSubQuery = this.dataSourceERP
			.createQueryBuilder()
			.select('b.custbrand_id', 'custbrand_id')
			.from('wuerp_vnrd.dbo.ta_brand', 'b')
			.where(/* SQL */ `b.brand_code IN ('TV','KB','UG')`)
			.getQuery()

		const results = await this.dataSourceERP
			.createQueryBuilder()
			.select(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)`, 'po')
			.addSelect(
				/* SQL */ `CAST(SUM(a.or_totalqty) - SUM(a.or_totalcqty) AS INT) - CAST(ISNULL(c.total_outbound_qty, 0) AS INT)`,
				'po_qty_diff'
			)
			.from(/* SQL */ `wuerp_vnrd.dbo.ta_ordermst`, 'a')
			.leftJoin(
				(qb) => {
					return qb
						.subQuery()
						.select('po')
						.addSelect(/* SQL */ `COUNT(DISTINCT EPC_Code)`, 'total_outbound_qty')
						.from(/* SQL */ `DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily`, 'c')
						.where(/* SQL */ `c.rfid_status = 'B'`)
						.andWhere(/* SQL */ `c.rfid_use = 'D'`)
						.andWhere(/* SQL */ `c.stationNO LIKE 'CUS%WH103'`)
						.groupBy('po')
				},
				'c',
				/* SQL */ `c.po = IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)`
			)
			.where(/* SQL */ `a.custbrand_id IN (${cusBrandSubQuery})`)
			.andWhere(/* SQL */ `a.isactive = :recordStatus`, { recordStatus: RecordStatus.ACTIVE })
			.andWhere(
				/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) LIKE CONCAT('%', :searchTerm, '%')`,
				{ searchTerm }
			)
			.limit(5)
			.groupBy(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)`)
			.addGroupBy(/* SQL */ `c.total_outbound_qty`)
			.orderBy(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)`, 'ASC')
			.getRawMany()

		return results.map((record) => ({ po: record.po, is_completed: record.po_qty_diff === 0 }))
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
