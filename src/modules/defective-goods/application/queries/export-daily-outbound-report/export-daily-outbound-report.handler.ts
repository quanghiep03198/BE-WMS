import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { applyCommonStyles, AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { formatReportDate } from '../../helpers/format-report-date'
import {
	DEFECTIVE_GOODS_REPORT_REPOSITORY,
	IDefectiveGoodsReportRepository
} from '../../ports/defective-goods-report.repository.port'
import { ExportDailyOutboundReportQuery } from './export-daily-outbound-report.query'

@QueryHandler(ExportDailyOutboundReportQuery)
export class ExportDailyOutboundReportHandler implements IQueryHandler<ExportDailyOutboundReportQuery> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPORT_REPOSITORY) private readonly repository: IDefectiveGoodsReportRepository,
		private readonly i18nService: I18nService,
		private readonly configService: ConfigService<ProcessEnv>
	) {}
	async execute({ date }: ExportDailyOutboundReportQuery) {
		const factoryCode = this.configService.get<FactoryCode>('APP_TENANCY')

		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) + ' - ' + formatReportDate(date)
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
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
			},
			{
				header: this.i18nService.t('erp.fields.cust_shoes_style', { lang: currentLanguage }),
				key: 'cust_shoes_style'
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
				header: this.i18nService.t('erp.fields.sewing_line', { lang: currentLanguage }),
				key: 'sewing_line'
			},
			{
				header: this.i18nService.t('erp.fields.assembly_line', { lang: currentLanguage }),
				key: 'assembly_line'
			},
			{
				header: this.i18nService.t('erp.fields.category', { lang: currentLanguage }),
				key: 'defective_category'
			},
			{
				header: this.i18nService.t('erp.fields.outbound_purpose', { lang: currentLanguage }),
				key: 'outbound_purpose'
			},
			{
				header: this.i18nService.t('erp.fields.daily_outbound_qty', { lang: currentLanguage }),
				key: 'daily_outbound_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))
		const data = await this.repository.getDailyOutboundReport(date)

		for (const record of data) {
			const row = worksheet.addRow({
				...record,
				sewing_line: currentLanguage ? record.sewing_line?.name[currentLanguage] : undefined,
				assembly_line: currentLanguage ? record.assembly_line?.name[currentLanguage] : undefined,
				daily_outbound_qty: record.total_qty,
				defective_category: this.i18nService.t(`defective-goods.categories.${record.defective_category}`, {
					lang: currentLanguage
				}),
				outbound_purpose: this.i18nService.t(`inoutbound.outbound_purpose.${record.outbound_purpose}`, {
					lang: currentLanguage
				})
			})
			row.height = 20
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
				}
			}
			for (const subRecord of record.size_ledger) {
				const row = worksheet.addRow([])
				row.alignment = { vertical: 'middle', horizontal: 'center' }
				row.getCell(2).value = subRecord.size_numcode + '#'
				row.getCell(2).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
				}
				row.getCell(3).value = subRecord.qty
				row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			}
		}

		// * Auto fit columns
		autoFitColumns.call(worksheet, {
			minWidth: 20,
			excludeColumns: ['assembly_dept_name', 'storage']
		} satisfies AutoFitColumnOptions)

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).font = { bold: true, size: 14 }
		worksheet.getRow(1).height = 30
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.mergeCells('A1:K1')
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').font = { bold: true, size: 16 }
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_defective_gooods_outbound_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: formatReportDate(date)
			},
			lang: currentLanguage
		})

		const footerRow = worksheet.addRow(Array.from({ length: worksheet.columns.length }, () => null))
		footerRow.height = 30
		worksheet.mergeCells(`A${footerRow.number}:J${footerRow.number}`)
		worksheet.getCell(`A${footerRow.number}`).value = this.i18nService.t('erp.fields.total_daily_productivity', {
			lang: currentLanguage
		})
		worksheet.getCell(`K${footerRow.number}`).value = data.reduce((acc, curr) => acc + curr.total_qty, 0)
		worksheet.getCell(`K${footerRow.number}`).style = {
			font: { color: { argb: ExcelColorPalette.DESTRUCTIVE_FOREGROUND } }
		}
		footerRow.eachCell((cell) => {
			cell.font = { bold: true, size: 14 }
			cell.style.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
			}
		})

		// * Freeze header row at top
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		applyCommonStyles.call(worksheet)

		return await workbook.xlsx.writeBuffer()
	}
}
