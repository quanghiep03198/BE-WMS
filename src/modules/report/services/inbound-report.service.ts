import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { applyCommonStyles, type AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { SuperJson } from '@common/utils'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DailyMoInventoryLedgerModel } from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/daily-mo-inventory-ledger.schema'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import {
	ManufacturingOrder,
	ManufacturingOrderModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/manufacturing-order.schema'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DataSource } from 'typeorm'
import { DailyMoInventoryLedger } from '../../finished-goods/infrastructure/persistence/mongodb/schemas/daily-mo-inventory-ledger.schema'
import { IInboundHistory, IInboundReportResponse } from '../interfaces'
import shapingDepartmentProductivityQuery from '../sql/assembly-productivity.sql'
import inboundHistoryQuery from '../sql/inbound-history.sql'

@Injectable()
export class InboundReportService {
	// private readonly inboundReportQuery: string = inboundReportQuery
	private readonly shapingDepartmentProductivityQuery: string = shapingDepartmentProductivityQuery
	private readonly inboundHistoryQuery: string = inboundHistoryQuery

	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource,
		@InjectPinoLogger(InboundReportService.name) private readonly logger: PinoLogger,
		@InjectModel(DailyMoInventoryLedger.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryLedgerModel: DailyMoInventoryLedgerModel,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		private readonly i18nService: I18nService
	) {}

	public async getDailyInventoryLedger(date: string): Promise<IInboundReportResponse> {
		const docs = await this.dailyMoInventoryLedgerModel
			.find({ date: date })
			.lean({ virtuals: true })
			.populate('mo_attrs', 'factory_shoes_style color_sn factory_code_produce order_qty size_ledger')
			.exec()

		return docs
			.map((doc) => {
				const accumulatedQty = Object.values(doc.mo_attrs.size_ledger).reduce(
					(acc, fluctuation) =>
						acc + fluctuation.stocked_in_qty - fluctuation.total_recall_tx + fluctuation.total_return_tx,
					0
				)
				const totalDailyInboundQty = Object.values(doc.size_ledger).reduce(
					(acc, fluctuation) =>
						acc + fluctuation.stocked_in_qty - fluctuation.total_recall_tx + fluctuation.total_return_tx,
					0
				)

				return {
					mo_no: doc.mo_no,
					factory_code_produce: doc.mo_attrs.factory_code_produce,
					factory_shoes_style: doc.mo_attrs.factory_shoes_style,
					color_sn: doc.mo_attrs.color_sn,
					assembly_lines: doc.assembly_lines.sort((a, b) => a.localeCompare(b)),
					storage_locations: doc.storage_locations.sort((a, b) => a.localeCompare(b)),
					order_qty: doc.mo_attrs.order_qty,
					daily_inbound_qty: totalDailyInboundQty,
					accumulated_qty: accumulatedQty,
					missing_qty: doc.mo_attrs.order_qty - accumulatedQty,
					size_ledger: Object.entries(doc.size_ledger)
						.map(([size, fluctuation]) => {
							return {
								size_numcode: size,
								qty: fluctuation.stocked_in_qty - fluctuation.total_recall_tx + fluctuation.total_return_tx
							}
						})
						.filter((item) => item.qty > 0)
				}
			})
			.filter((item) => item.daily_inbound_qty > 0)
	}

