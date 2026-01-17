import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { applyCommonStyles, AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { omit } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DataSource, In, IsNull, Repository } from 'typeorm'
import { DefectiveGoodsOutboundPurpose } from '../constants'
import { UpdateOutboundStatusDTO } from '../dto/inoutbound.dto'
import { DefectiveGoodsEntity } from '../entities/defective-goods.entity'

@Injectable()
export class DefectiveGoodsOutboundService {
	constructor(
		@InjectRepository(DefectiveGoodsEntity, DATA_SOURCE_DATA_LAKE)
		private readonly defectiveGoodsRepository: Repository<DefectiveGoodsEntity>,
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		private readonly i18nService: I18nService
	) {}

	public async updateOutboundStatus({ epcs, ...update }: UpdateOutboundStatusDTO) {
		const existsNotInbounded = await this.defectiveGoodsRepository.existsBy({
			epc: In(epcs),
			ri_cancel: false,
			storage_location: IsNull(),
			inbound_date: IsNull()
		})

		if (existsNotInbounded) throw new ConflictException(this.i18nService.t('inoutbound.notification.not_inbound_yet'))

		return await this.defectiveGoodsRepository.update(
			{ epc: In(epcs) },
			{
				...omit(update, ['epcs']),
				ri_cancel: true,
				// ri_cancel: true,
				outbound_date: new Date()
			}
		)
	}

	public async getDailyOutboundReport(date: string) {
		return await this.dataSourceTNC
			.getRepository(DefectiveGoodsEntity)
			.createQueryBuilder('a')
			.select('a.brand_name', 'brand_name')
			.addSelect('a.po', 'po')
			.addSelect('a.mo_no', 'mo_no')
			.addSelect('a.factory_shoes_style', 'factory_shoes_style')
			.addSelect('a.cust_shoes_style', 'cust_shoes_style')
			.addSelect('a.color_sn', 'color_sn')
			.addSelect('a.sewing_line', 'sewing_line')
			.addSelect('a.assembly_line', 'assembly_line')
			.addSelect('a.defective_category', 'defective_category')
			.addSelect('a.outbound_purpose', 'outbound_purpose')
			.addSelect(
				/* SQL */ `
				SUM(
					CASE 
						WHEN a.unit = 'prs' AND a.defective_category = 'C' THEN 2
						ELSE 1
					END
				)`,
				'daily_outbound_qty'
			)
			.addSelect('a.shoe_source', 'shoe_source')
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
							aa.epc LIKE 'E28%' 
							AND aa.brand_name = a.brand_name
							AND aa.factory_shoes_style = a.factory_shoes_style 
							AND aa.cust_shoes_style = a.cust_shoes_style 
							AND COALESCE(aa.po, 'Unknown') = COALESCE(a.po, 'Unknown') 
							AND COALESCE(aa.mo_no, 'Unknown') = COALESCE(a.mo_no, 'Unknown') 
							AND aa.color_sn = a.color_sn
							AND aa.defective_category = a.defective_category
							AND aa.outbound_purpose = a.outbound_purpose
							AND CAST(aa.outbound_date AS DATE) = CAST('${date}' AS DATE)
						GROUP BY aa.size_code
						FOR JSON PATH
					)`,
				'size_data'
			)
			.where(/* SQL */ `a.epc LIKE 'E28%'`)
			.andWhere(/* SQL */ `a.storage_location IS NOT NULL`)
			.andWhere(/* SQL */ `LTRIM(RTRIM(a.storage_location)) <> ''`)
			.andWhere(/* SQL */ `a.inbound_date IS NOT NULL`)
			.andWhere(/* SQL */ `CAST(a.outbound_date AS DATE) = CAST(:outboundDate AS DATE)`)
			.groupBy('a.brand_name')
			.addGroupBy('a.po')
			.addGroupBy('a.mo_no')
			.addGroupBy('a.factory_shoes_style')
			.addGroupBy('a.cust_shoes_style')
			.addGroupBy('a.color_sn')
			.addGroupBy('a.sewing_line')
			.addGroupBy('a.assembly_line')
			.addGroupBy('a.defective_category')
			.addGroupBy('a.outbound_purpose')
			.addGroupBy('a.shoe_source')
			.setParameter('outboundDate', date)
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
				outbound_purpose: DefectiveGoodsOutboundPurpose
				daily_outbound_qty: number
			}>()
			.then((result) =>
				result.map((item) => ({
					...item,
					size_data: SuperJson.parse<Array<{ size_numcode: string; qty }>>(item.size_data, 1)
				}))
			)
	}

	async exportDailyOutboundToExcel(date: string, factoryCode: string) {
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
				header: this.i18nService.t('erp.fields.outbound_purpose', { lang: currentLanguage }),
				key: 'outbound_purpose'
			},
			{
				header: this.i18nService.t('erp.fields.daily_outbound_qty', { lang: currentLanguage }),
				key: 'daily_outbound_qty'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))
		const data = await this.getDailyOutboundReport(date)

		for (const record of data) {
			const row = worksheet.addRow({
				...record,
				defective_category: this.i18nService.t(`defective-goods.categories.${record.defective_category}`, {
					lang: currentLanguage
				}),
				outbound_purpose: this.i18nService.t(`inoutbound.outbound_purpose.${record.outbound_purpose}`, {
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
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.daily_defective_gooods_outbound_report', {
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
		worksheet.getCell(`K${footerRow.number}`).value = data.reduce((acc, curr) => acc + curr.daily_outbound_qty, 0)
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
