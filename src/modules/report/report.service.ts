import { DATA_SOURCE_ERP } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import * as ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { IReportSearchParams } from './interfaces'

@Injectable()
export class ReportService {
	constructor(
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		private readonly i18nService: I18nService
	) {}

	async findByDate(filter: IReportSearchParams) {
		const query = readFileSync(join(__dirname, './sql/report.sql'), 'utf-8').toString()

		return await this.dataSourceERP.query(query, [filter['factory_code.eq'], filter['date.eq']])
	}

	async exportReportToExcel(filter: IReportSearchParams) {
		const data = await this.findByDate(filter)
		const workbook = new ExcelJS.Workbook()
		const worksheet = workbook.addWorksheet(`Report ${format(new Date(), 'yyyy-MM-dd')}`)

		const currentLanguage = I18nContext.current()?.lang

		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
			},
			{
				header: this.i18nService.t('erp.fields.mat_code', { lang: currentLanguage }),
				key: 'mat_code'
			},
			{
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'shoes_style_code_factory'
			},
			{
				header: this.i18nService.t('erp.fields.shaping_dept_name', { lang: currentLanguage }),
				key: 'shaping_dept_name'
			},
			{
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'order_qty'
			},
			{
				header: this.i18nService.t('erp.fields.inbound_qty', { lang: currentLanguage }),
				key: 'inbound_qty'
			},
			{
				header: this.i18nService.t('erp.fields.inbound_date', { lang: currentLanguage }),
				key: 'inbound_date'
			}
		]
		data.forEach((record) => {
			worksheet.addRow(record)
		})
		worksheet.columns.forEach((sheetColumn) => {
			sheetColumn.font = {
				size: 12
			}
			sheetColumn.width = 30
		})
		worksheet.getRow(1).font = {
			bold: true,
			size: 13
		}
		worksheet.getRow(1).height = 20

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).height = 28
		worksheet.mergeCells('A1:F1')
		worksheet.getCell('A1').value = `Inbound Report - ${format(new Date(), 'yyyy/MM/dd')}`
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'e5e5e5' }
		}
		worksheet.getCell('A1').font = {
			bold: true,
			size: 16
		}
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.eachCell({ includeEmpty: false }, (cell) => {
				cell.border = {
					top: { style: 'thin' },
					left: { style: 'thin' },
					bottom: { style: 'thin' },
					right: { style: 'thin' }
				}
			})
		})
		return await workbook.xlsx.writeBuffer()
	}
}