	public async getDailyAssemblyProductivity(date: string): Promise<IInboundReportResponse> {
		return await await this.finishedGoodsEpcModel.aggregate([
			{
				$match: {
					status: 'instock',
					$expr: { $eq: [{ $dateToString: { format: '%Y-%m-%d', date: '$inbound_at' } }, date] }
				}
			},
			{
				$group: {
					_id: {
						assembly_line: '$assembly_line.name',
						mo_no: '$mo_no',
						factory_code_produce: '$factory_code_produce',
						factory_shoes_style: '$factory_shoes_style',
						color_sn: '$color_sn',
						size_numcode: '$size_numcode'
					},
					qty: { $sum: 1 },
					storage_locations: { $addToSet: '$storage_location.name' }
				}
			},
			{
				$group: {
					_id: {
						assembly_line: '$_id.assembly_line',
						mo_no: '$_id.mo_no',
						factory_code_produce: '$_id.factory_code_produce',
						factory_shoes_style: '$_id.factory_shoes_style',
						color_sn: '$_id.color_sn'
					},
					daily_inbound_qty: { $sum: '$qty' },
					size_ledger: {
						$push: {
							size_numcode: '$_id.size_numcode',
							qty: '$qty'
						}
					},
					storage_locations: {
						$push: '$storage_locations'
					}
				}
			},
			{
				$set: {
					storage_locations: {
						$reduce: {
							input: '$storage_locations',
							initialValue: [],
							in: { $setUnion: ['$$value', '$$this'] }
						}
					}
				}
			},
			{
				$lookup: {
					from: 'manufacturing_orders',
					localField: '_id.mo_no',
					foreignField: 'mo_no',
					as: 'manufacturing_orders'
				}
			},
			{
				$unwind: '$manufacturing_orders'
			},
			{
				$project: {
					_id: 0,
					assembly_line: '$_id.assembly_line',
					mo_no: '$_id.mo_no',
					factory_code_produce: '$_id.factory_code_produce',
					factory_shoes_style: '$_id.factory_shoes_style',
					color_sn: '$_id.color_sn',
					order_qty: '$manufacturing_orders.order_qty',
					accumulated_qty: {
						$reduce: {
							input: {
								$objectToArray: '$manufacturing_orders.size_ledger'
							},
							initialValue: 0,
							in: {
								$add: [
									'$$value',
									{
										$subtract: [
											{
												$add: ['$$this.v.stocked_in_qty', '$$this.v.total_return_tx']
											},
											'$$this.v.total_recall_tx'
										]
									}
								]
							}
						}
					},
					daily_inbound_qty: 1,
					size_ledger: 1,
					storage_locations: 1
				}
			},
			{
				$project: {
					mo_no: 1,
					assembly_lines: 1,
					factory_code_produce: 1,
					factory_shoes_style: 1,
					color_sn: 1,
					order_qty: 1,
					accumulated_qty: 1,
					missing_qty: { $subtract: ['$order_qty', '$accumulated_qty'] },
					daily_inbound_qty: 1,
					size_ledger: 1,
					storage_locations: 1
				}
			},
			{
				$sort: {
					assembly_line: 1,
					mo_no: 1,
					factory_code_produce: 1,
					factory_shoes_style: 1,
					color_sn: 1
				}
			}
		])
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
		return await this.manufacturingOrderModel
			.findOne({ mo_no: manufacturingOrder })
			.populate({
				path: 'daily_inbound_history',
				select: 'date mo_no size_ledger'
			})
			.exec()
			.then((doc) => {
				if (!doc) return null
				const normalizedDoc = doc.toObject()

				const accumulatedInboundQty = Object.values(normalizedDoc.size_ledger).reduce(
					(acc, curr) => acc + curr.stocked_in_qty - curr.total_recall_tx + curr.total_return_tx,
					0
				)
				const missingQty = normalizedDoc.order_qty - accumulatedInboundQty

				return {
					...normalizedDoc,
					accumulated_inbound_qty: accumulatedInboundQty,
					missing_qty: missingQty,
					progress: ((accumulatedInboundQty / normalizedDoc.order_qty) * 100).toFixed(2) + '%'
				}
			})
	}

	async exportDailyInboundToExcel(
		factoryCode: string,
		reportType: 'daily-productivity' | 'assembly-productivity',
		date: string
	) {
		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(date), 'yyyy-MM-dd')
		)
		worksheet.columns = [
			{
				header: this.i18nService.t('factory.factory', { lang: currentLanguage }),
				key: 'factory_code_produce'
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
				key: reportType === 'daily-productivity' ? 'assembly_lines' : 'assembly_line'
			},
			{
				header: this.i18nService.t('warehouse.fields.storage_name', { lang: currentLanguage }),
				key: 'storage_locations'
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

		const getReportQueryMap = new Map<
			'daily-productivity' | 'assembly-productivity',
			{ i18nKey: string; handler: (date: string) => Promise<IInboundReportResponse> }
		>([
			[
				'daily-productivity',
				{
					i18nKey: 'daily_inbound_report',
					handler: (reportDate) => this.getDailyInventoryLedger(reportDate)
				}
			],
			[
				'assembly-productivity',
				{
					i18nKey: 'daily_assembly_productivity_report',
					handler: (reportDate) => this.getDailyAssemblyProductivity(reportDate)
				}
			]
		])
		const getDataQuery = getReportQueryMap.get(reportType)

		if (typeof getDataQuery?.handler !== 'function') throw new Error(`Invalid report type: ${reportType}`)

		const data = await getDataQuery.handler(date)

		for (const record of data) {
			const row = worksheet.addRow({
				...record,
				...(Array.isArray(record.assembly_lines) && { assembly_lines: record.assembly_lines.join(',') }),
				storage_locations: record.storage_locations.join(','),
				factory_code: this.i18nService.t(`factory.${record.factory_code_produce}`, { lang: currentLanguage })
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
			excludeColumns: ['assembly_lines', 'storage_location']
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
		worksheet.getCell('A1').value = this.i18nService.t(`inoutbound.titles.${getDataQuery.i18nKey}`, {
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
