import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { applyCommonStyles, type AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	ManufacturingOrder,
	ManufacturingOrderModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/manufacturing-order.schema'
import { InventoryClosureStatus } from '@modules/inventory/domain/constants'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { addMonths, format } from 'date-fns'
import { Workbook } from 'exceljs'
import { AnyBulkWriteOperation } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger } from 'nestjs-pino'
import { IInventoryReportResponse } from '../../../../application/interfaces'
import { IInventoryAuditRepository } from '../../../../application/ports/inventory-audit.port.interface'
import { InventoryAuditCheckoutPipelineBuilder } from '../builders/inventory-audit-checkout-pipeline.builder'
import { MoInventoryAudit, MoInventoryAuditDocument, MoInventoryAuditModel } from '../schemas/inventory-audit.schema'

@Injectable()
export class InventoryAuditRepository implements IInventoryAuditRepository {
	constructor(
		@InjectPinoLogger(InventoryAuditRepository.name) private readonly logger,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>,
		@InjectModel(MoInventoryAudit.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryAuditModel: MoInventoryAuditModel,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		private readonly i18nService: I18nService
	) {}

	public async getMonthlyInventoryAudit(
		month: string,
		manufacturingOrders: Array<string> = []
	): Promise<IInventoryReportResponse> {
		const data = await this.moInventoryAuditModel
			.find({
				year_month: month,
				...(manufacturingOrders.length > 0 && { mo_no: { $in: manufacturingOrders } })
			})
			.lean({ virtuals: true })
			.populate({
				path: 'mo_attrs',
				select: 'brand_name factory_code_produce factory_shoes_style cust_shoes_style color_sn order_qty'
			})
			.exec()

		return data.map((item) => {
			const inventoryVariation = Object.entries(item.inventory_variation)
				.sort(([size1], [size2]) => Number.parseFloat(size1) - Number.parseFloat(size2))
				.map(([size, variation]) => {
					return {
						size_numcode: size,
						order_qty: variation.order_qty,
						beginning_inventory_qty: variation.beginning_inventory_qty,
						stocked_in_qty: variation.stocked_in_qty,
						shipped_out_qty: variation.shipped_out_qty,
						supplemental_stocked_in_qty: variation.supplemental_stocked_in_qty,
						supplemental_shipped_out_qty: variation.supplemental_shipped_out_qty,
						final_inventory_qty:
							variation.beginning_inventory_qty +
							variation.stocked_in_qty +
							variation.supplemental_stocked_in_qty -
							variation.shipped_out_qty -
							variation.supplemental_shipped_out_qty
					}
				})

			const totalBeginningInventoryQty = inventoryVariation.reduce(
				(acc, curr) => acc + curr.beginning_inventory_qty,
				0
			)
			const totalStockedInQty = inventoryVariation.reduce((acc, curr) => acc + curr.stocked_in_qty, 0)
			const totalShippedOutQty = inventoryVariation.reduce((acc, curr) => acc + curr.shipped_out_qty, 0)
			const totalSupplementalStockedInQty = inventoryVariation.reduce(
				(acc, curr) => acc + curr.supplemental_stocked_in_qty - curr.supplemental_shipped_out_qty,
				0
			)

			return {
				mo_no: item.mo_no,
				order_qty: item.mo_attrs.order_qty,
				brand_name: item.mo_attrs.brand_name,
				factory_shoes_style: item.mo_attrs.factory_shoes_style,
				cust_shoes_style: item.mo_attrs.cust_shoes_style,
				color_sn: item.mo_attrs.color_sn,
				inventory_closure_status: item.inventory_closure_status,
				beginning_inventory_qty: totalBeginningInventoryQty,
				total_stocked_in_qty: totalStockedInQty,
				total_shipped_out_qty: totalShippedOutQty,
				total_supplemental_qty: totalSupplementalStockedInQty,
				storage_locations: item.storage_locations,
				final_inventory_qty:
					totalBeginningInventoryQty + totalStockedInQty - totalShippedOutQty + totalSupplementalStockedInQty,
				inventory_variation: inventoryVariation
			}
		})
	}

	public async getInventoryAuditClosureStatus(month: string): Promise<InventoryClosureStatus[]> {
		const statuses = await this.moInventoryAuditModel
			.distinct('inventory_closure_status', { year_month: month })
			.exec()
		return statuses as InventoryClosureStatus[]
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async updateInventoryAuditVariation(
		pendingVariation: Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			inventory_variation: Record<
				string,
				{
					order_qty: number
					stocked_in_qty: number
					total_recall_tx: number
					total_return_tx: number
					shipped_out_qty: number
				}
			>
		}>,
		storageLocation: Array<string> = []
	) {
		const manufacturingOrders = await this.manufacturingOrderModel
			.find({ mo_no: { $in: pendingVariation.map(({ mo_no }) => mo_no) } })
			.lean()

		const manufacturingOrdersMap = new Map(manufacturingOrders.map((mo) => [mo.mo_no, mo]))
		const yearMonth = format(new Date(), 'yyyy-MM')

		// * Cập nhật lại tồn kho trong tháng
		const monthlyInventoryBulkWriteOperator = pendingVariation.flatMap((change) => {
			const { inventory_variation } = manufacturingOrdersMap.get(change.mo_no)

			const inventoryVariation = Object.entries(inventory_variation).reduce((acc, [size, variation]) => {
				return {
					...acc,
					[size]: {
						order_qty: variation.order_qty,
						beginning_inventory_qty: 0,
						stocked_in_qty: 0,
						shipped_out_qty: 0,
						supplemental_stocked_in_qty: 0,
						supplemental_shipped_out_qty: 0
					}
				}
			}, {})

			this.logger.debug(inventoryVariation)

			const incrementExpression = Object.entries(change.inventory_variation).reduce((acc, [size, variation]) => {
				return {
					...acc,
					[`inventory_variation.${size}.stocked_in_qty`]:
						variation.stocked_in_qty - variation.total_recall_tx + variation.total_return_tx,
					[`inventory_variation.${size}.shipped_out_qty`]: variation.shipped_out_qty
				}
			}, {})

			return [
				{
					updateOne: {
						filter: { mo_no: change.mo_no, year_month: yearMonth },
						update: {
							$setOnInsert: {
								mo_no: change.mo_no,
								year_month: yearMonth,
								inventory_closure_status: 'pending',
								inventory_variation: inventoryVariation
							},
							$addToSet: {
								storage_locations: { $each: storageLocation }
							}
						},
						upsert: true
					}
				},
				{
					updateOne: {
						filter: { mo_no: change.mo_no, year_month: yearMonth },
						update: {
							$inc: incrementExpression
						}
					}
				}
			] as AnyBulkWriteOperation<MoInventoryAuditDocument>[]
		})

		await this.moInventoryAuditModel.bulkWrite(monthlyInventoryBulkWriteOperator, {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: true,
			retryWrites: true,
			timestamps: true
		})
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async saveSupplementalQty(
		filterQuery: {
			mo_no: string
			year_month: string
		},
		update: Record<
			| `inventory_variation.${string}.supplemental_stocked_in_qty`
			| `inventory_variation.${string}.supplemental_shipped_out_qty`,
			number
		>
	): Promise<void> {
		// const updateOperation = update.reduce((acc, curr) => {
		// 	return {
		// 		...acc,
		// 		[`inventory_variation.${curr.size_numcode}.supplemental_stocked_in_qty`]: curr.supplemental_stocked_in_qty,
		// 		[`inventory_variation.${curr.size_numcode}.supplemental_shipped_out_qty`]: curr.supplemental_shipped_out_qty
		// 	}
		// }, {})

		await this.moInventoryAuditModel
			.updateOne({ ...filterQuery, inventory_closure_status: 'pending' }, { $set: update })
			.exec()
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async checkoutInventoryAudit(month: string): Promise<any[]> {
		const checkoutMonth = format(new Date(month), 'yyyy-MM')
		const nextMonth = format(addMonths(new Date(month), 1), 'yyyy-MM')
		const currentMonth = format(new Date(), 'yyyy-MM')

		await this.moInventoryAuditModel
			.updateMany(
				{ year_month: currentMonth, inventory_closure_status: 'pending' },
				{
					$set: {
						inventory_closure_status: 'completed'
					}
				}
			)
			.exec()

		const pipeline = InventoryAuditCheckoutPipelineBuilder.build({
			checkoutMonth,
			nextMonth
		})

		return await this.moInventoryAuditModel.aggregate(pipeline).exec()
	}

	// #region Inventory report Excel
	public async exportExcelInventoryAudit(month: string, factoryCode: string, commandNumbers: string[]) {
		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(month), 'yyyy-MM')
		)

		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
			},
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
				header: this.i18nService.t('warehouse.fields.storage_name', { lang: currentLanguage }),
				key: 'storage'
			},
			{
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'order_qty'
			},
			{
				header: this.i18nService.t('erp.fields.total_init_qty', { lang: currentLanguage }),
				key: 'init_inv_qty'
			},
			{
				header: this.i18nService.t('erp.fields.inbound_qty', { lang: currentLanguage }),
				key: 'stocked_in_qty'
			},
			{
				header: this.i18nService.t('erp.fields.outbound_qty', { lang: currentLanguage }),
				key: 'shipped_out_qty'
			},
			{
				header: this.i18nService.t('erp.fields.actual_inventory_qty', { lang: currentLanguage }),
				key: 'supplemental_qty'
			},
			{
				header: this.i18nService.t('erp.fields.final_inventory_qty', { lang: currentLanguage }),
				key: 'final_inv_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))

		const data = await this.getMonthlyInventoryAudit(format(new Date(month), 'yyyy-MM'), commandNumbers)

		// * Add data to worksheet
		const filteredData = data.filter(
			(item) =>
				(item.beginning_inventory_qty > 0 ||
					item.total_stocked_in_qty > 0 ||
					item.total_shipped_out_qty > 0 ||
					item.total_supplemental_qty > 0 ||
					item.final_inventory_qty > 0) &&
				(Array.isArray(commandNumbers) && commandNumbers.length > 0 ? commandNumbers.includes(item.mo_no) : true)
		)
		for (const record of filteredData) {
			const row = worksheet.addRow(record)
			row.height = 30
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
				}
			}
			for (const subRecord of record.inventory_variation) {
				const subRow = worksheet.addRow([])
				subRow.getCell(5).value = subRecord.size_numcode + '#'
				subRow.getCell(5).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
				}
				subRow.getCell(5).font = { bold: true }
				subRow.getCell(6).value = subRecord.order_qty
				subRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(7).value = subRecord.beginning_inventory_qty
				subRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(8).value = subRecord.stocked_in_qty
				subRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(9).value = subRecord.shipped_out_qty
				subRow.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(10).value = subRecord.supplemental_stocked_in_qty - subRecord.supplemental_shipped_out_qty
				subRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(11).value = subRecord.final_inventory_qty
				subRow.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			}
		}

		// * Auto-fit columns
		autoFitColumns.call(worksheet, { minWidth: 16, excludeColumns: ['po', 'storage'] } satisfies AutoFitColumnOptions)

		// * Add header title
		worksheet.insertRow(1, null)
		worksheet.mergeCells('A1:K1')
		worksheet.getRow(1).font = { size: 14, bold: true }
		worksheet.getRow(1).height = 30
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.getRow(2).alignment = { vertical: 'middle', horizontal: 'center' }

		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.file_monthly_inventory_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				month: format(new Date(month), 'yyyy-MM')
			},
			lang: currentLanguage
		})

		// * Auto filter
		worksheet.autoFilter = `A2:D${2 + filteredData.length}`

		// * Freeze header row
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.alignment = { ...row.alignment, vertical: 'middle' }
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

		// * Cell styles
		applyCommonStyles.call(worksheet)

		return await workbook.xlsx.writeBuffer()
	}
}
