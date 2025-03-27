import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { IDailyPackingReport } from '../interfaces'

@Injectable()
export class PackingWeightReportService {
	private readonly packingWeightReportQuery: string = readFileSync(
		join(__dirname, '../sql/packing-report.sql'),
		'utf-8'
	)

	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSource: DataSource,
		private readonly i18nService: I18nService
	) {}

	public async getDailyPackingReport(date: string, factoryCode: string) {
		return await this.dataSource.query<IDailyPackingReport>(this.packingWeightReportQuery, [date, factoryCode])
	}

	public async exportDailyPackingToExcel(date: string, factoryCode: string) {
		const currentLanguage = I18nContext.current()?.lang

		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(date), 'yyyy-MM-dd')
		)

		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.brand_name', { lang: currentLanguage }),
				key: 'brand_name'
			},
			{
				header: this.i18nService.t('erp.fields.po', { lang: currentLanguage }),
				key: 'po'
			},
			{
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'shoes_style_code_factory'
			},
			{
				header: 'Size',
				key: 'size_data'
			},
			{
				header: this.i18nService.t('erp.fields.mat_ecolor', { lang: currentLanguage }),
				key: 'mat_ecolor'
			},
			{
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'po_qty'
			},
			{
				header: this.i18nService.t('erp.fields.weighed_qty', { lang: currentLanguage }),
				key: 'weighed_qty'
			},
			{
				header: this.i18nService.t('erp.fields.unweighed_qty', { lang: currentLanguage }),
				key: 'unweighed_qty'
			}
		]
		const data = await this.getDailyPackingReport(format(new Date(date), 'yyyy-MM-dd'), factoryCode)

		for (const record of data) {
			worksheet.addRow(record)
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
		worksheet.mergeCells('A1:G1')
		worksheet.getCell('A1').value = this.i18nService.t('packing.titles.daily_weighing_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(date), 'yyyy-MM-dd')
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
