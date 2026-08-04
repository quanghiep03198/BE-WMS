import { DATA_SOURCE_ERP } from '@databases/constants'
import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { InventoryActions } from '../finished-goods/domain/constants'
import purchaseOrderSizeRunQuery from './sql/po-size-run.sql'

import { TENANCY_DATA_SOURCE } from '../tenancy/constants'
import { ORDER_REPOSITORY } from './order.constant'
import { IOrderRepository } from './order.repository.interface'

@Injectable()
export class OrderService {
	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository
	) {}

	async searchManufacturingOrder(factoryCode: string, searchTerm: string) {
		return await this.dataSourceTNC
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 manu.mo_no`, 'mo_no')
			.addSelect(/* SQL */ `manu.created`, 'created')
			.from(/* SQL */ `wuerp_vnrd.dbo.ta_manufacturmst`, 'manu')
			.where(/* SQL */ `manu.mo_no LIKE :searchTerm`)
			.andWhere(/* SQL */ `manu.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			// .andWhere(
			// 	/* SQL */ `(
			// 		(:factoryCode = 'VA1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'A')
			// 		OR (:factoryCode = 'VB1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'B')
			// 		OR (:factoryCode = 'VB2' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'C')
			// 		OR (:factoryCode = 'CA1' AND RIGHT(LEFT(manu.mo_no, 3), 1) = 'D')
			// 	)`
			// )
			.andWhere(/* SQL */ `manu.cofactory_code = :factoryCode`)
			.setParameters({ factoryCode, searchTerm: `%${searchTerm}%` })
			.orderBy('manu.created', 'DESC')
			.getRawMany()
	}

	async searchPurchaseOrder(
		searchTerm: string,
		shouldFilterAllBrands?: boolean
	): Promise<Array<{ po: string; is_completed: boolean }>> {
		const outboundQtyCte = this.dataSourceTNC
			.createQueryBuilder()
			.select([/* SQL */ `DISTINCT po AS po`, /* SQL */ `COUNT(DISTINCT EPC_Code) AS accumulated_outbound_qty`])
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
			.addSelect(/* SQL */ `MAX(c.color_sn)`, 'color_sn')
			.addSelect(/* SQL */ `MAX(d.shoestyle_codefactory)`, 'factory_shoes_style')
			.addSelect(/* SQL */ `MAX(e.brand_name)`, 'brand_name')
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
			.leftJoin(
				(qb) =>
					qb
						.select('mat_code', 'mat_code')
						.addSelect('color_sn', 'color_sn')
						.addSelect('shoestyle_systemcodefty', 'shoestyle_systemcodefty')
						.from('wuerp_vnrd.dbo.ta_productmst', 'c'),
				'c',
				'c.mat_code = a.mat_code'
			)
			.leftJoin(
				(qb) =>
					qb
						.select('shoestyle_codefactory', 'shoestyle_codefactory')
						.addSelect('shoestyle_systemcodefty', 'shoestyle_systemcodefty')
						.from('wuerp_vnrd.dbo.ta_shoefactorymst', 'd'),
				'd',
				'd.shoestyle_systemcodefty = c.shoestyle_systemcodefty'
			)
			.leftJoin(
				(qb) => qb.select('custbrand_id').addSelect('brand_name').from('wuerp_vnrd.dbo.ta_brand', 'e'),
				'e',
				'e.custbrand_id = a.custbrand_id'
			)
			.where(/* SQL */ `a.isactive = 'Y'`)
			.andWhere(
				shouldFilterAllBrands
					? '1=1'
					: /* SQL */ `a.custbrand_id IN (
					SELECT DISTINCT custbrand_id
					FROM wuerp_vnrd.dbo.ta_brand
					WHERE brand_code IN ('TV','KB','UG')
				)`
			)
			.andWhere(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) LIKE '%${searchTerm}%'`)
			.andWhere(/* SQL */ `a.type_order = 'A'`)
			.groupBy(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)`)
			.orderBy(/* SQL */ `po`, 'ASC')
			.addOrderBy(/* SQL */ `po_qty`, 'ASC')
			.addOrderBy(/* SQL */ `accumulated_outbound_qty`, 'ASC')

		return await queryBuilder.getRawMany<{ po: string; is_completed: boolean }>()
	}

	async getPurchaseOrderInfo(purchaseOrder: string) {
		return await this.dataSourceERP
			.createQueryBuilder()
			.select([
				`IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) AS po`,
				`d.brand_name AS brand_name`,
				`c.shoestyle_codefactory AS factory_shoes_style`,
				`b.color_sn AS color_sn`
			])
			.from('wuerp_vnrd.dbo.ta_ordermst', 'a')
			.leftJoin(
				(qb) =>
					qb
						.select('mat_code', 'mat_code')
						.addSelect('color_sn', 'color_sn')
						.addSelect('shoestyle_systemcodefty', 'shoestyle_systemcodefty')
						.from('wuerp_vnrd.dbo.ta_productmst', 'b'),
				'b',
				'b.mat_code = a.mat_code'
			)
			.leftJoin(
				(qb) =>
					qb
						.select('shoestyle_codefactory', 'shoestyle_codefactory')
						.addSelect('shoestyle_systemcodefty', 'shoestyle_systemcodefty')
						.from('wuerp_vnrd.dbo.ta_shoefactorymst', 'c'),
				'c',
				'c.shoestyle_systemcodefty = b.shoestyle_systemcodefty'
			)
			.leftJoin(
				(qb) => qb.select('custbrand_id').addSelect('brand_name').from('wuerp_vnrd.dbo.ta_brand', 'e'),
				'd',
				'd.custbrand_id = a.custbrand_id'
			)
			.where(`IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) = :purchaseOrder`)
			.setParameters({ purchaseOrder })
			.getRawOne<{ po: string; brand_name: string; factory_shoes_style: string; color_sn: string }>()
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
			>(purchaseOrderSizeRunQuery, [purchaseOrder])
			.then((result) =>
				result.map((item) => ({
					...item,
					size_numcode: Number.parseFloat(item.size_numcode) < 10 ? '0' + item.size_numcode : item.size_numcode
				}))
			)
	}

	async getManufacturingOrderSizeRun(manufacturingOrder: string, moSeq: string = '001') {
		return await this.orderRepository.getManufacturingOrder(manufacturingOrder, moSeq)
	}
}
