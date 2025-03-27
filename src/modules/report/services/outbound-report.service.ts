import { TENANCY_DATASOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
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
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource,
		@Inject(REQUEST) private readonly request: Request,
		private readonly i18nService: I18nService
	) {}

	public async getOutboundReportByDate(date: string): Promise<IOutboundReportResponse> {
		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.connect()
		const data = await queryRunner.manager.query<IOutboundReportQueryResult[]>(this.outboundReportQuery, [date])
		return data.map((item) => {
			return {
				...item,
				size_data: JSON.parse(item.size_data)
			}
		})
	}

	// #region Outbound report Excel
	async exportDailyOutboundToExcel(date: string) {
		const currentLanguage = I18nContext.current()?.lang
		const factoryCode = this.request.headers['x-user-company']
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(date), 'yyyy-MM-dd')
		)
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
			}
		]

		const data = await this.getOutboundReportByDate(date)
		for (const record of data) {
			const row = worksheet.addRow(record)
			row.height = 20
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'deecf7' } }
			}
			// const subRecords = await this.getOutboundReportDetailByDate(record.mo_no, record.factory_code, date)
			for (const subRecord of record.size_data) {
				const subRow = worksheet.addRow([])
				subRow.getCell(2).value = subRecord.size_numcode + '#'
				subRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
				subRow.getCell(3).value = subRecord.qty
				subRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
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
