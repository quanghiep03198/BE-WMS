import { DATA_SOURCE_ERP, RecordStatus } from '@/databases/constants'
import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'fs-extra'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { InventoryActions } from '../rfid/constants'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { TENANCY_DATA_SOURCE } from '../tenancy/constants'
import { SizeRun } from './types'

@Injectable()
export class OrderService {
	private readonly manfOrderSizeRunQuery: string = readFileSync(
		resolve(join(__dirname, './sql/mo-size-run.sql')),
		'utf-8'
	)
	private readonly purchaseOrderSizeRunQuery: string = readFileSync(
		resolve(join(__dirname, './sql/po-size-run.sql')),
		'utf-8'
	)

	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource
	) {}

	async searchCommandNumber(factoryCode: string, searchTerm: string) {
		return await this.dataSourceTNC
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 manu.mo_no`, 'mo_no')
			.addSelect(/* SQL */ `manu.created`, 'created')
			.from(/* SQL */ `wuerp_vnrd.dbo.ta_manufacturmst`, 'manu')
			.where(/* SQL */ `manu.mo_no LIKE :searchTerm`)
			.andWhere(/* SQL */ `manu.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			.andWhere(
				/* SQL */ `(
					(:factoryCode = 'VA1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'A') OR
					(:factoryCode = 'VB1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'B') OR
					(:factoryCode = 'VB2' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'C') OR
					(:factoryCode = 'CA1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'D')
			)`
			)
			// .andWhere (/* SQL */ `manu.cofactory_code = :factoryCode`)
			.setParameters({ factoryCode, searchTerm: `%${searchTerm}%` })
			.orderBy('manu.created', 'DESC')
			.getRawMany()
	}

	async searchPurchaseOrder(searchTerm: string): Promise<Array<{ po: string; is_completed: boolean }>> {
		const outboundQtyCte = this.dataSourceTNC
			.createQueryBuilder()
			.select('po')
			.addSelect(/* SQL */ `COUNT(DISTINCT EPC_Code)`, 'accumulated_outbound_qty')
			.from('DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily', 'b')
			.where(/* SQL */ `rfid_status = '${InventoryActions.OUTBOUND}'`)
			.andWhere(/* SQL */ `RIGHT(stationNO, 3) = '103'`)
			.andWhere(/* SQL */ `po LIKE '%${searchTerm}%'`)
			.groupBy('po')

		const queryBuilder = this.dataSourceTNC
			.createQueryBuilder()
			.addCommonTableExpression(outboundQtyCte.getQuery(), 'outbound_cte')
			.select(/* SQL */ `TOP 5 IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)`, 'po')
			.addSelect(/* SQL */ `SUM(a.or_totalqty) - SUM(a.or_totalcqty)`, 'po_qty')
			.addSelect(/* SQL */ `ISNULL(MAX(b.accumulated_outbound_qty), 0)`, 'accumulated_outbound_qty')
			.addSelect(
				/* SQL */ `
					CASE WHEN CAST(SUM(a.or_totalqty) - SUM(a.or_totalcqty) - ISNULL(MAX(b.accumulated_outbound_qty), 0) AS INT) = 0
						THEN CAST(1 AS BIT)
						ELSE CAST(0 AS BIT)
					END`,
				'is_completed'
			)
			.from('wuerp_vnrd.dbo.ta_ordermst', 'a')
			.leftJoin(
				'outbound_cte',
				'b',
				/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) = b.po`
			)
			.where(/* SQL */ `a.isactive = 'Y'`)
			.andWhere(
				/* SQL */ `a.custbrand_id IN (
					SELECT DISTINCT custbrand_id
					FROM wuerp_vnrd.dbo.ta_brand
					WHERE brand_code IN ('TV','KB','UG')
				)`
			)
			.andWhere(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) LIKE '%${searchTerm}%'`)
			.groupBy(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)`)
			.orderBy(/* SQL */ `po`, 'ASC')
			.addOrderBy(/* SQL */ `po_qty`, 'ASC')
			.addOrderBy(/* SQL */ `accumulated_outbound_qty`, 'ASC')

		return await queryBuilder.getRawMany<{ po: string; is_completed: boolean }>()
	}

	async getPurchaseOrderSizeRun(purchaseOrder: string) {
		return await this.dataSourceERP
			.query<
				Array<{
					po: string
					mo_no: string
					brand_name: string
					shoes_style: string
					color_sn: string
					ship_id: string
					ship_dest_country: string
					ship_type: string
					size_numcode: string
					qty: number
				}>
			>(this.purchaseOrderSizeRunQuery, [purchaseOrder])
			.then((result) =>
				result.map((item) => ({
					...item,
					size_numcode: Number.parseFloat(item.size_numcode) < 10 ? '0' + item.size_numcode : item.size_numcode
				}))
			)
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

	async getCustOrderByCommandNumber(
		commandNumber: string
	): Promise<Array<Partial<RFIDMatchCustomerEntity> & { size_sumqty: number }>> {
		return await this.dataSourceERP
			.createQueryBuilder()
			.select('a.mo_no', 'mo_no')
			.addSelect('i.brand_name', 'brand_name')
			.addSelect('a.mat_code', 'mat_code')
			.addSelect('b.mo_noseq', 'mo_noseq')
			.addSelect('b.or_no', 'or_no')
			.addSelect(`IIF(ISNULL(c.or_custpoone,'') = '',c.or_custpo,c.or_custpoone)`, 'or_cust_po')
			.addSelect('d.color_sn', 'color_sn')
			.addSelect('e.shoestyle_codefactory', 'factory_shoes_style')
			.addSelect(
				`CAST(ISNULL(g.shoestyle_codecust, '') + '/' + ISNULL(g.shoestyle_namecust, '') AS NVARCHAR(255))`,
				'cust_shoes_style'
			)
			.addSelect('h.size_code', 'size_code')
			.addSelect('h.size_sumqty', 'size_sumqty')
			.from('ta_manufacturmst', 'a')
			.leftJoin('ta_manufacturdet', 'b', 'a.mo_no = b.mo_no AND b.isactive = :recordStatus')
			.leftJoin('ta_ordermst', 'c', 'c.or_no = b.or_no AND c.isactive = :recordStatus')
			.leftJoin('ta_productmst', 'd', 'd.mat_code = a.mat_code AND d.isactive = :recordStatus')
			.leftJoin(
				'ta_shoefactorymst',
				'e',
				'e.shoestyle_systemcodefty = d.shoestyle_systemcodefty AND e.isactive = :recordStatus'
			)
			.leftJoin('ta_ordersizerun', 'f', 'f.or_no = b.or_no AND f.isactive = :recordStatus')
			.leftJoin(
				'ta_shoestylecolor',
				'g',
				'g.shoestyle_templink = d.shoestyle_templink AND g.isactive = :recordStatus'
			)
			.leftJoin('ta_ordersizerun', 'h', 'h.or_no = c.or_no AND h.isactive = :recordStatus')
			.leftJoin('ta_brand', 'i', 'i.custbrand_id = d.custbrand_id')
			.where('a.mo_no = :commandNumber')
			.andWhere('a.isactive = :recordStatus')
			.andWhere('a.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)')
			.orderBy('a.mo_no', 'DESC')
			.orderBy('b.mo_noseq', 'ASC')
			.addOrderBy('a.created', 'DESC')
			.limit(1)
			.setParameters({ commandNumber, recordStatus: RecordStatus.ACTIVE })
			.getRawMany<Partial<RFIDMatchCustomerEntity> & { size_sumqty: number }>()
	}

	async getSizeRunByCommandNumber(commandNumber: string) {
		return await this.dataSourceERP.query<Array<SizeRun>>(this.manfOrderSizeRunQuery, [commandNumber])
	}
}
