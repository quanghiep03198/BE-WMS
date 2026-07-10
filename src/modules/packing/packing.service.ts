import { Languages } from '@common/constants'
import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { type AutoFitColumnOptions, autoFitColumns, getLastColumnLetter } from '@common/helpers'
import { CENTRAL_DATA_SOURCE } from '@databases/constants'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { format } from 'date-fns'
import { Workbook, Worksheet } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { Brackets, DataSource } from 'typeorm'
import { BulkUpdatePackingWeightDTO, UpdatePackingWeightDTO } from './dto/update-packing.dto'
import { PackingEntity } from './entities/packing.entity'
import packingManifestQuery from './sql/packing-manifest.sql'

@Injectable()
export class PackingService {
	private readonly packingManifestQuery: string = packingManifestQuery

	constructor(
		@Inject(CENTRAL_DATA_SOURCE) private readonly dataSource: DataSource,
		private readonly i18nService: I18nService,
		private readonly configService: ConfigService
	) {}

	private extractSeriesNumber(seriesNumber: string) {
		return seriesNumber.slice(11, -1)
	}

	async getPackingWeightList(scanId?: string) {
		return await this.dataSource
			.getRepository(PackingEntity)
			.createQueryBuilder('p')
			.select('p.Scan_id', 'scan_id')
			.addSelect('p.Weight', 'weight')
			.where(
				new Brackets((qb) => {
					if (scanId) {
						return qb.where('series_number = :series_number', { series_number: this.extractSeriesNumber(scanId) })
					} else return qb
				})
			)
			.getRawMany()
	}

	async getOneByScanId(scanId: string) {
		const data = await this.dataSource
			.getRepository(PackingEntity)
			.findOneBy({ series_number: this.extractSeriesNumber(scanId) })
		if (!data) throw new NotFoundException('Packing item not found')
		return data
	}

	async updatePackingWeight(seriesNumber: string, payload: UpdatePackingWeightDTO) {
		return await this.dataSource
			.getRepository(PackingEntity)
			.update(
				{ series_number: this.extractSeriesNumber(seriesNumber) },
				{ actual_weight_in: payload.Actual_weight_in, weighing_time: new Date() }
			)
	}

	async bulkUpdatePackingWeight({
		po,
		size,
		actual_weight_in,
		user_name_updated,
		user_code_updated
	}: BulkUpdatePackingWeightDTO & Pick<PackingEntity, 'user_name_updated' | 'user_code_updated'>) {
		return await this.dataSource.getRepository(PackingEntity).update(
			{ po, size },
			{
				actual_weight_in,
				user_name_updated,
				user_code_updated,
				weighing_time: new Date(),
				remark: 'Manually updated'
			}
		)
	}

	async getPackingManifest(factoryCode: string) {
		return await this.dataSource.query<
			Array<{
				po: string
				brand_name: string
				shoes_style: string
				color: string
				size_data: string
				factory_code_produce: string
				standard_weight: number
				actual_weight: number
				target_box_qty: number
				target_item_qty: number
				weighed_box_qty: number
				unweighed_box_qty: number
			}>
		>(this.packingManifestQuery, [factoryCode])
	}

