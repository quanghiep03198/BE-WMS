import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { applyCommonStyles, AutoFitColumnOptions, autoFitColumns, getLastColumnLetter } from '@common/helpers'
import { SuperJson } from '@common/utils'
import { TENANCY_DATA_SOURCE } from '@modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { Workbook } from 'exceljs'
import { omit } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DataSource } from 'typeorm'
import { DefectiveCategory, DefectiveGoodsSource, FALLBACK_PURCHASE_ORDER } from '../constants'
import { DefectiveGoodsEntity } from '../entities/defective-goods.entity'
import { DefectiveGoodsInboundService } from './defective-inbound.service'

@Injectable()
export class DefectiveGoodsInventoryService {
	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		private readonly defectiveInboundService: DefectiveGoodsInboundService,
		private readonly i18nService: I18nService
	) {}

	public async getDefectiveGoodsInventory() {
		const storageListCommonTableExpression = this.defectiveInboundService.getStorageLocationsQuery({
			shouldCheckReturnInstructionStatus: false
		})

		return await this.dataSourceTNC
			.getRepository(DefectiveGoodsEntity)
			.createQueryBuilder('a')
			.addCommonTableExpression(storageListCommonTableExpression, 'storage_list_cte')
			.select('a.brand_name', 'brand_name')
			.addSelect(`ISNULL(IIF(a.po = '', :fallbackPurchaseOrder, a.po), :fallbackPurchaseOrder)`, 'po')
			.addSelect('a.mo_no', 'mo_no')
			.addSelect('a.factory_shoes_style', 'factory_shoes_style')
			.addSelect('a.cust_shoes_style', 'cust_shoes_style')
			.addSelect('a.color_sn', 'color_sn')
			.addSelect('a.defective_category', 'defective_category')
			.addSelect('a.shoe_source', 'shoe_source')
			.addSelect('b.storage_location', 'storage_location')
			.addSelect(
				/* SQL */ `(
               SELECT 
                  aa.size_code AS size_numcode, 
                  SUM(
                     CASE 
                        WHEN aa.unit = 'prs' AND aa.defective_category = 'C' THEN 2
                        ELSE 1
                     END
                  ) AS qty
               FROM DV_DATA_LAKE.dbo.dv_defective_goods aa
               WHERE 
						aa.ri_cancel = 0
						AND aa.storage_location IS NOT NULL AND LTRIM(RTRIM(aa.storage_location)) <> ''
                  AND aa.brand_name = a.brand_name
                  AND aa.factory_shoes_style = a.factory_shoes_style 
                  AND aa.cust_shoes_style = a.cust_shoes_style 
                  AND COALESCE(aa.po, 'Unknown') = COALESCE(a.po, 'Unknown') 
                  AND COALESCE(aa.mo_no, 'Unknown') = COALESCE(a.mo_no, 'Unknown') 
                  AND aa.color_sn = a.color_sn
                  AND aa.defective_category = a.defective_category
						AND aa.shoe_source = a.shoe_source
               GROUP BY aa.size_code
               FOR JSON PATH
            )`,
				'size_data'
			)
			.leftJoin(
				(qb) => qb.subQuery().select('*').from('storage_list_cte', 'b'),
				'b',
				/* SQL */ `
               a.brand_name = b.brand_name 
               AND a.factory_shoes_style = b.factory_shoes_style 
               AND a.color_sn = b.color_sn 
               AND ISNULL(a.mo_no, :fallbackPurchaseOrder) = ISNULL(b.mo_no, :fallbackPurchaseOrder)
               AND ISNULL(a.po, :fallbackPurchaseOrder) = ISNULL(b.po, :fallbackPurchaseOrder)
               AND a.defective_category = b.defective_category
               AND a.shoe_source = b.shoe_source
            `
			)
			.where(/* SQL */ `a.ri_cancel = 0`)
			.andWhere(/* SQL */ `a.storage_location IS NOT NULL AND LTRIM(RTRIM(a.storage_location)) <> ''`)
			.groupBy('a.brand_name')
			.addGroupBy('a.po')
			.addGroupBy('a.mo_no')
			.addGroupBy('a.factory_shoes_style')
			.addGroupBy('a.cust_shoes_style')
			.addGroupBy('a.color_sn')
			.addGroupBy('a.defective_category')
			.addGroupBy('a.shoe_source')
			.addGroupBy('b.storage_location')
			.setParameter('fallbackPurchaseOrder', FALLBACK_PURCHASE_ORDER)
			.getRawMany<{
				brand_name: string
				po: string
				mo_no: string
				defective_category: DefectiveCategory
				factory_shoes_style: string
				cust_shoes_style: string
				storage_location: string
				shoe_source: DefectiveGoodsSource
				color_sn: string
				size_data: string
			}>()
			.then((result) =>
				result.map((item) => ({
					...item,
					size_data: SuperJson.parse<Array<{ size_numcode: string; qty }>>(item.size_data, 1)
				}))
			)
	}

	public async exportDefectiveGoodsInventory(factoryCode: string) {
		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }))

		const data = await this.getDefectiveGoodsInventory()

		const distinctSizes = Array.from(
			new Set(data.flatMap((item) => item.size_data.map((size) => size.size_numcode.replace(/^0/, '') + '#')))
		).sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))

		const pivotData = data.map((item) => {
			const _item = omit(item, ['size_data'])
			const sizes: { [key: string]: number | undefined } = {}
			distinctSizes.forEach((size) => {
				sizes[size] = item.size_data.find((i) => i.size_numcode.replace(/^0/, '') + '#' === size)?.qty
			})
			const combined = {
				..._item,
				...sizes,
				defective_category: this.i18nService.t(`defective-goods.categories.${item.defective_category}`, {
					lang: currentLanguage
				}),
				total: item.size_data.reduce((acc, curr) => acc + curr.qty, 0),
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
