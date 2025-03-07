import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { TENANCY_DATASOURCE } from '../tenancy/constants'
import { IInboundReport, IOutboundReport, IReport } from './interfaces'

@Injectable()
export class ReportService {
	private readonly inboundReportQuery: string = readFileSync(join(__dirname, './sql/inbound-report.sql'), 'utf-8')
	private readonly inboundSizeQtyQuery: string = readFileSync(
		join(__dirname, './sql/inbound-size-qty-report.sql'),
		'utf-8'
	)

	private readonly outboundReportQuery: string = readFileSync(join(__dirname, './sql/outbound-report.sql'), 'utf-8')
	private readonly outboundSizeQtyQuery: string = readFileSync(
		join(__dirname, './sql/outbound-size-qty-report.sql'),
		'utf-8'
	)

	constructor(
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource,
		@Inject(REQUEST) private readonly request: Request,
		private readonly i18nService: I18nService
	) {}

	public async getInboundReportByDate(date: string) {
		const data = await this.dataSource.query<Partial<IInboundReport>[]>(this.inboundReportQuery, [date])
		return await Promise.all(
			data.map(async (item) => {
				const sizeQtyDetails = await this.getInboundReportDetailByDate(item.mo_no, item.factory_code, date)
				return {
					...item,
					size_run: sizeQtyDetails
				}
			})
		)
	}

	public async getOutboundReportByDate(date: string) {
		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.connect()
		const data = await queryRunner.manager.query<Partial<IOutboundReport>[]>(this.outboundReportQuery, [date])
		return await Promise.all(
			data.map(async (item) => {
				const sizeQtyDetails = await this.getOutboundReportDetailByDate(item.mo_no, item.factory_code, date)
				return {
					...item,
					size_run: sizeQtyDetails
				}
			})
		)
	}

	private async getInboundReportDetailByDate(commandNumber: string, factoryCode: string, date: string) {
		return await this.dataSource.query<IReport['size_run']>(this.inboundSizeQtyQuery, [
			commandNumber,
			factoryCode,
			date
		])
	}

	private async getOutboundReportDetailByDate(commandNumber: string, factoryCode: string, date: string) {
		return await this.dataSource.query<IReport['size_run']>(this.outboundSizeQtyQuery, [
			commandNumber,
			factoryCode,
			date
		])
	}

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
			const subrows = await this.getInboundReportDetailByDate(record.mo_no, record.factory_code, date)
			for (const subRecord of subrows) {
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
			const subRecords = await this.getOutboundReportDetailByDate(record.mo_no, record.factory_code, date)
			for (const _record of subRecords) {
				const subRow = worksheet.addRow([])
				subRow.getCell(2).value = _record.size_numcode + '#'
				subRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff2cc' } }
				subRow.getCell(3).value = _record.qty
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
}