	async exportPackingManifestToExcel(factoryCode: string) {
		const currentLanguage = I18nContext.current()?.lang || this.configService.get<Languages>('FALLBACK_LANGUAGE')

		// Create workbook and worksheet
		const workbook = new Workbook()
		const worksheet: Worksheet = workbook.addWorksheet(
			this.i18nService.t('packing.titles.manifest_report', {
				args: { factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }) },
				lang: currentLanguage
			})
		)

		// Define columns
		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.po', { lang: currentLanguage }),
				key: 'po'
			},
			{
				header: this.i18nService.t('erp.fields.brand_name', { lang: currentLanguage }),
				key: 'brand_name'
			},
			{
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'shoes_style'
			},
			{
				header: this.i18nService.t('erp.fields.color_sn', { lang: currentLanguage }),
				key: 'color'
			},
			{
				header: this.i18nService.t('erp.fields.size', { lang: currentLanguage }),
				key: 'size_data'
			},
			{
				header: this.i18nService.t('packing.fields.standard_weight', { lang: currentLanguage }),
				key: 'standard_weight',
				alignment: { vertical: 'middle', horizontal: 'right' }
			},
			{
				header: this.i18nService.t('packing.fields.actual_avg_weight', { lang: currentLanguage }),
				key: 'actual_avg_weight',
				alignment: { vertical: 'middle', horizontal: 'right' }
			},
			{
				header: this.i18nService.t('packing.fields.target_box_qty', { lang: currentLanguage }),
				key: 'target_box_qty',
				alignment: { vertical: 'middle', horizontal: 'right' }
			},
			{
				header: this.i18nService.t('packing.fields.target_item_qty', { lang: currentLanguage }),
				key: 'target_item_qty',
				alignment: { vertical: 'middle', horizontal: 'right' }
			},
			{
				header: this.i18nService.t('packing.fields.weighed_box_qty', { lang: currentLanguage }),
				key: 'weighed_box_qty',
				alignment: { vertical: 'middle', horizontal: 'right' }
			},
			{
				header: this.i18nService.t('packing.fields.unweighed_box_qty', { lang: currentLanguage }),
				key: 'unweighed_box_qty',
				alignment: { vertical: 'middle', horizontal: 'right' }
			}
		]

		// Get data and add to worksheet
		const data = await this.getPackingManifest(factoryCode)

		data.forEach((record) => {
			worksheet.addRow({
				...record,
				size_data: record.size_data
					.split(';')
					.map((item) => item.replace(/\((\d+)\)/, ' ($1 prs)'))
					.join('; ')
			})
		})

		// Auto fit columns
		autoFitColumns.call(worksheet, { minWidth: 24, excludeColumns: ['size_data'] } satisfies AutoFitColumnOptions)

		// * Apply borders to all cells
		worksheet.eachRow({ includeEmpty: false }, (row) => {
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

		// * Add header title
		const lastColumnLetter = getLastColumnLetter(worksheet.columns.length)
		worksheet.insertRow(1, null)
		worksheet.mergeCells(`A1:${lastColumnLetter}1`)
		const titleCell = worksheet.getCell('A1')
		titleCell.value = this.i18nService.t('packing.titles.manifest_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})
		titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
		titleCell.font = { size: 14, bold: true }
		titleCell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}

		// * Header row styling
		const headerRow = worksheet.getRow(2)
		headerRow.eachCell((cell, colNumber) => {
			cell.alignment = { vertical: 'middle', horizontal: colNumber < 6 ? 'left' : 'right' }
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
			}
		})

		worksheet.getRow(1).height = 30
		worksheet.getRow(1).font = { bold: true, size: 14 }
		worksheet.getRow(2).height = 30
		worksheet.getRow(2).font = { bold: true }

		// * Add summary footer
		const summaryRow = worksheet.addRow(Array(worksheet.columns.length).fill(null))
		summaryRow.height = 30

		// Set summary label
		worksheet.getCell(`A${summaryRow.number}`).value = this.i18nService.t('common.fields.summary', {
			lang: currentLanguage
		})

		// Calculate data range (excluding header and title rows)
		const dataStartRow = 3 // After title and header
		const dataEndRow = summaryRow.number - 1

		// Add SUM formulas for numeric columns
		// Column H = target_box_qty
		worksheet.getCell(`H${summaryRow.number}`).value = {
			formula: `SUM(H${dataStartRow}:H${dataEndRow})`,
			result: data.reduce((sum, item) => sum + item.target_box_qty, 0)
		}

		// Column I = target_item_qty
		worksheet.getCell(`I${summaryRow.number}`).value = {
			formula: `SUM(I${dataStartRow}:I${dataEndRow})`,
			result: data.reduce((sum, item) => sum + item.target_item_qty, 0)
		}

		// Column J = weighed_box_qty
		worksheet.getCell(`J${summaryRow.number}`).value = {
			formula: `SUM(J${dataStartRow}:J${dataEndRow})`,
			result: data.reduce((sum, item) => sum + item.weighed_box_qty, 0)
		}

		// Column K = unweighed_box_qty
		worksheet.getCell(`K${summaryRow.number}`).value = {
			formula: `SUM(K${dataStartRow}:K${dataEndRow})`,
			result: data.reduce((sum, item) => sum + item.unweighed_box_qty, 0)
		}

		worksheet.mergeCells(`A${summaryRow.number}:G${summaryRow.number}`)
		summaryRow.eachCell((cell) => {
			cell.font = { bold: true }
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
			}
			cell.border = {
				top: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				left: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				bottom: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				right: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } }
			}
		})
		summaryRow.alignment = { vertical: 'middle', horizontal: 'right' }
		summaryRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }

		// * Freeze header rows
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		return await workbook.xlsx.writeBuffer()
	}
}
