import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { applyCommonStyles, type AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { SuperJson } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DailyMoInventoryVariationModel } from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/daily-mo-inventory-variation.schema'
import {
	MoInventoryVariation,
	MoInventoryVariationModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/mo-inventory-variation.schema'
import { TENANCY_DATA_SOURCE } from '@modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectModel } from '@nestjs/mongoose'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { FastifyRequest } from 'fastify'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DataSource } from 'typeorm'
import { IInboundHistory, IInboundReportQueryResult, IInboundReportResponse } from '../interfaces'
import inboundHistoryQuery from '../sql/inbound-history.sql'
import inboundReportQuery from '../sql/inbound-report.sql'
import shapingDepartmentProductivityQuery from '../sql/shaping-department-productivity.sql'
import { DailyMoInventoryVariation } from './../../finished-goods/infrastructure/persistence/mongodb/schemas/daily-mo-inventory-variation.schema'

@Injectable()
export class InboundReportService {
	// private readonly inboundReportQuery: string = inboundReportQuery
	private readonly shapingDepartmentProductivityQuery: string = shapingDepartmentProductivityQuery
	private readonly inboundHistoryQuery: string = inboundHistoryQuery

	constructor(
		@InjectPinoLogger(InboundReportService.name) private readonly logger: PinoLogger,
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSource: DataSource,
		@Inject(REQUEST) private readonly request: FastifyRequest,
		private readonly i18nService: I18nService,
		@InjectModel(DailyMoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryVariationModel: DailyMoInventoryVariationModel,
		@InjectModel(MoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryVariationModel: MoInventoryVariationModel
	) {}

	/**
	 * @deprecated This method is deprecated and will be removed in future versions. Please use getDailyInventoryVariation instead.
	 * @param date
	 * @returns
	 */
	public async getDailyProductivity(date: string): Promise<IInboundReportResponse> {
		const data = await this.dataSource.query<IInboundReportQueryResult[]>(inboundReportQuery, [
			this.request.headers['x-user-factory'],
			date
		])
		return data.map((item) => ({
			...item,
			size_data: JSON.parse(item.size_data)
		}))
	}

	public async getDailyInventoryVariation(date: string) {
		const docs = await this.dailyMoInventoryVariationModel
			.find({ date: date })
			.lean({ virtuals: true })
			.populate('mo_attrs', 'factory_shoes_style color_sn factory_code_produce mo_total_qty inventory_variation')
			.exec()

		this.logger.debug(docs)

		return docs.map((doc) => {
			const accumulatedQty = Object.values(doc.mo_attrs.inventory_variation).reduce(
				(acc, variation) => acc + variation.stocked_in_qty - variation.total_recall_tx + variation.total_return_tx,
				0
			)
			const totalDailyInboundQty = Object.values(doc.inventory_variation).reduce(
				(acc, variation) => acc + variation.stocked_in_qty - variation.total_recall_tx + variation.total_return_tx,
				0
			)

			return {
				mo_no: doc.mo_no,
				factory_code: doc.mo_attrs.factory_code_produce,
				factory_shoes_style: doc.mo_attrs.factory_shoes_style,
				color_sn: doc.mo_attrs.color_sn,
				assembly_lines: doc.assembly_lines.sort((a, b) => a.localeCompare(b)),
				storage_locations: doc.storage_locations.sort((a, b) => a.localeCompare(b)),
				order_qty: doc.mo_attrs.mo_total_qty,
				daily_inbound_qty: totalDailyInboundQty,
				accumulated_qty: accumulatedQty,
				missing_qty: doc.mo_attrs.mo_total_qty - accumulatedQty,
				variation_details: Object.entries(doc.inventory_variation).map(([size, variation]) => {
					return {
						size_numcode: size,
						qty: variation.stocked_in_qty - variation.total_recall_tx + variation.total_return_tx
					}
				})
			}
		})
	}

	public async getDailyShapingDepartmentProductivity(date: string): Promise<IInboundReportResponse> {
		const data = await this.dataSource.query<IInboundReportQueryResult[]>(this.shapingDepartmentProductivityQuery, [
			this.request.headers['x-user-factory'],
			date
		])
		return data.map((item) => ({
			...item,
			size_data: JSON.parse(item.size_data)
		}))
	}

	public async getInboundHistory(commandNumber: string) {
		return await this.dataSource
			.query<IInboundHistory[]>(this.inboundHistoryQuery, [commandNumber])
			.then((result) => result.at(0))
			.then((result) => {
				if (!result) return null
				return {
					...result,
					missing_qty: result.mo_qty - result.accumulated_inbound_qty,
					progress: ((result.accumulated_inbound_qty / result.mo_qty) * 100).toFixed(2) + '%',
					order_size_run: SuperJson.parse<Exclude<IInboundHistory['order_size_run'], string>>(
						result.order_size_run,
						1
					),
					daily_inbound_history: SuperJson.parse<Exclude<IInboundHistory['daily_inbound_history'], string>>(
						result.daily_inbound_history,
						1
					),
					inbound_history_by_size: SuperJson.parse<Exclude<IInboundHistory['inbound_history_by_size'], string>>(
						result.inbound_history_by_size,
						1
					)
				}
			})
	}

	public async getInboundHistoryReport(manufacturingOrder: string) {
		return await this.moInventoryVariationModel
			.findOne({ mo_no: manufacturingOrder })
			.populate({
				path: 'daily_inbound_history',
				select: 'date mo_no inventory_variation'
			})
			.exec()
			.then((doc) => {
				if (!doc) return null
				const normalizedDoc = doc.toObject()
				this.logger.debug(normalizedDoc)

				const accumulatedInboundQty = Object.values(normalizedDoc.inventory_variation).reduce(
					(acc, curr) => acc + curr.stocked_in_qty - curr.total_recall_tx + curr.total_return_tx,
					0
				)
				const missingQty = normalizedDoc.mo_total_qty - accumulatedInboundQty

				return {
					...normalizedDoc,
					accumulated_inbound_qty: accumulatedInboundQty,
					missing_qty: missingQty,
					progress: ((accumulatedInboundQty / normalizedDoc.mo_total_qty) * 100).toFixed(2) + '%'
				}
			})
	}

	async exportDailyInboundToExcel(reportType: 'daily-productivity' | 'shaping-department-productivity', date: string) {
		const currentLanguage = I18nContext.current()?.lang
		const factoryCode = this.request.headers['x-user-factory']
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(date), 'yyyy-MM-dd')
		)
		worksheet.columns = [
			{
				header: this.i18nService.t('factory.factory', { lang: currentLanguage }),
				key: 'factory_code'
			},
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
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
				header: this.i18nService.t('erp.fields.shaping_dept_name', { lang: currentLanguage }),
				key: 'shaping_dept_name'
			},
			{
				header: this.i18nService.t('warehouse.fields.storage_name', { lang: currentLanguage }),
				key: 'storage'
			},
			{
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'order_qty'
			},
			{
				header: this.i18nService.t('erp.fields.daily_inbound_qty', { lang: currentLanguage }),
				key: 'daily_inbound_qty'
			},
			{
				header: this.i18nService.t('erp.fields.accumulated_qty', { lang: currentLanguage }),
				key: 'accumulated_qty'
			},
			{
				header: this.i18nService.t('erp.fields.missing_qty', { lang: currentLanguage }),
				key: 'missing_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))
		const data =
			reportType === 'daily-productivity'
				? await this.getDailyProductivity(date)
				: await this.getDailyShapingDepartmentProductivity(date)

		for (const record of data) {
			const row = worksheet.addRow({
				...record,
				factory_code: this.i18nService.t(`factory.${record.factory_code}`, { lang: currentLanguage })
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
			for (const subRecord of record.size_data) {
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
			excludeColumns: ['shaping_dept_name', 'storage']
		} satisfies AutoFitColumnOptions)

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).font = { bold: true, size: 14 }
		worksheet.getRow(1).height = 30
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.mergeCells('A1:J1')
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').font = { bold: true, size: 16 }
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_inbound_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(date), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})

		const footerRow = worksheet.addRow(Array.from({ length: worksheet.columns.length }, () => null))
		footerRow.height = 30
		worksheet.mergeCells(`A${footerRow.number}:G${footerRow.number}`)
		worksheet.mergeCells(`H${footerRow.number}:J${footerRow.number}`)
		worksheet.getCell(`A${footerRow.number}`).value = this.i18nService.t('erp.fields.total_daily_productivity', {
			lang: currentLanguage
		})
		worksheet.getCell(`H${footerRow.number}`).value = data.reduce((acc, curr) => acc + curr.daily_inbound_qty, 0)
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

		// * Freeze header row at top
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		applyCommonStyles.call(worksheet)

		return await workbook.xlsx.writeBuffer()
	}
}
