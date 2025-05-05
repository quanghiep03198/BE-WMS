import { SuperJson } from '@/common/utils'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { IOutboundReportQueryResult, IOutboundReportResponse } from '../interfaces'

@Injectable()
export class OutboundReportService {
	private readonly outboundReportQuery: string = readFileSync(join(__dirname, '../sql/outbound-report.sql'), 'utf-8')

	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSource: DataSource,

		private readonly i18nService: I18nService
	) {}

	public async getOutboundReportByDate(date: string): Promise<IOutboundReportResponse> {
		const data = await this.dataSource.query<IOutboundReportQueryResult[]>(this.outboundReportQuery, [date])
		return data.map((item) => {
			return {
				...item,
				detail: SuperJson.parse(item.detail) ?? [],
				overall: SuperJson.parse(item.overall) ?? []
			}
		})
	}

	// #region Outbound report Excel
	async exportDailyOutboundToExcel(factoryCode: string, date: string) {
		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(date), 'yyyy-MM-dd')
		)
		worksheet.columns = [
			{
				header: 'PO',
				key: 'po'
			},
			{
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'shoes_style_code_factory'
			},
			{
				header: this.i18nService.t('erp.fields.mat_ecolor', { lang: currentLanguage }),
				key: 'mat_ecolor'
			},
			{
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'order_qty'
			},
			{
				header: this.i18nService.t('erp.fields.daily_outbound_qty', { lang: currentLanguage }),
				key: 'daily_outbound_qty'
			},
			{
				header: this.i18nService.t('erp.fields.accumulated_qty', { lang: currentLanguage }),
				key: 'accumulated_qty'
			},
			{
				header: this.i18nService.t('erp.fields.missing_qty', { lang: currentLanguage }),
				key: 'missing_qty'
			},
			{
				header: this.i18nService.t('common.fields.remark', { lang: currentLanguage })
			}
		]

		const data = await this.getOutboundReportByDate(date)
		for (const record of data) {
			const row = worksheet.addRow(record)
			row.height = 30
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'deecf7' } }
			}
			// TODO: Fix this on render to excel
			record.detail.forEach((subRecord) => {
				const subRowHead = worksheet.addRow([])
				worksheet.getRow(subRowHead.number).font = { bold: true }
				worksheet.getRow(subRowHead.number).height = 30
				subRowHead.getCell(2).value = subRecord.mo_no
				subRowHead.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ebf1de' } }
				subRowHead.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
				worksheet.mergeCells(`B${subRowHead.number}:C${subRowHead.number}`)
				subRecord.sizes.forEach((size) => {
					const subRow = worksheet.addRow([])
					subRow.getCell(2).value = size.size_numcode + '#'
					subRow.getCell(2).font = { bold: true }
					subRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
					subRow.getCell(3).value = size.qty
					subRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				})
			})
		}

		worksheet.columns.forEach((sheetColumn) => {
			sheetColumn.font = { size: 12 }
			sheetColumn.width = 30
		})
		worksheet.getRow(1).font = { bold: true, size: 13 }
		worksheet.getRow(1).height = 20

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).height = 30
		worksheet.mergeCells('A1:H1')
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_outbound_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(date), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getRow(2).height = 30
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
	// #endregion
}
