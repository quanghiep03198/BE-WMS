import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { applyCommonStyles, type AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { OrderService } from '@modules/order/order.service'
import { Transactional } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { addMonths, format } from 'date-fns'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { UpdateInventoryReportDTO, UpdateInventoryReportQueryDTO } from '../dto/inventory-report.dto'
import { InventoryAuditEntity } from '../entities/inventory-report.entity'
import { IInventoryReportResponse } from '../interfaces'
import { MoInventoryAudit, MoInventoryAuditModel } from '../schemas/inventory-audit.schema'
import upsertOutboundInventoryQuery from '../sql/upsert-outbound-inventory-audit.sql'

@Injectable()
export class InventoryAuditService {
	private readonly upsertOutboundInventory: string = upsertOutboundInventoryQuery

	constructor(
		@InjectModel(MoInventoryAudit.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryAuditModel: MoInventoryAuditModel,
		// @InjectModel(DailyMoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		// private readonly dailyMoInventoryVariation: DailyMoInventoryVariationModel,
		@InjectPinoLogger(InventoryAuditEntity.name) private readonly logger: PinoLogger,
		private readonly orderService: OrderService,
		private readonly i18nService: I18nService
	) {}

	public async getMonthlyInventoryAudit(month): Promise<IInventoryReportResponse> {
		const data = await this.moInventoryAuditModel
			.find({ year_month: month })
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

	public async updateInventoryAudit(
		filterQuery: UpdateInventoryReportQueryDTO,
		update: UpdateInventoryReportDTO
	): Promise<void> {
		const updateOperation = update.reduce((acc, curr) => {
			return {
				...acc,
				[`inventory_variation.${curr.size_numcode}.supplemental_stocked_in_qty`]: curr.supplemental_stocked_in_qty,
				[`inventory_variation.${curr.size_numcode}.supplemental_shipped_out_qty`]: curr.supplemental_shipped_out_qty
			}
		}, {})

		await this.moInventoryAuditModel
			.updateOne({ ...filterQuery, inventory_closure_status: 'pending' }, { $set: updateOperation })
			.exec()
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async processInventoryAuditCheckout(month: string) {
		const currentMonth = format(new Date(month), 'yyyy-MM')
		const nextMonth = format(addMonths(new Date(month), 1), 'yyyy-MM')

		// await this.moInventoryAuditModel
		// 	.updateMany(
		// 		{ year_month: currentMonth, inventory_closure_status: 'pending' },
		// 		{
		// 			$set: {
		// 				inventory_closure_status: 'completed'
		// 			}
		// 		}
		// 	)
		// 	.exec()

		return await this.moInventoryAuditModel
			.aggregate([
				{
					$match: {
						year_month: month
					}
				},
				{
					$lookup: {
						from: 'mo_inventory_variation',
						localField: 'mo_no',
						foreignField: 'mo_no',
						as: 'mo_inventory_variation'
					}
				},
				{
					$set: {
						mo_inventory_variation: {
							$first: '$mo_inventory_variation'
						}
					}
				},
				{
					$set: {
						remaining_order_qty: {
							$cond: {
								if: { $ifNull: ['$mo_inventory_variation', false] },
								then: {
									$subtract: [
										'$mo_inventory_variation.order_qty',
										{
											$reduce: {
												input: {
													$objectToArray: {
														$ifNull: ['$mo_inventory_variation.inventory_variation', {}]
													}
												},
												initialValue: 0,
												in: { $add: ['$$value', { $ifNull: ['$$this.v.shipped_out_qty', 0] }] }
											}
										}
									]
								},
								else: 1
							}
						}
					}
				},
				{
					$match: {
						remaining_order_qty: { $gt: 0 }
					}
				},
				{
					$set: {
						base_inventory_variation_array: {
							$map: {
								input: { $objectToArray: '$inventory_variation' },
								as: 'sizeItem',
								in: {
									k: '$$sizeItem.k',
									v: {
										order_qty: '$$sizeItem.v.order_qty',
										beginning_inventory_qty: {
											$subtract: [
												{
													$add: [
														'$$sizeItem.v.beginning_inventory_qty',
														'$$sizeItem.v.stocked_in_qty',
														'$$sizeItem.v.supplemental_stocked_in_qty'
													]
												},
												{
													$add: [
														'$$sizeItem.v.shipped_out_qty',
														'$$sizeItem.v.supplemental_shipped_out_qty'
													]
												}
											]
										}
									}
								}
							}
						}
					}
				},
				{
					$lookup: {
						from: 'daily_mo_inventory_variation',
						let: {
							moNo: '$mo_no'
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ['$mo_no', '$$moNo'] },
											{ $eq: [{ $substrBytes: ['$date', 0, 7] }, nextMonth] }
										]
									}
								}
							},
							{
								$project: {
									inventory_variation_array: { $objectToArray: '$inventory_variation' }
								}
							},
							{ $unwind: '$inventory_variation_array' },
							{
								$group: {
									_id: '$inventory_variation_array.k',
									stocked_in_qty: {
										$sum: {
											$subtract: [
												{
													$add: [
														'$inventory_variation_array.v.stocked_in_qty',
														'$inventory_variation_array.v.total_return_tx'
													]
												},
												'$inventory_variation_array.v.total_recall_tx'
											]
										}
									}
								}
							},
							{
								$project: {
									_id: 0,
									k: '$_id',
									v: {
										stocked_in_qty: '$stocked_in_qty'
									}
								}
							},
							{
								$group: {
									_id: null,
									inventory_variation: { $push: '$$ROOT' }
								}
							},
							{
								$project: {
									_id: 0,
									inventory_variation: { $arrayToObject: '$inventory_variation' }
								}
							}
						],
						as: 'daily_variation'
					}
				},
				{
					$lookup: {
						from: 'daily_po_shipping_progress',
						let: {
							moNo: '$mo_no'
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$eq: [{ $substrBytes: ['$date', 0, 7] }, nextMonth]
									}
								}
							},
							{
								$project: {
									shipping_progress_array: {
										$objectToArray: {
											$ifNull: ['$shipping_progress', {}]
										}
									}
								}
							},
							{ $unwind: '$shipping_progress_array' },
							{
								$match: {
									$expr: {
										$eq: ['$shipping_progress_array.k', '$$moNo']
									}
								}
							},
							{
								$project: {
									shipping_variation_array: {
										$objectToArray: {
											$ifNull: ['$shipping_progress_array.v', {}]
										}
									}
								}
							},
							{ $unwind: '$shipping_variation_array' },
							{
								$group: {
									_id: '$shipping_variation_array.k',
									shipped_out_qty: {
										$sum: {
											$cond: {
												if: { $eq: [{ $type: '$shipping_variation_array.v' }, 'object'] },
												then: { $ifNull: ['$shipping_variation_array.v.shipped_out_qty', 0] },
												else: { $ifNull: ['$shipping_variation_array.v', 0] }
											}
										}
									}
								}
							},
							{
								$project: {
									_id: 0,
									k: '$_id',
									v: {
										shipped_out_qty: '$shipped_out_qty'
									}
								}
							},
							{
								$group: {
									_id: null,
									inventory_variation: { $push: '$$ROOT' }
								}
							},
							{
								$project: {
									_id: 0,
									inventory_variation: { $arrayToObject: '$inventory_variation' }
								}
							}
						],
						as: 'daily_shipping_variation'
					}
				},
				{
					$set: {
						daily_variation: {
							$ifNull: [{ $first: '$daily_variation' }, { inventory_variation: {} }]
						},
						daily_shipping_variation: {
							$ifNull: [{ $first: '$daily_shipping_variation' }, { inventory_variation: {} }]
						}
					}
				},
				{
					$set: {
						inventory_variation: {
							$arrayToObject: {
								$map: {
									input: '$base_inventory_variation_array',
									as: 'baseSizeItem',
									in: {
										k: '$$baseSizeItem.k',
										v: {
											$let: {
												vars: {
													dailySizeVariation: {
														$first: {
															$map: {
																input: {
																	$filter: {
																		input: {
																			$objectToArray: '$daily_variation.inventory_variation'
																		},
																		as: 'dailyItem',
																		cond: { $eq: ['$$dailyItem.k', '$$baseSizeItem.k'] }
																	}
																},
																as: 'matchedDailyItem',
																in: '$$matchedDailyItem.v'
															}
														}
													},
													dailyShippingSizeVariation: {
														$first: {
															$map: {
																input: {
																	$filter: {
																		input: {
																			$objectToArray: '$daily_shipping_variation.inventory_variation'
																		},
																		as: 'shippingItem',
																		cond: { $eq: ['$$shippingItem.k', '$$baseSizeItem.k'] }
																	}
																},
																as: 'matchedShippingItem',
																in: '$$matchedShippingItem.v'
															}
														}
													}
												},
												in: {
													order_qty: '$$baseSizeItem.v.order_qty',
													beginning_inventory_qty: {
														$subtract: [
															'$$baseSizeItem.v.beginning_inventory_qty',
															{ $ifNull: ['$$dailyShippingSizeVariation.shipped_out_qty', 0] }
														]
													},
													stocked_in_qty: { $ifNull: ['$$dailySizeVariation.stocked_in_qty', 0] },
													shipped_out_qty: {
														$ifNull: ['$$dailyShippingSizeVariation.shipped_out_qty', 0]
													},
													supplemental_stocked_in_qty: 0,
													supplemental_shipped_out_qty: 0
												}
											}
										}
									}
								}
							}
						},
						year_month: nextMonth,
						inventory_closure_status: 'pending'
					}
				},
				{
					$unset: [
						'_id',
						'base_inventory_variation_array',
						'daily_variation',
						'daily_shipping_variation',
						'mo_inventory_variation',
						'remaining_order_qty'
					]
				}
				// {
				// 	$merge: {
				// 		into: this.moInventoryAuditModel.collection.name,
				// 		on: ['mo_no', 'year_month'],
				// 		whenMatched: 'merge',
				// 		whenNotMatched: 'insert'
				// 	}
				// }
			])
			.exec()
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

		const data = await this.getMonthlyInventoryAudit(format(new Date(month), 'yyyyMM'))

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
