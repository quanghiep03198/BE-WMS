import { type AutoFitColumnOptions, autoFitColumns } from '@/common/helpers/excel.helper'
import { SuperJson } from '@/common/utils'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { UserEntity } from '@/modules/user/entities/user.entity'
import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { addMonths, format } from 'date-fns'
import { Workbook } from 'exceljs'
import { readFileSync } from 'fs'
import { isEmpty, isNil } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { Brackets, DataSource, IsNull, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { UpdateInventoryReportDTO, UpdateInventoryReportQueryDTO } from '../dto/inventory-report.dto'
import { InventoryReportEntity } from '../entities/inventory-report.entity'
import { IInventoryReportQueryResult, IInventoryReportResponse } from '../interfaces'

@Injectable()
export class InventoryAuditService {
	private readonly inventoryReportQuery: string = readFileSync(join(__dirname, '../sql/inventory-audit.sql'), 'utf-8')

	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSource: DataSource,
		@Inject(REQUEST) private readonly request: Request,
		private readonly i18nService: I18nService
	) {}

	public async getMonthlyInventoryReport(month): Promise<IInventoryReportResponse> {
		const factory = this.request.headers['x-user-company']
		const data = await this.dataSource.query<IInventoryReportQueryResult[]>(this.inventoryReportQuery, [
			month,
			factory
		])
		return data.map((item) => {
			return {
				...item,
				detail: SuperJson.parse<IInventoryReportResponse[number]['detail']>(item.detail)
			}
		})
	}

	async bulkUpdateInventoryReport(
		queries: UpdateInventoryReportQueryDTO,
		payload: Array<UpdateInventoryReportDTO[number] & Pick<UserEntity, 'user_code_updated' | 'user_name_updated'>>
	) {
		const queryRunner = this.dataSource.createQueryRunner()

		const nextYearMonth = addMonths(new Date(queries.inv_year_month), 1)
		await queryRunner.startTransaction()
		try {
			const updateResults = Array.fromAsync(payload, (data) => {
				return this.updateManyInventoryRecord({ ...queries, inv_next_month: nextYearMonth }, data)
			})
			await queryRunner.commitTransaction()
			return updateResults
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw error
		}
	}

	private async getFinalInventoryQuantity(
		queries: UpdateInventoryReportQueryDTO & { size_numcode: string }
	): Promise<number | null> {
		const result: Awaited<Promise<{ final_qty: number }>> = await this.dataSource
			.getRepository(InventoryReportEntity)
			.createQueryBuilder()
			.select(
				/* SQL */ `COALESCE(inv_initialqty, 0) + COALESCE(inv_istotalqty, 0) - COALESCE(inv_ostotalqty, 0)`,
				'final_qty'
			)
			.where({
				size_numcode: queries.size_numcode,
				inv_type: queries.inv_type,
				mo_no: queries.mo_no,
				inv_year_month: format(new Date(queries.inv_year_month), 'yyyyMM')
			})
			.andWhere(
				new Brackets((qb) => {
					if (isEmpty(queries.po)) return qb.andWhere({ po: IsNull() })
					return qb.andWhere({ po: queries.po })
				})
			)
			.getRawOne()

		if (isNil(result)) return null
		return result.final_qty
	}

	private async updateManyInventoryRecord(
		queries: UpdateInventoryReportQueryDTO & { inv_next_month?: Date },
		data: UpdateInventoryReportDTO[number] & Pick<UserEntity, 'user_code_updated' | 'user_name_updated'>
	): Promise<UpdateResult[]> {
		const currFinalQty: Awaited<Promise<number | null>> = await this.getFinalInventoryQuantity({
			...queries,
			size_numcode: data.size_numcode
		})
		if (isNil(currFinalQty)) {
			return Array.from(new Array(2), () => ({
				generatedMaps: [],
				affected: 0,
				raw: undefined
			})) satisfies UpdateResult[]
		}
		const updateQuantity = currFinalQty + data.mn_ist_qty - data.mn_ost_qty
		return await Promise.all([
			this.updateOneInventoryRecord(
				{ ...queries, size_numcode: data.size_numcode, inv_year_month: format(queries.inv_year_month, 'yyyyMM') },
				{
					user_code_updated: data.user_code_updated,
					user_name_updated: data.user_name_updated,
					actual_instock_qty: data.mn_ist_qty,
					actual_outstock_qty: data.mn_ost_qty,
					final_stock_qty: updateQuantity
				}
			),
			this.updateOneInventoryRecord(
				{ ...queries, size_numcode: data.size_numcode, inv_year_month: format(queries.inv_next_month, 'yyyyMM') },
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
		update: QueryDeepPartialEntity<InventoryReportEntity>
	) {
		return await this.dataSource
			.getRepository(InventoryReportEntity)
			.createQueryBuilder()
			.update()
			.set(update)
			.where({
				inv_type: queries.inv_type,
				size_numcode: queries.size_numcode,
				mo_no: queries.mo_no,
				inv_year_month: queries.inv_year_month
			})
			.andWhere(
				new Brackets((qb) => {
					if (isEmpty(queries.po)) return qb.andWhere({ po: IsNull() })
					return qb.andWhere({ po: queries.po })
				})
			)
			.execute()
	}

	// #region Inventory report Excel
	async exportMonthlyInventoryToExcel(month: string, commandNumbers: string[]) {
		const currentLanguage = I18nContext.current()?.lang
		const factoryCode = this.request.headers['x-user-company']
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(month), 'yyyy-MM')
		)

		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
			},
			{
				header: 'PO',
				key: 'po'
			},
			{
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'factory_shoes_style'
			},
			{
				header: this.i18nService.t('erp.fields.color_sn', { lang: currentLanguage }),
				key: 'color_sn'
			},
			{
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'order_qty'
			},
			{
				header: this.i18nService.t('erp.fields.total_init_qty', { lang: currentLanguage }),
				key: 'init_inv_qty'
			},
			{
				header: this.i18nService.t('erp.fields.inbound_qty', { lang: currentLanguage }),
				key: 'total_instock_qty'
			},
			{
				header: this.i18nService.t('erp.fields.outbound_qty', { lang: currentLanguage }),
				key: 'total_outstock_qty'
			},
			{
				header: this.i18nService.t('erp.fields.actual_inventory_qty', { lang: currentLanguage }),
				key: 'actual_inv_qty'
			},
			{
				header: this.i18nService.t('erp.fields.final_inventory_qty', { lang: currentLanguage }),
				key: 'final_inv_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))

		const data = await this.getMonthlyInventoryReport(format(new Date(month), 'yyyyMM'))

		// * Add data to worksheet
		const filteredData = data.filter(
			(item) =>
				(item.init_inv_qty > 0 ||
					item.total_instock_qty > 0 ||
					item.total_outstock_qty > 0 ||
					item.actual_inv_qty > 0 ||
					item.final_inv_qty > 0) &&
				(Array.isArray(commandNumbers) && commandNumbers.length > 0 ? commandNumbers.includes(item.mo_no) : true)
		)
		for (const record of filteredData) {
			const row = worksheet.addRow(record)
			row.height = 30
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'deecf7' } }
			}
			for (const subRecord of record.detail) {
				const subRow = worksheet.addRow([])
				subRow.getCell(3).value = subRecord.size + '#'
				subRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
				subRow.getCell(3).font = { bold: true }
				subRow.getCell(4).value = subRecord.initial_stock_qty
				subRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(5).value = subRecord.instock_qty
				subRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(6).value = subRecord.outstock_qty
				subRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(7).value = subRecord.final_stock_qty
				subRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			}
		}

		// * Auto-fit columns
		autoFitColumns.call(worksheet, { minWidth: 10, excludeColumns: ['po'] } satisfies AutoFitColumnOptions)

		// * Add header title
		worksheet.insertRow(1, null)
		worksheet.mergeCells('A1:J1')
		worksheet.getRow(1).font = { size: 14, bold: true }
		worksheet.getRow(1).height = 30
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.getRow(2).alignment = { vertical: 'middle', horizontal: 'center' }

		worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'e5e5e5' } }
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.file_monthly_inventory_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				month: format(new Date(month), 'yyyy-MM')
			},
			lang: currentLanguage
		})

		// * Freeze header row
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.alignment = { ...row.alignment, vertical: 'middle' }
			row.eachCell({ includeEmpty: true }, (cell) => {
				cell.font = { ...cell.font, name: 'Calibri', family: 1 }
				cell.border = {
					top: { style: 'thin', color: { argb: 'a1a1a1' } },
					left: { style: 'thin', color: { argb: 'a1a1a1' } },
					bottom: { style: 'thin', color: { argb: 'a1a1a1' } },
					right: { style: 'thin', color: { argb: 'a1a1a1' } }
				}
			})
		})

		return await workbook.xlsx.writeBuffer()
	}
}
