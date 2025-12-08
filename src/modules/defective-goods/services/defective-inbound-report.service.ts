import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { applyCommonStyles, AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DataSource, In, Repository } from 'typeorm'
import { UpdateInboundStatusDTO } from '../dto/inoutbound.dto'
import { DefectiveGoodsEntity } from '../entities/defective-goods.entity'

@Injectable()
export class DefectiveGoodsInboundService {
	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		@InjectRepository(DefectiveGoodsEntity, DATA_SOURCE_DATA_LAKE)
		private readonly defectiveGoodsRepository: Repository<DefectiveGoodsEntity>,
		private readonly i18nService: I18nService
	) {}

	public async updateInboundStatus(update: UpdateInboundStatusDTO) {
		return await this.defectiveGoodsRepository.update(
			{ epc: In(update.epcs), ri_cancel: false },
			{
				storage_location: update.storage_location,
				inbound_date: new Date()
			}
		)
	}

	public getStorageLocationsQuery({
		date,
		shouldCheckReturnInstructionStatus
	}: {
		date?: string
		shouldCheckReturnInstructionStatus: boolean
	}) {
		return this.dataSourceTNC
			.createQueryBuilder()
			.select([
				/* SQL */ `STRING_AGG(storage_location, ',') WITHIN GROUP (ORDER BY storage_location ASC) AS storage_location`,
				'brand_name',
				'po',
				'mo_no',
				'factory_shoes_style',
				'color_sn',
				'defective_category'
			])
			.from(
				(qb) =>
					qb
						.subQuery()
						.distinct()
						.select([
							'storage_location',
							'brand_name',
							'po',
							'mo_no',
							'factory_shoes_style',
							'color_sn',
							'defective_category'
						])
						.from(DefectiveGoodsEntity, 'a')
						.where(/* SQL */ `storage_location IS NOT NULL`)
						.andWhere(() => {
							if (!shouldCheckReturnInstructionStatus) return '1 = 1'
							return 'ri_cancel = 0'
						})
						.andWhere(
							() => (!date ? '1 = 1' : /* SQL */ `CAST(inbound_date AS DATE) = CAST(:inboundDate AS DATE)`),
							{ inboundDate: date }
						),
				'a'
			)
			.groupBy('brand_name')
			.addGroupBy('po')
			.addGroupBy('mo_no')
			.addGroupBy('factory_shoes_style')
			.addGroupBy('color_sn')
			.addGroupBy('defective_category')
			.getQuery()
	}

	public async getDailyInboundReport(date: string) {
		const storageListCommonTableExpression = this.getStorageLocationsQuery({
			shouldCheckReturnInstructionStatus: false,
			date: date
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
			.addSelect('a.sewing_line', 'sewing_line')
			.addSelect('a.assembly_line', 'assembly_line')
			.addSelect('a.defective_category', 'defective_category')
			.addSelect('b.storage_location', 'storage_location')
			.addSelect('COUNT(DISTINCT a.epc)', 'daily_inbound_qty')
			.addSelect(
				/* SQL */ `(
               SELECT aa.size_code AS size_numcode, COUNT(DISTINCT aa.epc) AS qty
               FROM DV_DATA_LAKE.dbo.dv_defective_goods aa
               WHERE aa.brand_name = a.brand_name
                  AND aa.factory_shoes_style = a.factory_shoes_style 
                  AND aa.cust_shoes_style = a.cust_shoes_style 
                  AND COALESCE(aa.po, 'Unknown') = COALESCE(a.po, 'Unknown') 
                  AND COALESCE(aa.mo_no, 'Unknown') = COALESCE(a.mo_no, 'Unknown') 
                  AND aa.color_sn = a.color_sn
                  AND aa.defective_category = a.defective_category
						AND CAST(aa.inbound_date AS DATE) = CAST('${date}' AS DATE)
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
			.where(/* SQL */ `a.storage_location IS NOT NULL AND LTRIM(RTRIM(a.storage_location)) <> ''`)
			.andWhere(/* SQL */ `CAST(a.inbound_date AS DATE) = CAST(:inboundDate AS DATE)`)
			.groupBy('a.brand_name')
			.addGroupBy('a.po')
			.addGroupBy('a.mo_no')
			.addGroupBy('a.factory_shoes_style')
			.addGroupBy('a.cust_shoes_style')
			.addGroupBy('a.color_sn')
			.addGroupBy('a.sewing_line')
			.addGroupBy('a.assembly_line')
			.addGroupBy('a.defective_category')
			.addGroupBy('b.storage_location')
			.setParameter('inboundDate', date)
			.getRawMany<{
				brand_name: string
				po: string
				mo_no: string
				cust_shoes_style: string
				factory_shoes_style: string
				color_sn: string
				size_data: string
				sewing_line: string
				assembly_line: string
				defective_category: string
				storage_location: string
				daily_inbound_qty: number
			}>()
			.then((result) =>
				result.map((item) => ({
					...item,
					size_data: SuperJson.parse<Array<{ size_numcode: string; qty }>>(item.size_data, 1)
				}))
			)
	}

	async exportDailyInboundToExcel(date: string, factoryCode: string) {
		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(
			this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) +
				' - ' +
				format(new Date(date), 'yyyy-MM-dd')
		)
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
				header: this.i18nService.t('erp.fields.sewing_line', { lang: currentLanguage }),
				key: 'sewing_line'
			},
			{
				header: this.i18nService.t('erp.fields.assembly_line', { lang: currentLanguage }),
				key: 'assembly_line'
			},
			{
				header: this.i18nService.t('erp.fields.category', { lang: currentLanguage }),
				key: 'defective_category'
			},
			{
				header: this.i18nService.t('warehouse.fields.storage_name', { lang: currentLanguage }),
				key: 'storage_location'
			},
			{
				header: this.i18nService.t('erp.fields.daily_inbound_qty', { lang: currentLanguage }),
				key: 'daily_inbound_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))
		const data = await this.getDailyInboundReport(date)

		for (const record of data) {
			const row = worksheet.addRow({
				...record,
				defective_category: this.i18nService.t(`defective-goods.categories.${record.defective_category}`, {
					lang: currentLanguage
				})
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
			excludeColumns: ['shaping_dept_name', 'storage']
		} satisfies AutoFitColumnOptions)

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).font = { bold: true, size: 14 }
		worksheet.getRow(1).height = 30
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.mergeCells('A1:K1')
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').font = { bold: true, size: 16 }
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_defective_gooods_inbound_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(date), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})

		const footerRow = worksheet.addRow(Array.from({ length: worksheet.columns.length }, () => null))
		footerRow.height = 30
		worksheet.mergeCells(`A${footerRow.number}:J${footerRow.number}`)
		worksheet.getCell(`A${footerRow.number}`).value = this.i18nService.t('erp.fields.total_daily_productivity', {
			lang: currentLanguage
		})
		worksheet.getCell(`K${footerRow.number}`).value = data.reduce((acc, curr) => acc + curr.daily_inbound_qty, 0)
		worksheet.getCell(`K${footerRow.number}`).style = {
			font: { color: { argb: ExcelColorPalette.DESTRUCTIVE_FOREGROUND } }
		}
		footerRow.eachCell((cell) => {
			cell.font = { bold: true, size: 14 }
			cell.style.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
			}
		})

		// * Freeze header row at top
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		applyCommonStyles.call(worksheet)

		return await workbook.xlsx.writeBuffer()
	}
}
