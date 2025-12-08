import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { applyCommonStyles, AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { SuperJson } from '@/common/utils'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DataSource } from 'typeorm'
import { DefectiveGoodsEntity } from '../entities/defective-goods.entity'
import { DefectiveGoodsInboundService } from './defective-inbound-report.service'

@Injectable()
export class DefectiveGoodsInventoryService {
	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		private readonly defectiveInboundService: DefectiveGoodsInboundService,
		private readonly i18nService: I18nService
	) {}

	public async getDefectiveGoodsInventory() {
		const storageListCommonTableExpression = this.defectiveInboundService.getStorageLocationsQuery({
			shouldCheckReturnInstructionStatus: true
		})

		return await this.dataSourceTNC
			.getRepository(DefectiveGoodsEntity)
			.createQueryBuilder('a')
			.addCommonTableExpression(storageListCommonTableExpression, 'storage_list_cte')
			.select('a.brand_name', 'brand_name')
			.addSelect('a.po', 'po')
			.addSelect('a.mo_no', 'mo_no')
			.addSelect('a.factory_shoes_style', 'factory_shoes_style')
			.addSelect('a.cust_shoes_style', 'cust_shoes_style')
			.addSelect('a.color_sn', 'color_sn')
			.addSelect('a.defective_category', 'defective_category')
			.addSelect('b.storage_location', 'storage_location')
			.addSelect(
				/* SQL */ `(
               SELECT aa.size_code AS size_numcode, COUNT(DISTINCT aa.epc) AS qty
               FROM DV_DATA_LAKE.dbo.dv_defective_goods aa
               WHERE 
						aa.epc LIKE 'E28%'
						AND aa.ri_cancel = 0
                  AND aa.brand_name = a.brand_name
                  AND aa.factory_shoes_style = a.factory_shoes_style 
                  AND aa.cust_shoes_style = a.cust_shoes_style 
                  AND COALESCE(aa.po, 'Unknown') = COALESCE(a.po, 'Unknown') 
                  AND COALESCE(aa.mo_no, 'Unknown') = COALESCE(a.mo_no, 'Unknown') 
                  AND aa.color_sn = a.color_sn
                  AND aa.defective_category = a.defective_category
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
               AND a.mo_no = b.mo_no 
               AND a.po = b.po
               AND a.defective_category = b.defective_category
            `
			)
			.where(/* SQL */ `a.epc LIKE 'E28%'`)
			.andWhere(/* SQL */ `a.ri_cancel = 0`)
			.andWhere(/* SQL */ `a.storage_location IS NOT NULL AND LTRIM(RTRIM(a.storage_location)) <> ''`)
			.groupBy('a.brand_name')
			.addGroupBy('a.po')
			.addGroupBy('a.mo_no')
			.addGroupBy('a.factory_shoes_style')
			.addGroupBy('a.cust_shoes_style')
			.addGroupBy('a.color_sn')
			.addGroupBy('a.defective_category')
			.addGroupBy('b.storage_location')
			.getRawMany<{
				brand_name: string
				po: string
				mo_no: string
				factory_shoes_style: string
				cust_shoes_style: string
				storage_location: string
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
		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.brand_name', { lang: currentLanguage }),
				key: 'brand_name'
			},
			{
				header: this.i18nService.t('erp.fields.po', { lang: currentLanguage }),
				key: 'po'
			},
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
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
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))
		const data = await this.getDefectiveGoodsInventory()

		for (const record of data) {
			const row = worksheet.addRow({
				...record,
				factory_code: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage })
			})
			row.height = 20
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
				}
			}
			for (const subRecord of record.size_data) {
				const row = worksheet.addRow([])
				row.alignment = { vertical: 'middle', horizontal: 'center' }
				row.getCell(2).value = subRecord.size_numcode + '#'
				row.getCell(2).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
				}
				row.getCell(3).value = subRecord.qty
				row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			}
		}

		// * Auto fit columns
		autoFitColumns.call(worksheet, {
			minWidth: 20,
			excludeColumns: []
		} satisfies AutoFitColumnOptions)

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).font = { bold: true, size: 14 }
		worksheet.getRow(1).height = 30
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.mergeCells('A1:H1')
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

		// * Freeze header row
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		applyCommonStyles.call(worksheet)

		return await workbook.xlsx.writeBuffer()
	}
}
