import { Inject, Injectable } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { RFIDInventoryBackupEntity } from '../rfid/entities/rifd-inventory.entity'
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
		return await this.dataSource
			.query<Array<IMonthlyInventoryComparison>>(this.inventoryComparisonQuery)
			.then((result) => {
				const data = result.at(0)
				return {
					...data,
					inventory_difference: data.curr_period_inventory_qty - data.prev_period_inventory_qty,
					inventory_percentage_change: data.prev_period_inventory_qty
						? Number(
								(
									((data.curr_period_inventory_qty - data.prev_period_inventory_qty) /
										data.prev_period_inventory_qty) *
									100
								).toFixed(2)
							)
						: data.curr_period_inventory_qty
							? 100
							: 0,
					inbound_difference: data.curr_month_inbound - data.prev_month_inbound,
					inbound_percentage_change: data.prev_month_inbound
						? Number(
								(((data.curr_month_inbound - data.prev_month_inbound) / data.prev_month_inbound) * 100).toFixed(
									2
								)
							)
						: data.curr_month_inbound
							? 100
							: 0,
					outbound_difference: data.curr_month_outbound - data.prev_month_outbound,
					outbound_percentage_change: data.prev_month_outbound
						? Number(
								(
									((data.curr_month_outbound - data.prev_month_outbound) / data.prev_month_outbound) *
									100
								).toFixed(2)
							)
						: data.curr_month_outbound
							? 100
							: 0
				}
			})
	}

	public async getAnnuallyInoutboundOverview(year: number) {
		return await this.dataSource.query<Array<IAnnuallyInOutboundStatistics>>(this.annuallyInboundAnalysisQuery, [
			year
		])
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
}
