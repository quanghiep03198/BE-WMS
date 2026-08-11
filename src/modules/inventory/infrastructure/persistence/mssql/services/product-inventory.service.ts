import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { type AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { SuperJson } from '@common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { FactoryAgencyCode } from '@modules/department/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DataSource } from 'typeorm'
import { type ProductInventoryReportQueryDTO } from '../../../../presentation/dto/inventory-report.dto'
import { InboundInventoryEntity } from '../entities/inbound-inventory.view.entity'
import { OutboundEstimationEntity } from '../entities/outbound-inventory.view.entity'
import { ProductInventoryReportEntity } from '../entities/product-inventory.view.entity'
import { SizeInventoryEntity } from '../entities/size-inventory.view.entity'
import productionFeaturesQuery from '../sql/production-features.sql'
import productionInboundQuery from '../sql/production-inbound.sql'
import productionOutboundQuery from '../sql/production-outbound.sql'

@Injectable()
export class ProductionInventoryService {
	private readonly productionFeaturesQuery: string = productionFeaturesQuery
	private readonly productionInboundQuery: string = productionInboundQuery
	private readonly productionOutboundQuery: string = productionOutboundQuery

	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		private readonly i18nService: I18nService
	) {}

	public async getProductInventory(queries: ProductInventoryReportQueryDTO): Promise<{
		sizes: SizeInventoryEntity[]
		inbound: InboundInventoryEntity[]
		outbound: OutboundEstimationEntity[]
	}> {
		const [productSizeInventory, inboundInventory, outboundInventory] = await Promise.all([
			this.dataSourceDL.getRepository(SizeInventoryEntity).findBy({
				shoes_style: queries['shoes_style:eq'],
				color: queries['color:eq'],
				brand_name: queries['brand_name:eq']
			}),
			this.dataSourceDL.query(this.productionInboundQuery, [
				queries['brand_name:eq'],
				queries['shoes_style:eq'],
				queries['color:eq']
			]),
			this.dataSourceDL.query(this.productionOutboundQuery, [
				queries['brand_name:eq'],
				queries['shoes_style:eq'],
				queries['color:eq']
			])
		])

		return {
			sizes: productSizeInventory,
			inbound: inboundInventory.map((item) => ({
				...item,
				inv_sizes: SuperJson.isValid(item.inv_sizes) ? SuperJson.parse(item.inv_sizes) : []
			})),
			outbound: outboundInventory.map((item) => ({
				...item,
				inv_sizes: SuperJson.isValid(item.inv_sizes) ? SuperJson.parse(item.inv_sizes) : []
			}))
		}
	}

	public async getProductionInventoryFeatures() {
		const results = await this.dataSourceDL.query<Array<{ brand_name: string; product_variants: string }>>(
			this.productionFeaturesQuery
		)
		return results.map((item) => ({
			brand_name: item.brand_name,
			product_variants: SuperJson.parse<
				Array<{
					shoes_style: string
					colors: Record<'color', string>[]
				}>
			>(item.product_variants)
		}))
	}

	public async exportProductionInventorySummary(factory: string) {
		const currentLanguage = I18nContext.current()?.lang
		const factoryAgency: string = FactoryAgencyCode[factory]
		const data = await this.dataSourceDL.getRepository(ProductInventoryReportEntity).find()
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(format(new Date(), 'yyyy-MM-dd'))

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
				header: this.i18nService.t('erp.fields.mo_qty', { lang: currentLanguage }),
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

			for (const subRecord of record.inv_sizes) {
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
