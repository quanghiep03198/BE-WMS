import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { TENANCY_DATASOURCE } from '../tenancy/constants'
import {
	IInboundReportQueryResult,
	IInboundReportResponse,
	IInventoryReportQueryResult,
	IInventoryReportResponse,
	IOutboundReportQueryResult,
	IOutboundReportResponse
} from './interfaces'

@Injectable()
export class ReportService {
	private readonly inboundReportQuery: string = readFileSync(join(__dirname, './sql/inbound-report.sql'), 'utf-8')
	private readonly outboundReportQuery: string = readFileSync(join(__dirname, './sql/outbound-report.sql'), 'utf-8')
	private readonly inventoryReportQuery: string = readFileSync(join(__dirname, './sql/inventory-report.sql'), 'utf-8')
	private readonly packingReportQuery: string = readFileSync(join(__dirname, './sql/packing-report.sql'), 'utf-8')

	constructor(
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource,
		@Inject(REQUEST) private readonly request: Request,
		private readonly i18nService: I18nService
	) {}

	public async getInboundReportByDate(date: string): Promise<IInboundReportResponse> {
		const data = await this.dataSource.query<IInboundReportQueryResult[]>(this.inboundReportQuery, [date])
		return data.map((item) => ({
			...item,
			size_data: JSON.parse(item.size_data)
		}))
	}

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

	public async getMonthlyInventoryReport(month): Promise<IInventoryReportResponse> {
		const data = await this.dataSource.query<IInventoryReportQueryResult[]>(this.inventoryReportQuery, [month])
		return data.map((item) => {
			return {
				...item,
				size_data: JSON.parse(item.size_data)
			}
		})
	}

	public async getDailyPackingReport(date: string) {
		return await this.dataSource.query(this.packingReportQuery, [date])
	}

	// #region Inbound report Excel
	async exportDailyInboundToExcel(date: string) {
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
				header: this.i18nService.t('factory.factory', { lang: currentLanguage }),
				key: 'factory_code'
			},
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
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
		const data = await this.getInboundReportByDate(date)

		for (const record of data) {
			const row = worksheet.addRow({
				...record,
				factory_code: this.i18nService.t(`factory.${record.factory_code}`, { lang: currentLanguage })
			})
			row.height = 20
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'deecf7' } }
			}
			for (const subRecord of record.size_data) {
				const row = worksheet.addRow([])
				row.alignment = { vertical: 'middle', horizontal: 'center' }
				row.getCell(2).value = subRecord.size_numcode + '#'
				row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
				row.getCell(3).value = subRecord.qty
				row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
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
		worksheet.mergeCells('A1:J1')
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_inbound_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(date), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
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

	// #region Inventory report Excel
	async exportMonthlyInventoryToExcel(month: string) {
		const currentLanguage = I18nContext.current()?.lang
		const factoryCode = this.request.headers['x-user-company']
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
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'shoes_style_code_factory'
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
				header: this.i18nService.t('erp.fields.final_inventory_qty', { lang: currentLanguage }),
				key: 'final_inv_qty'
			},
			{
				header: this.i18nService.t('erp.fields.actual_inventory_qty', { lang: currentLanguage }),
				key: 'actual_inv_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))

		const data = await this.getMonthlyInventoryReport(format(new Date(month), 'yyyyMM'))

		for (const record of data) {
			const row = worksheet.addRow(record)
			row.height = 20
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'deecf7' } }
			}
			// const subrows = await this.getMonthlyInventoryReport(record.mo_no, record.factory_code, month)
			for (const subRecord of record.size_data) {
				const row = worksheet.addRow([])
				row.alignment = { vertical: 'middle', horizontal: 'center' }
				worksheet.mergeCells(`B${row.number}:C${row.number}`)
				row.getCell(2).value = subRecord.size_numcode + '#'
				row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
				row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
				row.getCell(4).value = subRecord.init_inv_qty
				row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				row.getCell(5).value = subRecord.instock_qty
				row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				row.getCell(6).value = subRecord.outstock_qty
				row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
				row.getCell(7).value = subRecord.final_inv_qty
				row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
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
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.file_monthly_inventory_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				month: format(new Date(month), 'yyyy-MM')
			},
			lang: currentLanguage
		})
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
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
}
