import { type AutoFitColumnOptions, autoFitColumns } from '@/common/helpers/excel.helper'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { Workbook, Worksheet } from 'exceljs'
import { FastifyRequest } from 'fastify'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { IOutboundHistory, IOutboundReportQueryResult, IOutboundReportResponse } from '../interfaces'

@Injectable()
export class OutboundReportService {
	private readonly outboundReportQuery: string = readFileSync(join(__dirname, '../sql/outbound-report.sql'), 'utf-8')
	private readonly outboundHistoryQuery: string = readFileSync(join(__dirname, '../sql/outbound-history.sql'), 'utf-8')

	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSource: DataSource,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourcedl: DataSource,
		@Inject(REQUEST) private readonly request: FastifyRequest,
		private readonly i18nService: I18nService
	) {}

	public async getOutboundReportByDate(date: string): Promise<IOutboundReportResponse> {
		const data = await this.dataSource.query<IOutboundReportQueryResult[]>(this.outboundReportQuery, [
			this.request.headers['x-user-company'],
			date
		])
		return data.map((item) => {
			return {
				...item,
				detail: SuperJson.parse<IOutboundReportResponse[number]['detail']>(item.detail),
				overall: SuperJson.parse<IOutboundReportResponse[number]['overall']>(item.overall)
			}
		})
	}
	public async getOutboundHistory(po: string) {
		return await this.dataSource.query<IOutboundHistory[]>(this.outboundHistoryQuery, [po])
	}

	// #region Outbound report Excel
	async exportDailyOutboundToExcel(factoryCode: string, date: string) {
		const currentLanguage = I18nContext.current()?.lang

		// * Create a new workbook and worksheet
		const workbook = new Workbook()
		const worksheet: Worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(date), 'yyyy-MM-dd')
		)

		// * Worksheet columns declaration
		worksheet.columns = [
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
				header: this.i18nService.t('erp.fields.daily_productivity', { lang: currentLanguage }),
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
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))

		// * Add data to worksheet
		const data = await this.getOutboundReportByDate(date)
		for (const record of data) {
			const row = worksheet.addRow(record)
			row.height = 30
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'deecf7' } }
			}
			//
			const subHeaderRow = worksheet.addRow([])
			subHeaderRow.font = { bold: true }
			subHeaderRow.getCell(2).value = this.i18nService.t('erp.fields.size', { lang: currentLanguage })
			subHeaderRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
			subHeaderRow.getCell(3).value = this.i18nService.t('erp.fields.daily_productivity', { lang: currentLanguage })
			subHeaderRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			subHeaderRow.getCell(4).value = this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage })
			subHeaderRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
			subHeaderRow.getCell(5).value = this.i18nService.t('erp.fields.missing_qty', { lang: currentLanguage })
			subHeaderRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }

			record.overall.forEach((subRecord) => {
				const subRow = worksheet.addRow([])
				subRow.getCell(2).value = subRecord.size_numcode + '#'
				subRow.getCell(2).font = { bold: true }
				subRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
				subRow.getCell(3).value = subRecord.daily_qty
				subRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(4).value = subRecord.po_size_qty
				subRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
				subRow.getCell(5).value = subRecord.missing_qty
				subRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			})
		}

		// * Auto fit columns
		autoFitColumns.call(worksheet, { minWidth: 10 } satisfies AutoFitColumnOptions)

		// * Add  header title
		worksheet.insertRow(1, null)
		worksheet.mergeCells('A1:H1')
		worksheet.getRow(1).height = 30
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getRow(1).font = { size: 14, bold: true }
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'e5e5e5' } }
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_outbound_report', {
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
