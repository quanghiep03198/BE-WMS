import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { applyCommonStyles, type AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	DailyPoShippingProgress,
	DailyPoShippingProgressModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/daily-po-shipping-progress.schema'
import {
	PoShippingProgress,
	PoShippingProgressModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/po-shipping-progress.schema'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { Workbook, Worksheet } from 'exceljs'
import { groupBy } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DataSource } from 'typeorm'

@Injectable()
export class OutboundReportService {
	constructor(
		@InjectPinoLogger(OutboundReportService.name) private readonly logger: PinoLogger,
		@InjectModel(DailyPoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyPoShippingProgressModel: DailyPoShippingProgressModel,
		@InjectModel(PoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly poShippingProgressModel: PoShippingProgressModel,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource,
		private readonly i18nService: I18nService
	) {}

	public async getOutboundReportByDate(date: string): Promise<any> {
		const data = await this.dailyPoShippingProgressModel
			.find({ date })
			.lean({ virtuals: true, autopopulate: true })
			.populate('po_attrs', 'order_qty factory_shoes_style cust_shoes_style color_sn shipping_progress')
			.exec()

		return data.map((item) => {
			const accumulated_qty: number = Object.values(item.po_attrs.shipping_progress).reduce(
				(acc, curr) => acc + curr.shipped_out_qty,
				0
			)

			const detail = Object.entries(item.shipping_progress).map(([mo_no, sizes]) => ({
				mo_no,
				sizes: Object.entries(sizes).map(([size_numcode, qty]) => ({
					size_numcode,
					qty
				}))
			}))

			return {
				po: item.po,
				factory_shoes_style: item.po_attrs.factory_shoes_style,
				cust_shoes_style: item.po_attrs.cust_shoes_style,
				color_sn: item.po_attrs.color_sn,
				order_qty: item.po_attrs.order_qty,
				accumulated_qty: accumulated_qty,
				missing_qty: item.po_attrs.order_qty - accumulated_qty,
				daily_outbound_qty: detail.reduce(
					(acc, curr) => acc + curr.sizes.reduce((_acc, _curr) => _acc + _curr.qty, 0),
					0
				),
				detail: detail,
				overall: Object.entries(item.po_attrs.shipping_progress).map(
					([size_numcode, { order_qty, shipped_out_qty }]) => {
						return {
							size_numcode,
							order_qty,
							daily_qty: detail.reduce((acc, curr) => {
								return acc + (curr.sizes.find((sz) => sz.size_numcode === size_numcode)?.qty ?? 0)
							}, 0),
							missing_qty: order_qty - shipped_out_qty
						}
					}
				)
			}
		})
	}
	public async getOutboundHistory(po: string): Promise<any> {
		const data = await this.poShippingProgressModel
			.findOne({ po })
			.populate('outbound_history', 'date shipping_progress')
			.exec()

		if (!data) return null

		const totalShippedOutQty = Object.values(data?.shipping_progress).reduce(
			(acc, curr) => acc + curr.shipped_out_qty,
			0
		)

		const result = {
			...data.toObject(),
			total_shipped_out_qty: totalShippedOutQty,
			missing_qty: data.order_qty - totalShippedOutQty,
			outbound_history: Object.entries(groupBy(data.outbound_history, (item) => item.date)).map(([date, items]) => {
				return {
					date,
					data: items.flatMap((i) =>
						Object.entries(i.shipping_progress).map(([mo_no, sizes]) => ({
							mo_no,
							shipping_details: Object.entries(sizes)
								.sort(([size1], [size2]) => Number.parseFloat(size1) - Number.parseFloat(size2))
								.map(([size_numcode, shipped_out_qty]) => ({
									size_numcode,
									shipped_out_qty
								}))
						}))
					)
				}
			}),
			overall: Object.entries(data.shipping_progress)
				.sort(([size1], [size2]) => Number.parseFloat(size1) - Number.parseFloat(size2))
				.map(([size_numcode, { order_qty, shipped_out_qty }]) => ({
					size_numcode,
					order_qty,
					shipped_out_qty,
					missing_qty: order_qty - shipped_out_qty
				})),
			progress: ((totalShippedOutQty / data.order_qty) * 100).toFixed(2) + '%'
		}

		this.logger.debug(result)

		return result
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
