import { TRequestUser } from '@common/decorators'
import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { IInventoryReconciliationAuditRepository } from '@modules/inventory/application/ports/inventory-reconciliation-audit.repository.port'
import { InventoryType } from '@modules/inventory/domain/constants'
import { UpdateInventoryReportQueryDTO } from '@modules/inventory/presentation/dto/inventory-report.dto'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { addMonths, format } from 'date-fns'
import isNil from 'lodash/isNil'
import { Brackets, DataSource, Equal, In, IsNull, Not, QueryDeepPartialEntity, UpdateResult } from 'typeorm'
import { InventoryAuditEntity } from '../entities/inventory-report.entity'

@Injectable()
export class InventoryReconciliationAuditRepository implements IInventoryReconciliationAuditRepository {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource) {}

	public async updateInventorySupplementalQty(
		yearMonth: string,
		manufacturingOrder: string,
		update: Array<{
			size_numcode: string
			supplemental_stocked_in_qty: number
			supplemental_shipped_out_qty: number
		}>,
		updatedBy: Pick<TRequestUser, 'username' | 'display_name'>
	) {
		const queryRunner = this.dataSource.createQueryRunner()

		const nextYearMonth = addMonths(new Date(yearMonth), 1)
		await queryRunner.startTransaction()
		try {
			const updateResults = Array.fromAsync(update, (data) => {
				return this.updateManyInventoryRecord(
					{ year_month: yearMonth, next_month: nextYearMonth, mo_no: manufacturingOrder },
					data,
					updatedBy
				)
			})
			await queryRunner.commitTransaction()
			return updateResults
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw error
		}
	}

	private async getFinalInventoryQuantity(queries: {
		year_month: string
		mo_no: string
		size_numcode: string
	}): Promise<number | null> {
		const result: Awaited<Promise<{ final_qty: number }>> = await this.dataSource
			.getRepository(InventoryAuditEntity)
			.createQueryBuilder()
			.select(
				/* SQL */ `COALESCE(inv_initialqty, 0) + COALESCE(inv_istotalqty, 0) - COALESCE(inv_ostotalqty, 0)`,
				'final_qty'
			)
			.where({
				size_numcode: queries.size_numcode,
				inv_type: InventoryType.FINISHED_GOOD,
				mo_no: queries.mo_no,
				inv_year_month: format(new Date(queries.year_month), 'yyyyMM')
			})
			.andWhere(
				new Brackets((qb) => {
					return qb.orWhere({ outstock_qty: Not(Equal(0)) }).orWhere({ po: IsNull() })
				})
			)
			.getRawOne()

		if (isNil(result)) return null
		return result.final_qty
	}

	private async updateManyInventoryRecord(
		queries: { year_month: string; mo_no: string; next_month?: Date },
		data: {
			size_numcode: string
			supplemental_stocked_in_qty: number
			supplemental_shipped_out_qty: number
		},
		updatedBy: Pick<TRequestUser, 'username' | 'display_name'>
	): Promise<UpdateResult[]> {
		const currFinalQty: Awaited<Promise<number | null>> = await this.getFinalInventoryQuantity({
			year_month: queries.year_month,
			mo_no: queries.mo_no,
			size_numcode: data.size_numcode
		})
		if (isNil(currFinalQty)) {
			return Array.from({ length: 2 }, () => ({
				generatedMaps: [],
				affected: 0,
				raw: undefined
			})) satisfies UpdateResult[]
		}
		const updateQuantity = currFinalQty + data.supplemental_stocked_in_qty - data.supplemental_shipped_out_qty
		return await Promise.all([
			this.updateOneInventoryRecord(
				{ ...queries, size_numcode: data.size_numcode, year_month: format(queries.year_month, 'yyyyMM') },
				{
					user_code_updated: updatedBy.username,
					user_name_updated: updatedBy.display_name,
					supplemental_stocked_in_qty: data.supplemental_stocked_in_qty,
					supplemental_shipped_out_qty: data.supplemental_shipped_out_qty,
					final_stock_qty: updateQuantity
				}
			),
			this.updateOneInventoryRecord(
				{ ...queries, size_numcode: data.size_numcode, year_month: format(queries.next_month, 'yyyyMM') },
				{
					initial_stock_qty: updateQuantity,
					final_stock_qty: () => {
						return /* SQL */ `${updateQuantity} + inv_istotalqty + inv_manualqty - inv_ostotalqty - inv_manualqtyout`
					}
				}
			)
		])
	}

	private async updateOneInventoryRecord(
		queries: UpdateInventoryReportQueryDTO & { size_numcode: string },
		update: QueryDeepPartialEntity<InventoryAuditEntity>,
		options: { exactMatch?: boolean } = { exactMatch: true }
	) {
		const POSSIBLE_SIZE_PREFIXES = ['', '0', 'K', 'T']
		const sizeVariants = POSSIBLE_SIZE_PREFIXES.map((prefix) => `${prefix}${queries.size_numcode.replace(/^0/, '')}`)

		return await this.dataSource
			.getRepository(InventoryAuditEntity)
			.createQueryBuilder()
			.update()
			.set(update)
			.where({
				mo_no: queries.mo_no,
				inv_type: InventoryType.FINISHED_GOOD,
				year_month: queries.year_month,
				size_numcode: options.exactMatch ? queries.size_numcode : In(sizeVariants)
			})
			.andWhere(
				new Brackets((qb) => {
					return qb.orWhere({ outstock_qty: Not(Equal(0)) }).orWhere({ po: IsNull() })
				})
			)
			.execute()
	}
}
