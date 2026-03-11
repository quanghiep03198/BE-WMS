import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { type AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { OrderService } from '@/modules/order/order.service'
import { UserEntity } from '@/modules/user/entities/user.entity'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectDataSource } from '@nestjs/typeorm'
import { addMonths, format } from 'date-fns'
import { Workbook } from 'exceljs'
import { intersection, isEmpty, isNil } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Brackets, DataSource, Equal, In, IsNull, Not, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { InventoryType } from '../constants'
import { UpdateInventoryReportDTO, UpdateInventoryReportQueryDTO } from '../dto/inventory-report.dto'
import { InventoryAuditEntity } from '../entities/inventory-report.entity'
import { IInventoryReportQueryResult, IInventoryReportResponse } from '../interfaces'

@Injectable()
export class InventoryAuditService {
	private readonly inventoryReportQuery: string = readFileSync(join(__dirname, '../sql/inventory-audit.sql'), 'utf-8')
	private readonly upsertOutboundInventory: string = readFileSync(
		join(__dirname, '../sql/upsert-outbound-inventory-audit.sql'),
		'utf-8'
	)

	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource,
		@InjectPinoLogger(InventoryAuditEntity.name) private readonly logger: PinoLogger,
		private readonly orderService: OrderService,
		private readonly i18nService: I18nService
	) {}

	public async getMonthlyInventoryAudit(month, factoryCode): Promise<IInventoryReportResponse> {
		const data = await this.dataSource.query<IInventoryReportQueryResult[]>(this.inventoryReportQuery, [
			month,
			factoryCode
		])
		return data.map((item) => {
			return {
				...item,
				detail: SuperJson.parse<IInventoryReportResponse[number]['detail']>(item.detail, 1)
			}
		})
	}

	@OnEvent('inventory.inbound')
	public async updateInboundInventory({ mo_no, sizes }: { mo_no: string; sizes: string[] }) {
		return await Array.fromAsync(sizes, async (size_numcode) => {
			const monthlyInboundQty = await this.getMonthlyInboundQty(mo_no, size_numcode)
			return await this.updateOneInventoryRecord(
				{
					mo_no,
					size_numcode,
					inv_type: InventoryType.FINISHED_GOOD,
					inv_year_month: format(new Date(), 'yyyyMM')
				},
				{
					instock_qty: monthlyInboundQty ?? 0,
					final_stock_qty: () =>
						/* SQL */ `inv_initialqty + inv_manualqty + ${monthlyInboundQty} - inv_ostotalqty - inv_manualqtyout`
				},
				{ exactMatch: false }
			)
		})
	}

	@OnEvent('inventory.outbound')
	public async updateOutboundInventory({ po, mo_no, sizes }: { po: string; mo_no: string; sizes: string[] }) {
		const payload = await this.getOutboundInventoryPayload(po, mo_no, sizes)

		return await Array.fromAsync(payload.sizes, async (size_numcode) => {
			return await this.dataSource
				.query(this.upsertOutboundInventory, [payload.po, payload.mo_no, size_numcode])
				.catch((e) => this.logger.error(e))
		})
	}

	private async getOutboundInventoryPayload(po: string, commandNumber: string, sizes: string[]) {
		const purchaseOrderInfo = await this.orderService.getPurchaseOrderSizeRun(po)

		const matchOrder = purchaseOrderInfo.filter(
			(item) => item.po === po && item.mo_no.split('-').at(0).trim() === commandNumber
		)

		if (matchOrder.length === 0) return

		const matchSizes = intersection(
			matchOrder.map((item) => item.size_numcode),
			sizes
		)

		if (matchSizes.length === 0) return

		return {
			po,
			mo_no: commandNumber,
			sizes: matchSizes
		}
	}

	public async bulkUpdateInventoryAudit(
		queries: UpdateInventoryReportQueryDTO,
		payload: Array<UpdateInventoryReportDTO[number] & Pick<UserEntity, 'user_code_updated' | 'user_name_updated'>>
	) {
		const queryRunner = this.dataSource.createQueryRunner()

		const nextYearMonth = addMonths(new Date(queries.inv_year_month), 1)
		await queryRunner.startTransaction()
		try {
			const updateResults = Array.fromAsync(payload, (data) => {
				return this.updateManyInventoryRecord({ ...queries, inv_next_month: nextYearMonth }, data)
			})
			await queryRunner.commitTransaction()
			return updateResults
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw error
		}
	}

	private async getFinalInventoryQuantity(
		queries: UpdateInventoryReportQueryDTO & { size_numcode: string }
	): Promise<number | null> {
		const result: Awaited<Promise<{ final_qty: number }>> = await this.dataSource
			.getRepository(InventoryAuditEntity)
			.createQueryBuilder()
			.select(
				/* SQL */ `COALESCE(inv_initialqty, 0) + COALESCE(inv_istotalqty, 0) - COALESCE(inv_ostotalqty, 0)`,
				'final_qty'
			)
			.where({
				size_numcode: queries.size_numcode,
				inv_type: queries.inv_type,
				mo_no: queries.mo_no,
				inv_year_month: format(new Date(queries.inv_year_month), 'yyyyMM')
			})
			.andWhere(
				new Brackets((qb) => {
					if (isEmpty(queries.po)) return qb.andWhere({ po: IsNull() })
					return qb.andWhere({ po: queries.po })
				})
			)
			.getRawOne()

		if (isNil(result)) return null
		return result.final_qty
	}

	private async updateManyInventoryRecord(
		queries: UpdateInventoryReportQueryDTO & { inv_next_month?: Date },
		data: UpdateInventoryReportDTO[number] & Pick<UserEntity, 'user_code_updated' | 'user_name_updated'>
	): Promise<UpdateResult[]> {
		const currFinalQty: Awaited<Promise<number | null>> = await this.getFinalInventoryQuantity({
			...queries,
			size_numcode: data.size_numcode
		})
		if (isNil(currFinalQty)) {
			return Array.from({ length: 2 }, () => ({
				generatedMaps: [],
				affected: 0,
				raw: undefined
			})) satisfies UpdateResult[]
		}
		const updateQuantity = currFinalQty + data.mn_ist_qty - data.mn_ost_qty
		return await Promise.all([
			this.updateOneInventoryRecord(
				{ ...queries, size_numcode: data.size_numcode, inv_year_month: format(queries.inv_year_month, 'yyyyMM') },
				{
					user_code_updated: data.user_code_updated,
					user_name_updated: data.user_name_updated,
					actual_instock_qty: data.mn_ist_qty,
					actual_outstock_qty: data.mn_ost_qty,
					final_stock_qty: updateQuantity
				}
			),
			this.updateOneInventoryRecord(
				{ ...queries, size_numcode: data.size_numcode, inv_year_month: format(queries.inv_next_month, 'yyyyMM') },
				{
					initial_stock_qty: updateQuantity,
					final_stock_qty: () => {
						return /* SQL */ `${updateQuantity} + inv_istotalqty + inv_manualqty - inv_ostotalqty - inv_manualqtyout`
					}
				}
			)
		])
	}

	private async updateOneInventoryRecord(
		queries: UpdateInventoryReportQueryDTO & { size_numcode: string },
		update: QueryDeepPartialEntity<InventoryAuditEntity>,
		options: { exactMatch?: boolean } = { exactMatch: true }
	) {
		const POSSIBLE_SIZE_PREFIXES = ['', '0', 'K', 'T']
		const sizeVariants = POSSIBLE_SIZE_PREFIXES.map((prefix) => `${prefix}${queries.size_numcode.replace(/^0/, '')}`)

		return await this.dataSource
			.getRepository(InventoryAuditEntity)
			.createQueryBuilder()
			.update()
			.set(update)
			.where({
				mo_no: queries.mo_no,
				inv_type: InventoryType.FINISHED_GOOD,
				inv_year_month: queries.inv_year_month,
				size_numcode: options.exactMatch ? queries.size_numcode : In(sizeVariants)
			})
			.andWhere(
				new Brackets((qb) => {
					if (isEmpty(queries.po) || isNil(queries.po)) return qb.andWhere({ po: IsNull() })
					return qb.andWhere({
						po: queries.po,
						outstock_qty: Not(Equal(0))
					})
				})
			)
			.execute()
	}

	public async getMonthlyInboundQty(commandNumber: string, sizeCode: string): Promise<number> {
		const [result] = await this.dataSource.query<Array<{ qty: number }>>(
			/* SQL */ `
				WITH CTE AS (
					SELECT DISTINCT EPC_Code, rfid_status
					FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
					WHERE isactive = 'Y'
						AND mo_no = @0
						AND size_code = @1
						AND RIGHT(stationNO, 3) = '101'
						AND rfid_status = 'A'
						AND record_time >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
						AND record_time < DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
					UNION
					SELECT DISTINCT EPC_Code, rfid_status
					FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
					WHERE isactive = 'Y'
						AND mo_no = @0
						AND size_code = @1
						AND RIGHT(stationNO, 3) = '101'
						AND rfid_status = 'A'
						AND record_time >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
						AND record_time < DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
				)
				SELECT 
					SUM(CASE WHEN rfid_status = 'A' THEN 1 ELSE -1 END) AS qty
				FROM CTE
			`,
			[commandNumber, sizeCode]
		)
		return result?.qty ?? 0
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
				key: 'total_instock_qty'
			},
			{
				header: this.i18nService.t('erp.fields.outbound_qty', { lang: currentLanguage }),
				key: 'total_outstock_qty'
			},
			{
				header: this.i18nService.t('erp.fields.actual_inventory_qty', { lang: currentLanguage }),
				key: 'actual_inv_qty'
			},
			{
				header: this.i18nService.t('erp.fields.final_inventory_qty', { lang: currentLanguage }),
				key: 'final_inv_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))

		const data = await this.getMonthlyInventoryAudit(format(new Date(month), 'yyyyMM'), factoryCode)

		// * Add data to worksheet
		const filteredData = data.filter(
			(item) =>
				(item.init_inv_qty > 0 ||
					item.total_instock_qty > 0 ||
					item.total_outstock_qty > 0 ||
					item.actual_inv_qty > 0 ||
					item.final_inv_qty > 0) &&
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
			for (const subRecord of record.detail) {
				const subRow = worksheet.addRow([])
				subRow.getCell(3).value = subRecord.size + '#'
				subRow.getCell(3).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
				}
				subRow.getCell(3).font = { bold: true }
				subRow.getCell(4).value = subRecord.initial_stock_qty
				subRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(5).value = subRecord.instock_qty
				subRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(6).value = subRecord.outstock_qty
				subRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				subRow.getCell(7).value = subRecord.final_stock_qty
				subRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
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

		return await workbook.xlsx.writeBuffer()
	}
}
