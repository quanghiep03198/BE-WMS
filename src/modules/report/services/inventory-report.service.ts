import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { Brackets, DataSource } from 'typeorm'
import { UpdateInventoryReportDTO, UpdateInventoryReportQuery } from '../dto/inventory-report.dto'
import { InventoryReportEntity } from '../entities/inventory-report.entity'
import { IInventoryReportQueryResult, IInventoryReportResponse } from '../interfaces'

@Injectable()
export class InventoryReportService {
	private readonly inventoryReportQuery: string = readFileSync(join(__dirname, '../sql/inventory-report.sql'), 'utf-8')

	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSource: DataSource,
		@Inject(REQUEST) private readonly request: Request,
		private readonly i18nService: I18nService
	) {}

	public async getMonthlyInventoryReport(month): Promise<IInventoryReportResponse> {
		const data = await this.dataSource.query<IInventoryReportQueryResult[]>(this.inventoryReportQuery, [month])
		return data.map((item) => {
			return {
				...item,
				size_data: JSON.parse(item.size_data)
			}
		})
	}

	async updateInventoryReport(queries: UpdateInventoryReportQuery, payload: UpdateInventoryReportDTO) {
		const queryRunner = this.dataSource.createQueryRunner()

		await queryRunner.startTransaction()

		try {
			const result = await Promise.all(
				payload.map(
					(data) =>
						new Promise((resolve, reject) =>
							resolve(
								this.dataSource
									.getRepository(InventoryReportEntity)
									.createQueryBuilder()
									.update()
									.set({
										mn_ist_qty: data.mn_ist_qty,
										mn_ost_qty: data.mn_ost_qty,
										fnl_qty: () => {
											return /* SQL */ `init_inv_qty + ist_total_qty + ${data.mn_ist_qty} - ost_total_qty - ${data.mn_ost_qty}`
										}
									})
									.where('size_numcode = :size_numcode', { size_numcode: data.size_numcode })
									.andWhere('mo_no = :mo_no', { mo_no: queries.mo_no })
									.andWhere(
										new Brackets((qb) => {
											if (queries.po) return qb.andWhere('po = :po', { po: queries.po })
											else return qb.andWhere(/* SQL */ `po IS NULL`)
										})
									)
									.andWhere('inv_type = :inv_type', { inv_type: queries.inv_type })
									.andWhere('shoes_style_code_factory = :shoes_style_code_factory', {
										shoes_style_code_factory: queries.shoes_style_code_factory
									})
									.andWhere('cust_shoestyle = :cust_shoestyle', { cust_shoestyle: queries.cust_shoestyle })
									.andWhere('inv_year_month = :inv_year_month', { inv_year_month: queries.inv_year_month })
									.execute()
									.catch(reject)
							)
						)
				)
			)
			await queryRunner.commitTransaction()
			return result
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw error
		}
	}

	// #region Inventory report Excel
	async exportMonthlyInventoryToExcel(month: string) {
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
				key: 'shoes_style_code_factory'
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
				header: this.i18nService.t('erp.fields.final_inventory_qty', { lang: currentLanguage }),
				key: 'final_inv_qty'
			},
			{
				header: this.i18nService.t('erp.fields.actual_inventory_qty', { lang: currentLanguage }),
				key: 'actual_inv_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))

		const data = await this.getMonthlyInventoryReport(format(new Date(month), 'yyyyMM'))

		for (const record of data) {
			const row = worksheet.addRow(record)
			row.height = 20
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'deecf7' } }
			}
			for (const subRecord of record.size_data) {
				const row = worksheet.addRow([])
				row.alignment = { vertical: 'middle', horizontal: 'center' }
				worksheet.mergeCells(`B${row.number}:C${row.number}`)
				row.getCell(2).value = subRecord.size + '#'
				row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
				row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
				row.getCell(4).value = subRecord.int_qty
				row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				row.getCell(5).value = subRecord.ist_qty
				row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				row.getCell(6).value = subRecord.ost_qty
				row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				row.getCell(7).value = subRecord.fnl_qty
				row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			}
		}
		worksheet.columns.forEach((sheetColumn) => {
			sheetColumn.font = { size: 12 }
			sheetColumn.width = 30
		})
		worksheet.getRow(1).font = { bold: true, size: 13 }
		worksheet.getRow(1).height = 20

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).height = 28
		worksheet.mergeCells('A1:I1')
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.file_monthly_inventory_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				month: format(new Date(month), 'yyyy-MM')
			},
			lang: currentLanguage
		})
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'e5e5e5' } }
		worksheet.getCell('A1').font = { bold: true, size: 16 }
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			row.eachCell({ includeEmpty: true }, (cell) => {
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
