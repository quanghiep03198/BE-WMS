import { Inject, Injectable } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, IsNull, Not } from 'typeorm'
import { DefectiveCategory } from '../defective-goods/constants'
import { DefectiveGoodsEntity } from '../defective-goods/entities/defective-goods.entity'
import { InventoryActions } from '../rfid/domain/constants'
import { RFIDInventoryBackupEntity } from '../rfid/infrastructure/entities/rifd-inventory.entity'
import { TENANCY_DATA_SOURCE } from '../tenancy/constants'
import { IAnnuallyInOutboundStatistics, IMonthlyInventoryComparison } from './statistic.interface'

@Injectable()
export class StatisticService {
	private readonly inventoryComparisonQuery: string = readFileSync(
		join(__dirname, './sql/monthly-inventory-comparison.sql'),
		'utf-8'
	)

	private readonly annuallyInboundAnalysisQuery: string = readFileSync(
		join(__dirname, './sql/annually-inoutbound-overview.sql'),
		'utf-8'
	)

	constructor(@Inject(TENANCY_DATA_SOURCE) private readonly dataSource: DataSource) {}

	public async getInventoryComparison() {
		const calcPercentageChange = (current: number, previous: number): number => {
			current ??= 0
			previous ??= 0
			return previous ? Number((((current - previous) / previous) * 100).toFixed(2)) : current ? 100 : 0
		}

		return await this.dataSource
			.query<Array<IMonthlyInventoryComparison>>(this.inventoryComparisonQuery)
			.then((result) => {
				const data = result.at(0)
				const currMonthInventoryTurnover = Number.parseFloat(
					(data.curr_month_outbound / ((data.curr_month_initial_qty + data.curr_month_final_qty) / 2)).toFixed(2)
				)
				const prevMonthInventoryTurnover = Number.parseFloat(
					(data.prev_month_outbound / ((data.prev_month_initial_qty + data.prev_month_final_qty) / 2)).toFixed(2)
				)
				return {
					...data,
					inbound_difference: data.curr_month_inbound - data.prev_month_inbound,
					outbound_difference: data.curr_month_outbound - data.prev_month_outbound,
					inventory_difference: data.curr_period_inventory_qty - data.prev_period_inventory_qty,
					inbound_percentage_change: calcPercentageChange(data.curr_month_inbound, data.prev_month_inbound),
					outbound_percentage_change: calcPercentageChange(data.curr_month_outbound, data.prev_month_outbound),
					inventory_percentage_change: calcPercentageChange(
						data.curr_period_inventory_qty,
						data.prev_period_inventory_qty
					),
					curr_month_turnover: currMonthInventoryTurnover,
					prev_month_turnover: prevMonthInventoryTurnover,
					inventory_turnover_difference: Number.parseFloat(
						(currMonthInventoryTurnover - prevMonthInventoryTurnover).toFixed(2)
					),
					turnover_percentage_change: calcPercentageChange(currMonthInventoryTurnover, prevMonthInventoryTurnover)
				}
			})
	}

	public async getAnnuallyInoutboundOverview(year: number) {
		return await this.dataSource.query<Array<IAnnuallyInOutboundStatistics>>(this.annuallyInboundAnalysisQuery, [
			year
		])
	}

	public async getDefectiveGoodsInventoryComposition() {
		const data = await this.dataSource
			.getRepository(DefectiveGoodsEntity)
			.createQueryBuilder()
			.select('defective_category')
			.addSelect(
				/* SQL */ `
				SUM(
					CASE 
						WHEN unit = 'prs' AND defective_category = 'C' THEN 2
						ELSE 1
					END
				)`,
				'qty'
			)
			.where({ ri_cancel: false })
			.andWhere({ inbound_date: Not(IsNull()) })
			.andWhere({ storage_location: Not(IsNull()) })
			.groupBy('defective_category')
			.getRawMany()

		if (!data.some((item) => item.defective_category === DefectiveCategory.B_GRADE))
			data.push({ defective_category: DefectiveCategory.B_GRADE, qty: 0 })
		if (!data.some((item) => item.defective_category === DefectiveCategory.C_GRADE))
			data.push({ defective_category: DefectiveCategory.C_GRADE, qty: 0 })
		if (!data.some((item) => item.defective_category === DefectiveCategory.RESEARCH_DEVELOPMENT))
			data.push({ defective_category: DefectiveCategory.RESEARCH_DEVELOPMENT, qty: 0 })

		return data.sort((a, b) => a.defective_category.localeCompare(b.defective_category))
	}

