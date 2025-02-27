import { Inject, Injectable } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { format, parseISO } from 'date-fns'
import { Workbook } from 'exceljs'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { TENANCY_DATASOURCE } from '../tenancy/constants'
import { IInboundReport } from './interfaces'

@Injectable()
export class ReportService {
	constructor(
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource,
		@Inject(REQUEST) private readonly request: Request,
		private readonly i18nService: I18nService
	) {}

	async getInboundReportByDate(date: string): Promise<Partial<IInboundReport>[]> {
		const query = readFileSync(join(__dirname, './sql/inbound-report.sql'), 'utf-8').toString()
		const data = await this.dataSource.query<Partial<IInboundReport>[]>(query, [date])
		return await Promise.all(
			data.map(async (item) => {
				const sizeQtyDetails = await this.getInboundReportDetailByDate(item.mo_no, date)
				const totalInboundQty = sizeQtyDetails.reduce((acc, curr) => acc + curr.inbound_qty, 0)
				const missingQty = item.order_qty - totalInboundQty
				return {
					...item,
					total_inbound_qty: totalInboundQty,
					missing_qty: missingQty,
					size_run: sizeQtyDetails
				}
			})
		)
	}

	private async getInboundReportDetailByDate(commandNumber: string, date: string) {
		const query = readFileSync(join(__dirname, './sql/inbound-size-qty-report.sql'), 'utf-8').toString()
		return await this.dataSource.query<Array<{ size_numcode: string; inbound_qty: number }>>(query, [
			commandNumber,
			date
		])
	}

	async getOutboundReportByDate(date: string) {
		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.connect()
		const query = readFileSync(join(__dirname, './sql/outbound-report.sql'), 'utf-8').toString()
		return await queryRunner.manager.query(query, [date])
	}

	async exportDailyInboundToExcel(date: string) {
		const currentLanguage = I18nContext.current()?.lang
		const factoryCode = this.request.headers['x-user-company']
		const workbook = new Workbook()
		workbook.eachSheet((sheet) => {
			sheet.eachRow((row) => {
				row.eachCell((cell) => {
					cell.font = { name: 'Arial' }
				})
			})
		})
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
				header: this.i18nService.t('erp.fields.shaping_dept_name', { lang: currentLanguage }),
				key: 'shaping_dept_name'
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
				header: this.i18nService.t('erp.fields.accumulated_inbound_qty', { lang: currentLanguage }),
				key: 'accumulated_inbound_qty'
			},
			{
				header: this.i18nService.t('erp.fields.missing_qty', { lang: currentLanguage }),
				key: 'missing_qty'
			}
		]
		const data = await this.getInboundReportByDate(date)
		for (const record of data) {
			const row = worksheet.addRow(record)
			row.height = 20
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'deecf7' }
				}
			}
			const subrows = await this.getInboundReportDetailByDate(record.mo_no, date)
			for (const subRecord of subrows) {
				const row = worksheet.addRow([subRecord.size_numcode + '#', subRecord.inbound_qty])
				row.alignment = { vertical: 'middle', horizontal: 'center' }
				row.getCell(1).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'fff2cc' }
				}
				row.getCell(2).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'f2dcdb' }
				}
			}
		}
		worksheet.columns.forEach((sheetColumn) => {
			sheetColumn.font = {
				size: 12
			}
			sheetColumn.width = 30
		})
		worksheet.getRow(1).font = {
			bold: true,
			size: 13
		}
		worksheet.getRow(1).height = 20

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).height = 28
		worksheet.mergeCells('A1:I1')
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_inbound_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(date), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'e5e5e5' }
		}
		worksheet.getCell('A1').font = {
			bold: true,
			size: 16
		}
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.eachCell({ includeEmpty: true }, (cell) => {
				cell.border = {
					top: { style: 'thin' },
					left: { style: 'thin' },
					bottom: { style: 'thin' },
					right: { style: 'thin' }
				}
			})
		})
		return await workbook.xlsx.writeBuffer()
	}

	async exportDailyOutboundToExcel(date: string) {
		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()

		workbook.eachSheet((sheet) => {
			sheet.eachRow((row) => {
				row.eachCell((cell) => {
					cell.font = { name: 'Arial' }
				})
			})
		})

		const worksheet = workbook.addWorksheet(`Report ${format(parseISO(date), 'yyyy-MM-dd')}`)

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
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'order_qty'
			},
			{
				header: this.i18nService.t('erp.fields.outbound_qty', { lang: currentLanguage }),
				key: 'outbound_qty'
			},
			{
				header: this.i18nService.t('erp.fields.outbound_date', { lang: currentLanguage }),
				key: 'outbound_date'
			}
		]

		const data = await this.getOutboundReportByDate(date)

		data.forEach((record) => {
			worksheet.addRow(record)
		})
		worksheet.columns.forEach((sheetColumn) => {
			sheetColumn.font = {
				size: 12
			}
			sheetColumn.width = 30
		})
		worksheet.getRow(1).font = {
			bold: true,
			size: 13
		}
		worksheet.getRow(1).height = 20

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).height = 28
		worksheet.mergeCells('A1:F1')
		worksheet.getCell('A1').value = `Outbound Report - ${format(new Date(date), 'yyyy/MM/dd')}`
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'e5e5e5' }
		}
		worksheet.getCell('A1').font = {
			bold: true,
			size: 16
		}
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.eachCell({ includeEmpty: true }, (cell) => {
				cell.border = {
					top: { style: 'thin' },
					left: { style: 'thin' },
					bottom: { style: 'thin' },
					right: { style: 'thin' }
				}
			})
		})
		return await workbook.xlsx.writeBuffer()
	}

	/**
	 * @deprecated
	 */
	protected replaceChineseName(name: string) {
		return name.replace(/[\u4e00-\u9fa5]/g, '')
	}
}
