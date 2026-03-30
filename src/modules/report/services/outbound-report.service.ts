import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { applyCommonStyles, type AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { Workbook, Worksheet } from 'exceljs'
import { FastifyRequest } from 'fastify'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
			this.request.headers['x-user-factory'],
			date
		])
		return data.map((item) => ({
			...item,
			detail: SuperJson.parse<IOutboundReportResponse[number]['detail']>(item.detail),
			overall: SuperJson.parse<IOutboundReportResponse[number]['overall']>(item.overall)
		}))
	}
	public async getOutboundHistory(factoryCode: string, po: string) {
		return await this.dataSource
			.query<IOutboundHistory[]>(this.outboundHistoryQuery, [factoryCode, po])
			.then(([result]) => {
				if (!result) return null
				return {
					...result,
					outbound_history: SuperJson.parse<Exclude<IOutboundHistory['outbound_history'], string>>(
						result?.outbound_history,
						3
					),
					overall: SuperJson.parse<Exclude<IOutboundHistory['overall'], string>>(result.overall, 3),
					progress: ((result.accumulated_outbound_qty / result.po_qty) * 100).toFixed(2) + '%'
				}
			})
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
				row.getCell(i).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
				}
			}

			const subHeaderRow = worksheet.addRow([])
			subHeaderRow.font = { bold: true }
			subHeaderRow.getCell(2).value = this.i18nService.t('erp.fields.size', { lang: currentLanguage })
			subHeaderRow.getCell(2).fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
			}
			subHeaderRow.getCell(3).value = this.i18nService.t('erp.fields.daily_productivity', { lang: currentLanguage })
			subHeaderRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			subHeaderRow.getCell(4).value = this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage })
			subHeaderRow.getCell(4).fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
			}
			subHeaderRow.getCell(5).value = this.i18nService.t('erp.fields.missing_qty', { lang: currentLanguage })
			subHeaderRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }

			if (Array.isArray(record.overall))
				record.overall.forEach((subRecord) => {
					const subRow = worksheet.addRow([])
					subRow.getCell(2).value = subRecord.size_numcode + '#'
					subRow.getCell(2).font = { bold: true }
					subRow.getCell(2).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
					}
					subRow.getCell(3).value = subRecord.daily_qty
					subRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
					subRow.getCell(4).value = subRecord.po_size_qty
					subRow.getCell(4).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
					}
					subRow.getCell(5).value = subRecord.missing_qty
					subRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				})
		}

		// * Auto fit columns
		autoFitColumns.call(worksheet, { minWidth: 10 } satisfies AutoFitColumnOptions)

		// * Add header title
		worksheet.insertRow(1, null)
		worksheet.mergeCells('A1:H1')
		worksheet.getRow(1).height = 30
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getRow(1).font = { size: 14, bold: true }
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_outbound_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(date), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})

		const footerRow = worksheet.addRow(Array.from({ length: worksheet.columns.length }, () => null))
		footerRow.height = 30
		worksheet.mergeCells(`A${footerRow.number}:D${footerRow.number}`)
		worksheet.mergeCells(`E${footerRow.number}:H${footerRow.number}`)
		worksheet.getCell(`A${footerRow.number}`).value = this.i18nService.t('erp.fields.total_daily_productivity', {
			lang: currentLanguage
		})
		worksheet.getCell(`H${footerRow.number}`).value = data.reduce((acc, curr) => acc + curr.daily_outbound_qty, 0)
		worksheet.getCell(`H${footerRow.number}`).style = {
			font: { color: { argb: ExcelColorPalette.DESTRUCTIVE_FOREGROUND } }
		}
		footerRow.eachCell((cell) => {
			cell.font = { bold: true, size: 12 }
			cell.style.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
			}
		})

		// * Split worksheet - panel dưới chỉ hiển thị footer row
		worksheet.views = [
			{
				state: 'frozen',
				xSplit: 0,
				ySplit: 2
			}
		]

		// * Cell styles
		applyCommonStyles.call(worksheet)

		return await workbook.xlsx.writeBuffer()
	}
	// #endregion
}
