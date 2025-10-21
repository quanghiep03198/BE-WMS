import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { type AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { CENTRAL_DATA_SOURCE } from '@/databases/constants'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { format } from 'date-fns'
import { Workbook, Worksheet } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Brackets, DataSource } from 'typeorm'
import { UpdatePackingWeightDTO } from './dto/update-packing.dto'
import { PackingEntity } from './entities/packing.entity'

@Injectable()
export class PackingService {
	private readonly packingManifestQuery: string = readFileSync(join(__dirname, './sql/packing-manifest.sql'), 'utf-8')

	constructor(
		@Inject(CENTRAL_DATA_SOURCE) private readonly dataSource: DataSource,
		private readonly i18nService: I18nService
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
		const currentLanguage = I18nContext.current()?.lang || 'en'

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
				header: this.i18nService.t('packing.fields.po', { lang: currentLanguage }),
				key: 'po',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.brand_name', { lang: currentLanguage }),
				key: 'brand_name',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.shoes_style', { lang: currentLanguage }),
				key: 'shoes_style',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.color', { lang: currentLanguage }),
				key: 'color',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.size', { lang: currentLanguage }),
				key: 'size_data',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.standard_weight', { lang: currentLanguage }),
				key: 'standard_weight',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.actual_weight', { lang: currentLanguage }),
				key: 'actual_weight',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.target_box_qty', { lang: currentLanguage }),
				key: 'target_box_qty',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.target_item_qty', { lang: currentLanguage }),
				key: 'target_item_qty',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.weighed_box_qty', { lang: currentLanguage }),
				key: 'weighed_box_qty',
				alignment: { vertical: 'middle', horizontal: 'center' }
			},
			{
				header: this.i18nService.t('packing.fields.unweighed_box_qty', { lang: currentLanguage }),
				key: 'unweighed_box_qty',
				alignment: { vertical: 'middle', horizontal: 'center' }
			}
		]

		// Get data and add to worksheet
		const data = await this.getPackingManifest(factoryCode)
		data.forEach((item) => {
			const row = worksheet.addRow(item)
			row.height = 25

			// Color coding for weight status
			const isWeighed = item.actual_weight !== null && item.actual_weight > 0
			const bgColor = isWeighed ? ExcelColorPalette.BG_LIGHT_BLUE : ExcelColorPalette.BG_LIGHT_YELLOW

			row.eachCell((cell) => {
				cell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: bgColor }
				}
			})
		})

		// Auto fit columns
		autoFitColumns.call(worksheet, { minWidth: 12 } satisfies AutoFitColumnOptions)

		// Add header title
		worksheet.insertRow(1, null)
		worksheet.mergeCells(`A1:${String.fromCharCode(65 + worksheet.columns.length - 1)}1`)
		const titleCell = worksheet.getCell('A1')
		titleCell.value = this.i18nService.t('packing.titles.manifest_report', {
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }),
				date: format(new Date(), 'yyyy-MM-dd')
			},
			lang: currentLanguage
		})
		titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
		titleCell.font = { size: 16, bold: true }
		titleCell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
		}

		// Header row styling
		const headerRow = worksheet.getRow(2)
		headerRow.height = 35
		headerRow.font = { bold: true, size: 12 }
		headerRow.eachCell((cell) => {
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
			}
		})

		// Add summary footer
		const summaryRow = worksheet.addRow(Array(worksheet.columns.length).fill(null))
		summaryRow.height = 30
		worksheet.mergeCells(`A${summaryRow.number}:E${summaryRow.number}`)
		worksheet.mergeCells(
			`F${summaryRow.number}:${String.fromCharCode(65 + worksheet.columns.length - 1)}${summaryRow.number}`
		)

		const totalBoxes = data.reduce((sum, item) => sum + item.target_box_qty, 0)
		const totalWeighed = data.reduce((sum, item) => sum + item.weighed_box_qty, 0)

		worksheet.getCell(`A${summaryRow.number}`).value = this.i18nService.t('common.fields.summary', {
			lang: currentLanguage
		})
		worksheet.getCell(`F${summaryRow.number}`).value = this.i18nService.t('packing.summary.total_progress', {
			args: { weighed: totalWeighed, total: totalBoxes, percentage: ((totalWeighed / totalBoxes) * 100).toFixed(1) },
			lang: currentLanguage
		})

		summaryRow.eachCell((cell) => {
			cell.font = { bold: true, size: 12 }
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
			}
		})

		// Apply borders to all cells
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

		// Freeze header rows
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		return await workbook.xlsx.writeBuffer()
	}
}
