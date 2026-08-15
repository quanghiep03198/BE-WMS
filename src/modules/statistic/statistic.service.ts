import { Injectable } from '@nestjs/common'
import { DataSource, IsNull, Not } from 'typeorm'
import { DefectiveCategory } from '../defective-goods/constants'
import { DefectiveGoodsEntity } from '../defective-goods/entities/defective-goods.entity'
// import { RFIDInventoryBackupEntity } from '../rfid/infrastructure/entities/rifd-inventory.entity'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	DailyMoInventoryVariation,
	DailyMoInventoryVariationModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/daily-mo-inventory-variation.schema'
import {
	MoInventoryAudit,
	MoInventoryAuditModel
} from '@modules/inventory/infrastructure/persistence/mongodb/schemas/inventory-audit.schema'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { format, getDaysInMonth, subMonths } from 'date-fns'
import { IMonthlyInventoryComparison } from './statistic.interface'

@Injectable()
export class StatisticService {
	constructor(
		@InjectModel(MoInventoryAudit.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryAuditModel: MoInventoryAuditModel,
		@InjectModel(DailyMoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryVariation: DailyMoInventoryVariationModel,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource
	) {}

	public async getInventoryComparison() {
		const calcPercentageChange = (current: number, previous: number): number => {
			current ??= 0
			previous ??= 0
			return previous ? Number((((current - previous) / previous) * 100).toFixed(2)) : current ? 100 : 0
		}

		const now = new Date()
		const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
		const previousMonthDate = subMonths(now, 1)
		const previousMonthStart = new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth(), 1)
		const previousPeriodEnd = new Date(
			previousMonthDate.getFullYear(),
			previousMonthDate.getMonth(),
			Math.min(now.getDate(), getDaysInMonth(previousMonthDate))
		)

		const currentYearMonth = format(now, 'yyyy-MM')
		const previousYearMonth = format(previousMonthDate, 'yyyy-MM')

		const aggregated = await this.moInventoryAuditModel.aggregate<{
			_id: string
			month_initial_qty: number
			month_inbound_qty: number
			month_outbound_qty: number
			month_final_qty: number
		}>([
			{
				$match: {
					year_month: { $in: [currentYearMonth, previousYearMonth] }
				}
			},
			{
				$project: {
					year_month: 1,
					inventory_variation_array: { $objectToArray: '$inventory_variation' }
				}
			},
			{ $unwind: '$inventory_variation_array' },
			{
				$project: {
					year_month: 1,
					variation: '$inventory_variation_array.v'
				}
			},
			{
				$group: {
					_id: '$year_month',
					month_initial_qty: { $sum: { $ifNull: ['$variation.beginning_inventory_qty', 0] } },
					month_inbound_qty: {
						$sum: {
							$add: [
								{ $ifNull: ['$variation.stocked_in_qty', 0] },
								{ $ifNull: ['$variation.supplemental_stocked_in_qty', 0] }
							]
						}
					},
					month_outbound_qty: {
						$sum: {
							$add: [
								{ $ifNull: ['$variation.shipped_out_qty', 0] },
								{ $ifNull: ['$variation.supplemental_shipped_out_qty', 0] }
							]
						}
					},
					month_final_qty: {
						$sum: {
							$add: [
								{ $ifNull: ['$variation.beginning_inventory_qty', 0] },
								{ $ifNull: ['$variation.stocked_in_qty', 0] },
								{ $ifNull: ['$variation.supplemental_stocked_in_qty', 0] },
								{ $multiply: [{ $ifNull: ['$variation.shipped_out_qty', 0] }, -1] },
								{ $multiply: [{ $ifNull: ['$variation.supplemental_shipped_out_qty', 0] }, -1] }
							]
						}
					}
				}
			}
		])

		const monthData = new Map(aggregated.map((item) => [item._id, item]))

		const currMonthAggregate = monthData.get(currentYearMonth)
		const prevMonthAggregate = monthData.get(previousYearMonth)

		const data: IMonthlyInventoryComparison = {
			comparison_date: format(now, 'yyyy-MM-dd'),
			current_period: `${format(currentMonthStart, 'dd/MM/yyyy')} - ${format(now, 'dd/MM/yyyy')}`,
			previous_period: `${format(previousMonthStart, 'dd/MM/yyyy')} - ${format(previousPeriodEnd, 'dd/MM/yyyy')}`,
			curr_period_inventory_qty:
				(currMonthAggregate?.month_initial_qty ?? 0) +
				(currMonthAggregate?.month_inbound_qty ?? 0) -
				(currMonthAggregate?.month_outbound_qty ?? 0),
			prev_period_inventory_qty:
				(prevMonthAggregate?.month_initial_qty ?? 0) +
				(prevMonthAggregate?.month_inbound_qty ?? 0) -
				(prevMonthAggregate?.month_outbound_qty ?? 0),
			curr_month_initial_qty: currMonthAggregate?.month_initial_qty ?? 0,
			curr_month_final_qty: currMonthAggregate?.month_final_qty ?? 0,
			curr_month_inbound: currMonthAggregate?.month_inbound_qty ?? 0,
			curr_month_outbound: currMonthAggregate?.month_outbound_qty ?? 0,
			prev_month_initial_qty: prevMonthAggregate?.month_initial_qty ?? 0,
			prev_month_final_qty: prevMonthAggregate?.month_final_qty ?? 0,
			prev_month_inbound: prevMonthAggregate?.month_inbound_qty ?? 0,
			prev_month_outbound: prevMonthAggregate?.month_outbound_qty ?? 0
		}

		const currMonthAverageInventory = (data.curr_month_initial_qty + data.curr_month_final_qty) / 2
		const prevMonthAverageInventory = (data.prev_month_initial_qty + data.prev_month_final_qty) / 2

		const currMonthInventoryTurnover = currMonthAverageInventory
			? Number.parseFloat((data.curr_month_outbound / currMonthAverageInventory).toFixed(2))
			: 0
		const prevMonthInventoryTurnover = prevMonthAverageInventory
			? Number.parseFloat((data.prev_month_outbound / prevMonthAverageInventory).toFixed(2))
			: 0

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
	}

	public async getAnnuallyInoutboundOverview(year: number) {
		const monthlyAggregated = await this.moInventoryAuditModel.aggregate<{
			month: number
			inbound_qty: number
			outbound_qty: number
		}>([
			{
				$project: {
					normalized_year_month: {
						$replaceAll: {
							input: '$year_month',
							find: '-',
							replacement: ''
						}
					},
					inventory_variation_array: { $objectToArray: '$inventory_variation' }
				}
			},
			{
				$project: {
					year: { $toInt: { $substr: ['$normalized_year_month', 0, 4] } },
					month: { $toInt: { $substr: ['$normalized_year_month', 4, 2] } },
					inventory_variation_array: 1
				}
			},
			{
				$match: {
					year
				}
			},
			{ $unwind: '$inventory_variation_array' },
			{
				$project: {
					month: 1,
					variation: '$inventory_variation_array.v'
				}
			},
			{
				$group: {
					_id: '$month',
					inbound_qty: {
						$sum: {
							$ifNull: ['$variation.stocked_in_qty', 0]
							// $add: [
							// 	{ $ifNull: ['$variation.stocked_in_qty', 0] },
							// 	{ $ifNull: ['$variation.supplemental_stocked_in_qty', 0] }
							// ]
						}
					},
					outbound_qty: {
						$sum: {
							$ifNull: ['$variation.shipped_out_qty', 0]
							// $add: [
							// 	{ $ifNull: ['$variation.shipped_out_qty', 0] },
							// 	{ $ifNull: ['$variation.supplemental_shipped_out_qty', 0] }
							// ]
						}
					}
				}
			},
			{
				$project: {
					_id: 0,
					month: '$_id',
					inbound_qty: 1,
					outbound_qty: 1
				}
			},
			{ $sort: { month: 1 } }
		])

		const monthMap = new Map(monthlyAggregated.map((item) => [item.month, item]))

		return Array.from({ length: 12 }, (_, index) => {
			const month = index + 1
			const monthData = monthMap.get(month)
			const inbound_qty = monthData?.inbound_qty ?? 0
			const outbound_qty = monthData?.outbound_qty ?? 0
			const monthDate = new Date(year, month - 1, 1)
			const lastDayOfMonth = getDaysInMonth(monthDate)

			return {
				year,
				month,
				inbound_qty,
				outbound_qty,
				net_flow: inbound_qty - outbound_qty,
				total_transactions: inbound_qty + outbound_qty,
				inbound_outbound_ratio:
					outbound_qty === 0
						? inbound_qty > 0
							? 100
							: 0
						: Number.parseFloat(((inbound_qty * 100) / outbound_qty).toFixed(2)),
				period_range: `01/${String(month).padStart(2, '0')}/${year} - ${String(lastDayOfMonth).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
			}
		})
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
		const data = await this.dailyMoInventoryVariation
			.find(
				{
					date: { $gte: format(subMonths(new Date(), 3), 'yyyy-MM-dd') }
				},
				{ mo_no: 1, date: 1, inventory_variation: 1 }
			)
			.populate('mo_attrs', 'brand_name')
			.select(['date', 'mo_attrs', 'inventory_variation'])
			.lean({ virtuals: true })
			.exec()

		return data.map((item) => ({
			work_date: item.date,
			brand_name: item.mo_attrs?.brand_name,
			volumn: Object.values(item.inventory_variation).reduce(
				(sum, variation) => sum + (variation.stocked_in_qty ?? 0),
				0
			)
		}))

		// return await this.dataSource
		// 	.getRepository(RFIDInventoryBackupEntity)
		// 	.createQueryBuilder('a')
		// 	.select(/* SQL */ `SUM(a.quantity)`, 'volumn')
		// 	.addSelect(/* SQL */ `FORMAT(a.record_time, 'yyyy-MM-dd')`, 'work_date')
		// 	.addSelect(/* SQL */ `c.brand_name`, 'brand_name')
		// 	.innerJoin(
		// 		(qb) =>
		// 			qb.subQuery().select('b.mo_no').addSelect('b.custbrand_id').from('wuerp_vnrd.dbo.ta_manufacturmst', 'b'),
		// 		'b',
		// 		/* SQL */ `a.mo_no = b.mo_no`
		// 	)
		// 	.innerJoin(
		// 		(qb) =>
		// 			qb
		// 				.subQuery()
		// 				.select('c.custbrand_id')
		// 				.addSelect('c.brand_name')
		// 				.from('wuerp_vnrd.dbo.ta_brand', 'c')
		// 				.where(/* SQL */ `c.brand_code IN ('UG', 'TV', 'KB')`),
		// 		'c',
		// 		/* SQL */ `b.custbrand_id = c.custbrand_id`
		// 	)
		// 	.where(/* SQL */ `CAST(a.record_time AS DATE) >= CAST(DATEADD(MONTH, -3, GETDATE()) AS DATE)`)
		// 	.andWhere(/* SQL */ `a.station_suffix = '101'`)
		// 	.groupBy(/* SQL */ `FORMAT(a.record_time, 'yyyy-MM-dd')`)
		// 	.addGroupBy(/* SQL */ `c.brand_name`)
		// 	.orderBy(/* SQL */ `FORMAT(a.record_time, 'yyyy-MM-dd')`, 'ASC')
		// 	.getRawMany<{ brand_name: string; work_date: string; volumn: number }>()
	}

	public async getLastSixMonthsNetFlow() {
		const now = new Date()
		const lastSixMonths = Array.from({ length: 6 }, (_, index) => {
			const date = subMonths(now, 5 - index)
			return {
				yearMonth: format(date, 'yyyy-MM'),
				year: date.getFullYear(),
				month: date.getMonth() + 1
			}
		})

		const monthKeys = lastSixMonths.map((item) => item.yearMonth)

		const monthlyAggregated = await this.moInventoryAuditModel.aggregate<{
			_id: string
			inbound_qty: number
			outbound_qty: number
		}>([
			{
				$match: {
					year_month: { $in: monthKeys }
				}
			},
			{
				$project: {
					year_month: 1,
					inventory_variation_array: { $objectToArray: '$inventory_variation' }
				}
			},
			{ $unwind: '$inventory_variation_array' },
			{
				$project: {
					year_month: 1,
					variation: '$inventory_variation_array.v'
				}
			},
			{
				$group: {
					_id: '$year_month',
					inbound_qty: { $sum: { $ifNull: ['$variation.stocked_in_qty', 0] } },
					outbound_qty: { $sum: { $ifNull: ['$variation.shipped_out_qty', 0] } }
				}
			}
		])

		const monthMap = new Map(monthlyAggregated.map((item) => [item._id, item]))

		return lastSixMonths.map(({ yearMonth, year, month }) => {
			const monthData = monthMap.get(yearMonth)
			const inbound_qty = monthData?.inbound_qty ?? 0
			const outbound_qty = monthData?.outbound_qty ?? 0

			return {
				year,
				month,
				net_flow: inbound_qty - outbound_qty
			}
		})
	}
}