	public async getAssemblyLineProductivity() {
		return await this.dataSource
			.getRepository(RFIDInventoryBackupEntity)
			.createQueryBuilder('a')
			.select(/* SQL */ `COUNT(DISTINCT a.EPC_Code)`, 'volumn')
			.addSelect(/* SQL */ `FORMAT(a.record_time, 'yyyy-MM-dd')`, 'work_date')
			.addSelect(/* SQL */ `c.brand_name`, 'brand_name')
			.innerJoin(
				(qb) =>
					qb.subQuery().select('b.mo_no').addSelect('b.custbrand_id').from('wuerp_vnrd.dbo.ta_manufacturmst', 'b'),
				'b',
				/* SQL */ `a.mo_no = b.mo_no`
			)
			.innerJoin(
				(qb) =>
					qb
						.subQuery()
						.select('c.custbrand_id')
						.addSelect('c.brand_name')
						.from('wuerp_vnrd.dbo.ta_brand', 'c')
						.where(/* SQL */ `c.brand_code IN ('UG', 'TV', 'KB')`),
				'c',
				/* SQL */ `b.custbrand_id = c.custbrand_id`
			)
			.where(/* SQL */ `CAST(a.record_time AS DATE) >= CAST(DATEADD(MONTH, -3, GETDATE()) AS DATE)`)
			.groupBy(/* SQL */ `FORMAT(a.record_time, 'yyyy-MM-dd')`)
			.addGroupBy(/* SQL */ `c.brand_name`)
			.orderBy(/* SQL */ `FORMAT(a.record_time, 'yyyy-MM-dd')`, 'ASC')
			.getRawMany<{ brand_name: string; work_date: string; volumn: number }>()
	}

	public async getLastSixMonthsNetFlow() {
		const inboundCte = this.dataSource
			.getRepository(RFIDInventoryBackupEntity)
			.createQueryBuilder()
			.select(/* SQL */ `YEAR(record_time)`, 'year')
			.addSelect(/* SQL */ `MONTH(record_time)`, 'month')
			.addSelect(/* SQL */ `COUNT(DISTINCT EPC_Code)`, 'inbound_qty')
			.where(/* SQL */ `rfid_status = '${InventoryActions.INBOUND}'`)
			.andWhere(/* SQL */ `stationNO LIKE '%WH101'`)
			.andWhere(/* SQL */ `CAST(record_time AS DATE) >= CAST(DATEADD(MONTH, -6, GETDATE()) AS DATE)`)
			.groupBy(/* SQL */ `YEAR(record_time)`)
			.addGroupBy(/* SQL */ `MONTH(record_time)`)

		const outboundCte = this.dataSource
			.getRepository(RFIDInventoryBackupEntity)
			.createQueryBuilder()
			.select(/* SQL */ `YEAR(record_time)`, 'year')
			.addSelect(/* SQL */ `MONTH(record_time)`, 'month')
			.addSelect(/* SQL */ `COUNT(DISTINCT EPC_Code)`, 'outbound_qty')
			.where(/* SQL */ `rfid_status = '${InventoryActions.OUTBOUND}'`)
			.andWhere(/* SQL */ `stationNO LIKE '%WH103'`)
			.andWhere(/* SQL */ `CAST(record_time AS DATE) >= CAST(DATEADD(MONTH, -6, GETDATE()) AS DATE)`)
			.groupBy(/* SQL */ `YEAR(record_time)`)
			.addGroupBy(/* SQL */ `MONTH(record_time)`)

		return await this.dataSource
			.createQueryBuilder()
			.addCommonTableExpression(inboundCte.getQuery(), 'inbound_cte')
			.addCommonTableExpression(outboundCte.getQuery(), 'outbound_cte')
			.select('a.year', 'year')
			.addSelect('a.month', 'month')
			.addSelect(/* SQL */ `COALESCE(a.inbound_qty, 0) - COALESCE(b.outbound_qty, 0)`, 'net_flow')
			.from((qb) => qb.subQuery().select('*').from('inbound_cte', 'a'), 'a')
			.leftJoin(
				(qb) => qb.subQuery().select('*').from('outbound_cte', 'b'),
				'b',
				/* SQL */ `a.year = b.year AND a.month = b.month`
			)
			.orderBy('a.year', 'ASC')
			.addOrderBy('a.month', 'ASC')
			.getRawMany<{ year: number; month: number; net_flow: number }>()
	}
}
