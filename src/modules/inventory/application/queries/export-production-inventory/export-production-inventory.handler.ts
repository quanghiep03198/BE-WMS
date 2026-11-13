import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { FactoryAgencyCode } from '@common/constants/factory'
import { AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { QueryHandler } from '@nestjs/cqrs'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import {
	IProductionInventoryRepository,
	PRODUCTION_INVENTORY_REPOSITORY
} from '../../ports/production-inventory.repository.port'
import { ExportProductionInventoryQuery } from './export-production-inventory.query'

@QueryHandler(ExportProductionInventoryQuery)
export class ExportProductionInventoryHandler {
	constructor(
		@Inject(PRODUCTION_INVENTORY_REPOSITORY)
		private readonly repository: IProductionInventoryRepository,
		private readonly i18nService: I18nService,
		private readonly configService: ConfigService<ProcessEnv>
	) {}

	async execute(query: ExportProductionInventoryQuery) {
		const data = await this.repository.getInstockManufacturingOrders(query)
		const factory = this.configService.get<FactoryCode>('APP_TENANCY')
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(format(new Date(), 'yyyy-MM-dd'))
		const currentLanguage = I18nContext.current()?.lang
		const factoryAgency: string = FactoryAgencyCode[factory]

		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'shoes_style'
			},
			{
				header: this.i18nService.t('erp.fields.color_sn', { lang: currentLanguage }),
				key: 'color'
			},
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
			},
			{
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'mo_qty'
			},
			{
				header: this.i18nService.t('erp.fields.actual_inventory_qty', { lang: currentLanguage }),
				key: 'total_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))

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

			for (const subRecord of record.size_ledger) {
				const subRow = worksheet.addRow([])
				subRow.getCell(4).value = subRecord.size_numcode + '#'
				subRow.getCell(4).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
				}
				subRow.getCell(4).font = { bold: true }
				subRow.getCell(5).value = subRecord.qty
				subRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			}
		}

		// * Auto-fit columns
		autoFitColumns.call(worksheet, { minWidth: 10 } satisfies AutoFitColumnOptions)

		// * Add header title
		worksheet.insertRow(1, null)
		worksheet.mergeCells('A1:E1')
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
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.production_inventory_summary', {
			args: { factory: factoryAgency },
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

		// * Write file buffer
		return await workbook.xlsx.writeBuffer()
	}
}
