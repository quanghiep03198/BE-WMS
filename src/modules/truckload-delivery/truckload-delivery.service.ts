import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { type AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { format, isValid } from 'date-fns'
import { Workbook } from 'exceljs'
import { padStart } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DataSource, Repository } from 'typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { FactoryAgencyCode } from '../department/constants'
import { TruckloadDeliveryStatus } from './constants'
import {
	FilterQueryDTO,
	UpdateDeliveryDTO,
	UpdateSignatureDTO,
	UpsertPurchaseOrdersDTO
} from './dto/truckload-delivery.dto'
import { TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'
import { DispatchOrder, ITruckloadDeliveryService } from './truckload-delivery.interface'
import type { TruckloadDeliveryDispatchOrder } from './types'

@Injectable()
export class TruckloadDeliveryService
	extends BaseAbstractService<TruckloadDeliveryEntity>
	implements ITruckloadDeliveryService
{
	private readonly upsertPurchaseOrderDeliveryQuery: string = readFileSync(
		resolve(join(__dirname, './sql/upsert-purchase-orders.sql')),
		'utf-8'
	)

	constructor(
		@InjectRepository(TruckloadDeliveryEntity, DATA_SOURCE_DATA_LAKE)
		private readonly deliveryRepository: Repository<TruckloadDeliveryEntity>,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		private readonly i18nService: I18nService
	) {
		super(deliveryRepository)
	}

	public async getDispatchOrders(filters?: FilterQueryDTO): Promise<DispatchOrder[]> {
		const dateRangeFilterQuery = () => {
			const hasValidFrom = filters?.from && isValid(new Date(filters.from))
			const hasValidTo = filters?.to && isValid(new Date(filters.to))

			if (hasValidFrom && hasValidTo) {
				return /* SQL */ `a.created BETWEEN CAST('${filters.from}' AS DATETIME) AND CAST('${filters.to}' AS DATETIME)`
			}
			if (hasValidFrom) return /* SQL */ `a.created >= CAST('${filters.from}' AS DATETIME)`
			if (hasValidTo) return /* SQL */ `a.created <= CAST('${filters.to}' AS DATETIME)`
			return '1 = 1'
		}

		const approvalStatusFilterQuery = () =>
			filters?.status ? /* SQL */ `a.approval_status = '${filters.status}'` : '1 = 1'

		const deliveryDetailsCte = this.dataSourceDL
			.createQueryBuilder()
			.select('a.id', 'id')
			.addSelect('a.dispatch_order', 'dispatch_order')
			.addSelect('a.po', 'po')
			.addSelect('e.brand_name', 'brand_name')
			.addSelect('d.shoestyle_codefactory', 'factory_shoes_style')
			.addSelect('c.color_sn', 'color_sn')
			.addSelect('a.outbound_qty', 'outbound_qty')
			.addSelect('a.user_code_created', 'user_code_created')
			.addSelect('a.created', 'created')
			.from('DV_DATA_LAKE.dbo.dv_truckload_delivery', 'a')
			.leftJoin(
				(qb) =>
					qb
						.select(/* SQL */ `IIF(ISNULL(or_custpoone, '') = '', or_custpo, or_custpoone)`, 'po')
						.addSelect('mat_code', 'mat_code')
						.addSelect('custbrand_id', 'custbrand_id')
						.from('wuerp_vnrd.dbo.ta_ordermst', 'b'),
				'b',
				/* SQL */ `a.po = b.po`
			)
			.leftJoin(
				(qb) =>
					qb
						.select('mat_code', 'mat_code')
						.addSelect('color_sn', 'color_sn')
						.addSelect('shoestyle_systemcodefty', 'shoestyle_systemcodefty')
						.from('wuerp_vnrd.dbo.ta_productmst', 'c'),
				'c',
				'c.mat_code = b.mat_code'
			)
			.leftJoin(
				(qb) =>
					qb
						.select('shoestyle_codefactory', 'shoestyle_codefactory')
						.addSelect('shoestyle_systemcodefty', 'shoestyle_systemcodefty')
						.from('wuerp_vnrd.dbo.ta_shoefactorymst', 'd'),
				'd',
				'd.shoestyle_systemcodefty = c.shoestyle_systemcodefty'
			)
			.leftJoin(
				(qb) => qb.select('custbrand_id').addSelect('brand_name').from('wuerp_vnrd.dbo.ta_brand', 'e'),
				'e',
				'e.custbrand_id = b.custbrand_id'
			)
			.where(dateRangeFilterQuery)
			.andWhere(approvalStatusFilterQuery)

		return await this.deliveryRepository
			.createQueryBuilder('a')
			.addCommonTableExpression(deliveryDetailsCte.getQuery(), 'delivery_details')
			.select('a.dispatch_order', 'dispatch_order')
			.addSelect('a.license_plate', 'license_plate')
			.addSelect('a.container_number', 'container_number')
			.addSelect('a.punctured_container', 'punctured_container')
			.addSelect('a.smelling_container', 'smelling_container')
			.addSelect('a.moist_container', 'moist_container')
			.addSelect('a.factory_departure_time', 'factory_departure_time')
			.addSelect('a.approval_status', 'approval_status')
			.addSelect('a.qc_signature', 'qc_signature')
			.addSelect('a.warehouse_officer_signature', 'warehouse_officer_signature')
			.addSelect('a.security_guard_signature', 'security_guard_signature')
			.addSelect('CAST(a.created AS DATE)', 'created_at')
			.addSelect(
				/* SQL */ `(
					SELECT
						dd.id,
						dd.po,
						dd.brand_name,
						dd.factory_shoes_style,
						dd.color_sn,
						dd.outbound_qty,
						dd.user_code_created,
						dd.created
					FROM delivery_details dd
					WHERE dd.dispatch_order = a.dispatch_order
					FOR JSON PATH
				)`,
				'delivery_details'
			)
			.addSelect('CAST(a.remark AS NVARCHAR(255))', 'remark')
			.where(dateRangeFilterQuery)
			.andWhere(approvalStatusFilterQuery)
			.groupBy('a.dispatch_order')
			.addGroupBy('CAST(a.created AS DATE)')
			.addGroupBy('a.license_plate')
			.addGroupBy('a.container_number')
			.addGroupBy('a.factory_departure_time')
			.addGroupBy('a.punctured_container')
			.addGroupBy('a.smelling_container')
			.addGroupBy('a.moist_container')
			.addGroupBy('a.approval_status')
			.addGroupBy('a.qc_signature')
			.addGroupBy('a.warehouse_officer_signature')
			.addGroupBy('a.security_guard_signature')
			.addGroupBy('CAST(a.remark AS NVARCHAR(255))')
			.orderBy('CAST(a.created AS DATE)', 'DESC')
			.addOrderBy('a.factory_departure_time', 'DESC')
			.getRawMany<DispatchOrder>()
			.then((results) =>
				results.map((row) => ({
					...row,
					delivery_details: SuperJson.parse<
						Array<{
							id: number
							po: string
							brand_name: string
							factory_shoes_style: string
							color_sn: string
							outbound_qty: number
							user_code_created: string
							created: Date
						}>
					>(row.delivery_details, 1).sort((a, b) => a.id - b.id)
				}))
			)
	}

	public override async insertMany(payload: Partial<TruckloadDeliveryEntity>[]) {
		const entities = payload.map((item) => this.deliveryRepository.create(item))
		return await this.deliveryRepository.insert(entities)
	}

	public async bulkUpdateByDispatchOrder(dispatchOrder: string, payload: UpdateDeliveryDTO) {
		return await this.deliveryRepository.update({ dispatch_order: dispatchOrder }, payload)
	}

	public async bulkDeleteByDispatchOrder(dispatchOrder: string) {
		return await this.deliveryRepository.delete({ dispatch_order: dispatchOrder })
	}

	public async upsertPurchaseOrderDeliveries(dispatchOrder: string, payload: UpsertPurchaseOrdersDTO) {
		const existedDispatchOrder = await this.deliveryRepository.findOne({
			select: ['dispatch_order', 'license_plate', 'container_number', 'approval_status'],
			where: { dispatch_order: dispatchOrder }
		})
		if (!existedDispatchOrder) throw new NotFoundException(`Delivery with dispatch order ${dispatchOrder} not found`)

		return await this.dataSourceDL.query(this.upsertPurchaseOrderDeliveryQuery, [
			JSON.stringify(payload.map((item) => ({ ...item, ...existedDispatchOrder })))
		])
	}

	public async updateDispatchOrderSignature(dispatchOrder: string, payload: UpdateSignatureDTO) {
		return await this.deliveryRepository.update(
			{ dispatch_order: dispatchOrder },
			{
				...payload,
				factory_departure_time: payload.approval_status === TruckloadDeliveryStatus.CONFIRMED ? new Date() : null,
				last_reviewed_at: new Date()
			}
		)
	}

	/**
	 * @private
	 * @description Generates a new dispatch code in the format `DO-YYYYMMDD-XXX` where:
	 * - `DO` is a fixed prefix
	 * - `YYYYMMDD` is the create date
	 * - `XXX` daily sequential number, padded to 3 digits
	 *
	 * @returns A promise that resolves to the generated dispatch code
	 */
	public async getNextDispatchOrder(factoryCode: FactoryAgencyCode): Promise<TruckloadDeliveryDispatchOrder> {
		const createDate = format(new Date(), 'yyyyMMdd')

		const count: Awaited<number> = await this.deliveryRepository
			.createQueryBuilder()
			.select(/* SQL */ `COUNT(DISTINCT dispatch_order)`, 'count')
			.where(/* SQL */ `CAST(created AS DATE) = CAST(GETDATE() AS DATE)`)
			.getRawOne<{ count: number }>()
			.then((results) => results.count)

		const sequenceNumber = padStart((count + 1).toString(), 3, '0')
		return `${factoryCode}-EXP-${createDate}-${sequenceNumber}` satisfies TruckloadDeliveryDispatchOrder
	}

	public async updateContainerCondition(dispatchOrder: string, payload) {
		return await this.deliveryRepository.update({ dispatch_order: dispatchOrder }, payload)
	}

	public async exportToExcel(factoryCode: string, filters?: FilterQueryDTO) {
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet('Truckload Deliveries')
		const currentLanguage = I18nContext.current()?.lang

		// * Fetch data
		const data = await this.getDispatchOrders(filters)
		const worksheetData = data.map((item) => ({
			...item,
			punctured_container: item.punctured_container ? '✕' : '',
			smelling_container: item.smelling_container ? '✕' : '',
			moist_container: item.moist_container ? '✕' : '',
			factory_departure_time: item.factory_departure_time
				? format(new Date(item.factory_departure_time), 'yyyy-MM-dd HH:mm:ss')
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
				header: this.i18nService.t('erp.fields.qc_signature', { lang: currentLanguage }),
				key: 'qc_signature'
			},
			{
				header: this.i18nService.t('erp.fields.warehouse_officer_signature', {
					lang: currentLanguage
				}),
				key: 'warehouse_officer_signature'
			},
			{
				header: this.i18nService.t('erp.fields.security_guard_signature', { lang: currentLanguage }),
				key: 'security_guard_signature'
			},
			{ header: this.i18nService.t('common.fields.remark', { lang: currentLanguage }), key: 'remark' }
		]

		// * Store image data to render after removing empty rows
		const imageDataMap = new Map<number, Array<{ colIndex: number; imageId: number }>>()

		// * Render row data
		for (const record of worksheetData) {
			const row = worksheet.addRow(record)
			// row.height = 30
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
				}
			}

			// * Store signature images for later rendering
			const signatureColumns = [
				{ key: 'qc_signature', colIndex: 8 },
				{ key: 'warehouse_officer_signature', colIndex: 9 },
				{ key: 'security_guard_signature', colIndex: 10 }
			]

			const rowImages: Array<{ colIndex: number; imageId: number }> = []
			for (const { key, colIndex } of signatureColumns) {
				const base64Data = record[key]
				if (base64Data && typeof base64Data === 'string') {
					// * Remove data:image/png;base64, prefix if exists
					const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
					const imageId = workbook.addImage({
						base64: base64,
						extension: 'png'
					})
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
			if (Array.isArray(record.delivery_details) && record.delivery_details.length > 0) {
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
				for (const subRecord of record.delivery_details) {
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

		//
		// * Auto fit columns
		autoFitColumns.call(worksheet, {
			minWidth: 14,
			excludeColumns: ['created_at', 'qc_signature', 'warehouse_officer_signature', 'security_guard_signature']
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
						tl: { col: colIndex - 1, row: newRowNumber } as any,
						br: { col: colIndex, row: newRowNumber + 1 } as any,
						editAs: 'oneCell'
					})
				})
			}
		})

		// * Add  header title
		worksheet.insertRow(1, null)
		worksheet.mergeCells('A1:K1')
		worksheet.getRow(1).height = 30
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getRow(1).font = { size: 14, bold: true }
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
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

		return await workbook.xlsx.writeBuffer()
	}
}
