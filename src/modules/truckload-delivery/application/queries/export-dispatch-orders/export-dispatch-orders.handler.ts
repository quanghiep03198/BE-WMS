import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { type AutoFitColumnOptions, autoFitColumns } from '@common/helpers'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DISPATCH_ORDER_SIGNATURE_FIELDS } from '../../../domain/constants'
import { ISignatureStorage, SIGNATURE_STORAGE, StoredSignature } from '../../ports/signature-storage.port'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { ExportDispatchOrdersQuery } from './export-dispatch-orders.query'

@QueryHandler(ExportDispatchOrdersQuery)
export class ExportDispatchOrdersHandler implements IQueryHandler<ExportDispatchOrdersQuery, Buffer> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository,
		@Inject(SIGNATURE_STORAGE) private readonly signatureStorage: ISignatureStorage,
		private readonly i18nService: I18nService
	) {}

	async execute({ factoryCode, filter }: ExportDispatchOrdersQuery): Promise<Buffer> {
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet('Truckload Deliveries')
		const currentLanguage = I18nContext.current()?.lang

		// * Fetch data
		const dispatchOrders = await this.repository.findAll(filter)

		const signatureIds = [
			...new Set(
				dispatchOrders
					.flatMap((order) => DISPATCH_ORDER_SIGNATURE_FIELDS.map((field) => order[field]))
					.filter((id): id is string => typeof id === 'string' && id.length > 0)
			)
		]
		const signatureImages = new Map<string, StoredSignature>()
		// Bounded concurrency; a failed file must not break the whole export
		const DOWNLOAD_BATCH_SIZE = 10
		for (let i = 0; i < signatureIds.length; i += DOWNLOAD_BATCH_SIZE) {
			await Promise.all(
				signatureIds.slice(i, i + DOWNLOAD_BATCH_SIZE).map(async (id) => {
					try {
						const signature = await this.signatureStorage.download(id)
						if (signature) signatureImages.set(id, signature)
					} catch {
						// skip unreadable signature
					}
				})
			)
		}
		// Embed each unique image once in the workbook and reuse its id across cells
		const workbookImageIds = new Map<string, number>()
		const getWorkbookImageId = (id: string, signature: StoredSignature): number => {
			let imageId = workbookImageIds.get(id)
			if (imageId === undefined) {
				imageId = workbook.addImage({
					buffer: signature.buffer as any,
					extension: signature.contentType === 'image/jpeg' ? 'jpeg' : 'png'
				})
				workbookImageIds.set(id, imageId)
			}
			return imageId
		}

		const worksheetData = dispatchOrders.map((dispatchOrder) => ({
			...dispatchOrder,
			packing: dispatchOrder.packing.map((line) => ({
				po: line.po,
				brand_name: line.brand_name,
				factory_shoes_style: line.factory_shoes_style,
				color_sn: line.color_sn,
				outbound_qty: line.outbound_qty
			})),
			actual_departure_time: dispatchOrder.license_plate_capture_time,
			punctured_container: dispatchOrder.punctured_container ? '✕' : '',
			smelling_container: dispatchOrder.smelling_container ? '✕' : '',
			moist_container: dispatchOrder.moist_container ? '✕' : '',
			factory_departure_time: dispatchOrder.factory_departure_time
				? format(new Date(dispatchOrder.factory_departure_time), 'yyyy-MM-dd HH:mm:ss')
				: ''
		}))

		// * Define worksheet columns
		worksheet.columns = [
			{ header: this.i18nService.t('common.fields.date', { lang: currentLanguage }), key: 'created_at' },
			{ header: this.i18nService.t('erp.fields.license_plate', { lang: currentLanguage }), key: 'license_plate' },
			{
				header: this.i18nService.t('erp.fields.container_number', { lang: currentLanguage }),
				key: 'container_number'
			},
			{
				header: this.i18nService.t('erp.fields.factory_departure_time', { lang: currentLanguage }),
				key: 'factory_departure_time'
			},
			{
				header: this.i18nService.t('erp.fields.actual_departure_time', { lang: currentLanguage }),
				key: 'actual_departure_time'
			},
			{
				header: this.i18nService.t('erp.fields.punctured_container', { lang: currentLanguage }),
				key: 'punctured_container'
			},
			{
				header: this.i18nService.t('erp.fields.smelling_container', { lang: currentLanguage }),
				key: 'smelling_container'
			},
			{
				header: this.i18nService.t('erp.fields.moist_container', { lang: currentLanguage }),
				key: 'moist_container'
			},
			{
				header: this.i18nService.t('erp.fields.ie_signature', { lang: currentLanguage }),
				key: 'ie_signature'
			},
			{
				header: this.i18nService.t('erp.fields.warehouse_officer_signature', {
					lang: currentLanguage
				}),
				key: 'warehouse_officer_signature'
			},
			{
				header: this.i18nService.t('erp.fields.security_guard_signature', {
					args: { number: 1 },
					lang: currentLanguage
				}),
				key: 'security_1_signature'
			},
			{
				header: this.i18nService.t('erp.fields.security_guard_signature', {
					args: { number: 2 },
					lang: currentLanguage
				}),
				key: 'security_2_signature'
			},
			{ header: this.i18nService.t('common.fields.remark', { lang: currentLanguage }), key: 'remark' }
		]

		// * Store image data to render after removing empty rows
		const imageDataMap = new Map<number, Array<{ colIndex: number; imageId: number }>>()

		// * Render row data
		for (const record of worksheetData) {
			const row = worksheet.addRow(record)

			// * Store signature images for later rendering
			const signatureColumns = [
				{ key: 'ie_signature', colIndex: 9 },
				{ key: 'warehouse_officer_signature', colIndex: 10 },
				{ key: 'security_1_signature', colIndex: 11 },
				{ key: 'security_2_signature', colIndex: 12 }
			]

			const rowImages: Array<{ colIndex: number; imageId: number }> = []
			for (const { key, colIndex } of signatureColumns) {
				const signature = signatureImages.get(record[key])
				if (signature) {
					const imageId = getWorkbookImageId(record[key], signature)
					rowImages.push({ colIndex, imageId })
					// Clear cell value to avoid text overlap
					row.getCell(colIndex).value = ''
				}
			}
			if (rowImages.length > 0) {
				imageDataMap.set(row.number, rowImages)
			}

			row.height = 40
			row.alignment = { vertical: 'middle', horizontal: 'center' }

			// * Sub-table for delivery details
			if (Array.isArray(record.packing) && record.packing.length > 0) {
				const subTableHeaderRow = worksheet.addRow([
					'',
					this.i18nService.t('erp.fields.po', { lang: currentLanguage }),
					this.i18nService.t('erp.fields.brand_name', { lang: currentLanguage }),
					this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
					this.i18nService.t('erp.fields.color_sn', { lang: currentLanguage }),
					this.i18nService.t('erp.fields.outbound_qty', { lang: currentLanguage })
				])
				subTableHeaderRow.font = { bold: true }
				subTableHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
				subTableHeaderRow.height = 20
				for (const subRecord of record.packing) {
					const subTableRow = worksheet.addRow([])
					subTableRow.alignment = { vertical: 'middle', horizontal: 'center' }
					subTableRow.getCell(2).value = subRecord.po
					subTableRow.getCell(2).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
					}
					subTableRow.getCell(3).value = subRecord.brand_name
					subTableRow.getCell(3).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: ExcelColorPalette.BG_LIGHT_RED }
					}
					subTableRow.getCell(4).value = subRecord.factory_shoes_style
					subTableRow.getCell(4).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
					}
					subTableRow.getCell(5).value = subRecord.color_sn
					subTableRow.getCell(5).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: ExcelColorPalette.BG_LIGHT_RED }
					}
					subTableRow.getCell(6).value = subRecord.outbound_qty
					subTableRow.getCell(6).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
					}
				}
			}
		}

		// * Auto fit columns
		autoFitColumns.call(worksheet, {
			minWidth: 14,
			excludeColumns: [
				'created_at',
				'actual_departure_time',
				'ie_signature',
				'warehouse_officer_signature',
				'security_1_signature',
				'security_2_signature'
			]
		} satisfies AutoFitColumnOptions)

		// * Remove empty rows and update image positions
		const rowMapping = new Map<number, number>() // old row number -> new row number
		const rowsToDelete: number[] = []
		worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
			let isEmpty = true
			row.eachCell({ includeEmpty: true }, (cell) => {
				if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
					isEmpty = false
				}
			})
			if (isEmpty) {
				rowsToDelete.push(rowNumber)
			}
		})

		// Calculate row mapping after deletions
		let deletedCount = 0
		for (let oldRowNum = 1; oldRowNum <= worksheet.rowCount; oldRowNum++) {
			if (rowsToDelete.includes(oldRowNum)) {
				deletedCount++
			} else {
				rowMapping.set(oldRowNum, oldRowNum - deletedCount)
			}
		}

		// Delete empty rows in reverse order
		rowsToDelete.reverse().forEach((rowNumber) => {
			worksheet.spliceRows(rowNumber, 1)
		})

		// * Render images after removing empty rows
		imageDataMap.forEach((images, oldRowNumber) => {
			const newRowNumber = rowMapping.get(oldRowNumber)
			if (newRowNumber) {
				images.forEach(({ colIndex, imageId }) => {
					worksheet.addImage(imageId, {
						tl: { col: colIndex - 1, row: newRowNumber },
						br: { col: colIndex, row: newRowNumber + 1 } as any,
						editAs: 'oneCell'
					})
				})
			}
		})

		// * Add header title
		worksheet.insertRow(1, null)
		worksheet.mergeCells('A1:M1')
		worksheet.getRow(1).height = 30
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getRow(1).font = { size: 14, bold: true }
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		for (let i = 1; i <= worksheet.columns.length; i++) {
			worksheet.getRow(2).getCell(i).fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
			}
		}
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').value = this.i18nService.t('inoutbound.titles.truckload_delivery_report', {
			lang: currentLanguage,
			args: {
				factory: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage })
			}
		})

		// * Split worksheet - panel dưới chỉ hiển thị footer row
		worksheet.views = [
			{
				state: 'frozen',
				xSplit: 0,
				ySplit: 2
			}
		]

		// * Cell styles
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.alignment = { vertical: 'middle', horizontal: 'center' }
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

		return (await workbook.xlsx.writeBuffer()) as unknown as Buffer
	}
}
