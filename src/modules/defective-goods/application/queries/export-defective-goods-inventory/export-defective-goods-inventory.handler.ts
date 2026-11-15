import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { applyCommonStyles, AutoFitColumnOptions, autoFitColumns, getLastColumnLetter } from '@common/helpers'
import { DefectiveCategory, DefectiveGoodsSource } from '@modules/defective-goods/domain/constants'
import { Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { Workbook } from 'exceljs'
import omit from 'lodash/omit'
import { I18nContext, I18nService } from 'nestjs-i18n'
import {
	DEFECTIVE_GOODS_REPORT_REPOSITORY,
	IDefectiveGoodsReportRepository
} from '../../ports/defective-goods-report.repository.port'
import { ExportDefectiveGoodsInventoryQuery } from './export-defective-goods-inventory.query'

@QueryHandler(ExportDefectiveGoodsInventoryQuery)
export class ExportDefectiveGoodsInventoryHandler implements IQueryHandler<ExportDefectiveGoodsInventoryQuery> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPORT_REPOSITORY)
		private readonly defectiveGoodsReportRepository: IDefectiveGoodsReportRepository,
		private readonly configService: ConfigService<ProcessEnv>,
		private readonly i18nService: I18nService
	) {}
	async execute() {
		const factoryCode = this.configService.get<FactoryCode>('APP_TENANCY')
		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }))

		const data = await this.defectiveGoodsReportRepository.getInventoryReport()

		const distinctSizes = Array.from(
			new Set(data.flatMap((item) => item.size_ledger.map((size) => size.size_numcode.replace(/^0/, '') + '#')))
		).sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))

		const pivotData = data.map((item) => {
			const _item = omit(item, ['size_ledger'])
			const sizes: { [key: string]: number | undefined } = {}
			distinctSizes.forEach((size) => {
				sizes[size] = item.size_ledger.find((i) => i.size_numcode.replace(/^0/, '') + '#' === size)?.qty
			})
			const combined = {
				..._item,
				...sizes,
				defective_category: this.i18nService.t(`defective-goods.categories.${item.defective_category}`, {
					lang: currentLanguage
				}),
				total: item.size_ledger.reduce((acc, curr) => acc + curr.qty, 0),
				po: item.po ? item.po.toUpperCase() : ''
			}
			return Object.fromEntries(
				Object.entries(combined).sort((a, b) =>
					a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })
				)
			) as {
				brand_name: string
				po: string
				mo_no: string
				defective_category: DefectiveCategory
				factory_shoes_style: string
				cust_shoes_style: string
				storage_location: string
				shoe_source: DefectiveGoodsSource
				color_sn: string
				[key: `${number}#`]: number | undefined
			}
		})

		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.brand_name', { lang: currentLanguage }),
				key: 'brand_name',
				width: 15
			},
			{
				header: this.i18nService.t('erp.fields.po', { lang: currentLanguage }),
				key: 'po',
				width: 15
			},
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no',
				width: 15
			},
			{
				header: this.i18nService.t('erp.fields.cust_shoes_style', { lang: currentLanguage }),
				key: 'cust_shoes_style'
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
				header: this.i18nService.t('erp.fields.category', { lang: currentLanguage }),
				key: 'defective_category'
			},
			{
				header: this.i18nService.t('warehouse.fields.storage_name', { lang: currentLanguage }),
				key: 'storage_location'
			},
			...distinctSizes.map((size) => ({
				header: size,
				key: size,
				width: 6
			})),
			{
				header: this.i18nService.t('common.fields.total', { lang: currentLanguage }),
				key: 'total'
			}
		]

		for (const record of pivotData) {
			const row = worksheet.addRow({
				...record,

				factory_code: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage })
			})
			row.height = 20
			row.alignment = { vertical: 'middle', horizontal: 'center' }
		}

		// * Auto fit columns
		autoFitColumns.call(worksheet, {
			minWidth: 5,
			excludeColumns: [...distinctSizes]
		} satisfies AutoFitColumnOptions)

		const lastColumnLetter = getLastColumnLetter(worksheet.columns.length)
		const secondLastColumnLetter = getLastColumnLetter(worksheet.columns.length - 1)

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).font = { bold: true, size: 14 }
		worksheet.getRow(1).height = 30
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.mergeCells(`A1:${lastColumnLetter}1`)
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').font = { bold: true, size: 16 }
		worksheet.getCell('A1').value = this.i18nService.t('defective-goods.defective_goods_inventory_report', {
			lang: currentLanguage
		})

		// * Auto filter
		worksheet.autoFilter = `A2:D${2 + pivotData.length}`

		// * Summary rows
		const summaryRow = worksheet.addRow(Array.from({ length: worksheet.columnCount }, () => null))
		summaryRow.height = 24
		worksheet.mergeCells(`A${summaryRow.number}:${secondLastColumnLetter}${summaryRow.number}`)
		summaryRow.getCell(worksheet.columnCount - 1).value = this.i18nService.t('common.fields.total')
		summaryRow.getCell(worksheet.columnCount).value = {
			formula: `SUM(${lastColumnLetter}3:${lastColumnLetter}${summaryRow.number - 1})`
		}
		summaryRow.eachCell((cell) => {
			cell.font = {
				size: 12,
				bold: true
			}
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
			}
		})

		// * Freeze header row
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		applyCommonStyles.call(worksheet)

		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }

		return await workbook.xlsx.writeBuffer()
	}
}
