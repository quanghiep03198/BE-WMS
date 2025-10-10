import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
				key: 'factory_shoes_style'
			},
			{
				header: 'Size',
				key: 'size_data'
			},
			{
				header: this.i18nService.t('erp.fields.color_sn', { lang: currentLanguage }),
				key: 'color_sn'
			},
			{
				header: this.i18nService.t('erp.fields.target_box_qty', { lang: currentLanguage }),
				key: 'target_box_qty'
			},
			{
				header: this.i18nService.t('erp.fields.target_item_qty', { lang: currentLanguage }),
				key: 'target_item_qty'
			},
			{
				header: this.i18nService.t('erp.fields.weighed_box_qty', { lang: currentLanguage }),
				key: 'weighed_box_qty'
			},
			{
				header: this.i18nService.t('erp.fields.unweighed_box_qty', { lang: currentLanguage }),
				key: 'unweighed_box_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))

		const data = await this.getDailyPackingReport(format(new Date(date), 'yyyy-MM-dd'), factoryCode)

		for (const record of data) {
			worksheet.addRow(record)
		}

		// * Auto fit columns
		autoFitColumns.call(worksheet, { minWidth: 16, excludeColumns: ['size_data'] } satisfies AutoFitColumnOptions)

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).height = 30
		worksheet.getRow(1).font = { bold: true, size: 14 }
		worksheet.getRow(2).height = 30
		worksheet.getRow(2).font = { bold: true }

		worksheet.mergeCells('A1:I1')
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').value = this.i18nService.t('packing.titles.daily_weighing_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(date), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})

		// * Freeze header row
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			row.eachCell({ includeEmpty: true }, (cell) => {
				cell.font = { ...cell.font, name: 'Calibri', family: 1 }
				cell.border = {
					top: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
					left: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
					bottom: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
					right: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } }
				}
			})
		})
		return await workbook.xlsx.writeBuffer()
	}
}
