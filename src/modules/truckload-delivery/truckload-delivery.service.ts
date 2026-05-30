import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { type AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP, RecordStatus } from '@/databases/constants'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { format, isValid } from 'date-fns'
import { Workbook } from 'exceljs'
import { omit, padStart, upperCase } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DataSource, Repository } from 'typeorm'
import { BaseAbstractEntity } from '../_base/base.abstract.entity'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { FactoryAgencyCode } from '../department/constants'
import { TruckloadDeliveryStatus } from './constants'
import {
	UnflatedFilterQueryDTO,
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
	constructor(
		@InjectRepository(TruckloadDeliveryEntity, DATA_SOURCE_DATA_LAKE)
		private readonly deliveryRepository: Repository<TruckloadDeliveryEntity>,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		private readonly i18nService: I18nService,
		@InjectPinoLogger(TruckloadDeliveryService.name) private readonly logger: PinoLogger
	) {
		super(deliveryRepository)
	}

	private readonly upsertPurchaseOrderDeliveryQuery: string = readFileSync(
		resolve(join(__dirname, './sql/upsert-purchase-orders.sql')),
		'utf-8'
	)

	private readonly getDispatchOrderQuery: string = readFileSync(
		resolve(join(__dirname, './sql/dispatch-orders.sql')),
		'utf-8'
	)

	private readonly getNextSeqNoQuery: string = readFileSync(resolve(join(__dirname, './sql/next-seq-no.sql')), 'utf-8')

	private readonly getDispatchOrderWithProductAttrQuery: string = readFileSync(
		resolve(join(__dirname, './sql/dispatch-orders-with-product-attributes.sql')),
		'utf-8'
	)

	private generateRawWhereClause(queryParams: UnflatedFilterQueryDTO, alias = ''): string {
		if (!queryParams.where) return ''
		const qualified = (column: string) => (alias ? `${alias}.${column}` : column)
		const whereCaluse = Object.entries(queryParams.where)
			.map(([column, expression]) => {
				const [operator, value] = expression.split(':')
				if (
					['created_at', 'container_sealing_time', 'factory_departure_time', 'actual_departure_time'].includes(
						column
					)
				) {
					if (operator === 'between') {
						const [from, to] = value.split(',').map((value) => value.trim())
						if (!isValid(new Date(from)) || !isValid(new Date(to))) return ''
						const fromDate = format(new Date(new Date(from).setHours(0, 0, 0, 0)), 'yyyy-MM-dd HH:mm:ss.SSS')
						const toDate = format(new Date(new Date(to).setHours(23, 59, 59, 999)), 'yyyy-MM-dd HH:mm:ss.SSS')
						return /* SQL */ `${qualified(column)} BETWEEN CAST('${fromDate}' AS DATETIME) AND CAST('${toDate}' AS DATETIME)`
					} else if (operator === '=' && isValid(new Date(value))) {
						const dateValue = format(new Date(value), 'yyyy-MM-dd')
						return /* SQL */ `CAST(${qualified(column)} AS DATE) = CAST('${dateValue}' AS DATE)`
					} else {
						return ''
					}
				}
				if (column === 'po')
					return /* SQL */ `EXISTS (
						SELECT 1
						FROM DV_DATA_LAKE.dbo.dv_truckload_delivery td
						WHERE td.dispatch_order = ${qualified('dispatch_order')}
							AND td.isactive = '${RecordStatus.ACTIVE}'
							AND td.po ${operator} '${value}'
					)`
				return /* SQL */ `${qualified(column)} ${operator} '${value}'`
			})
			.join(' AND ')

		return /* SQL */ `WHERE ${whereCaluse}`
	}

	private generateSortingClause(queryParams: UnflatedFilterQueryDTO, alias = ''): string {
		const qualified = (column: string) => (alias ? `${alias}.${column}` : column)
		if (queryParams.sort) {
			const sortingCriteria = Object.entries(queryParams.sort)
				.map(([column, dir]) => `${qualified(column)} ${upperCase(dir.toString())}`)
				.join(', ')
			return /* SQL */ `ORDER BY ${sortingCriteria}`
		}
		return /* SQL */ `ORDER BY ${qualified('created_at')} DESC, ${qualified('container_sealing_time')} DESC`
	}

	/**
	 * Get dispatch orders with optional product variant details
	 * @param queryParams FilterQueryDTO
	 */
	public async getDispatchOrders(queryParams: UnflatedFilterQueryDTO) {
		const params = [(queryParams.page - 1) * queryParams.limit, queryParams.limit]

		const whereClause = this.generateRawWhereClause(queryParams, 'c')
		const sortingClause = this.generateSortingClause(queryParams, 'c')
		const finalSortingClause = this.generateSortingClause(queryParams, 'p')

		const [dispatchOrders, [{ totalDocs }]] = await Promise.all([
			this.dataSourceDL.query<DispatchOrder[]>(
				/* SQL */ `
					WITH CTE AS (${this.getDispatchOrderQuery}),
					PAGED AS (
						SELECT * FROM CTE c
						${whereClause}
						${sortingClause}
						OFFSET @0 ROWS FETCH NEXT @1 ROWS ONLY
					)
					SELECT
						p.*,
						d.delivery_details
					FROM PAGED p
					OUTER APPLY (
						SELECT (
							SELECT td.po, td.outbound_qty
							FROM DV_DATA_LAKE.dbo.dv_truckload_delivery td
							WHERE td.dispatch_order = p.dispatch_order
								AND td.isactive = '${RecordStatus.ACTIVE}'
							FOR JSON PATH
						) AS delivery_details
					) d
					${finalSortingClause}
					OPTION (FAST ${queryParams.limit}, KEEPFIXED PLAN)
				`,
				params
			),
			this.dataSourceDL.query<Record<'totalDocs', number>[]>(
				/* SQL */ `
					WITH CTE AS (${this.getDispatchOrderQuery})
					SELECT COUNT(*) AS totalDocs FROM CTE c
					${whereClause}
					OPTION (KEEPFIXED PLAN)
				`,
				params
			)
		])

		const totalPages: number = Math.ceil(totalDocs / queryParams.limit)
		const hasNextPage: boolean = queryParams.page < totalPages
		const hasPrevPage: boolean = queryParams.page > 1

		return {
			data: dispatchOrders.map((order) => ({
				...order,
				delivery_details: SuperJson.parse(order.delivery_details, 1)
			})),
			totalDocs,
			totalPages,
			hasNextPage,
			hasPrevPage,
			page: queryParams.page,
			limit: queryParams.limit,
			nextPage: hasNextPage ? queryParams.page + 1 : null,
			prevPage: hasPrevPage ? queryParams.page - 1 : null
		}
	}

	public async getDispatchOrderDetail(dispatchOrder: string) {
		const dispatchOrderDetailQuery = this.deliveryRepository
			.createQueryBuilder()
			.select([`DISTINCT po AS po`, `keyid AS id`, `created`, `user_code_created`, `outbound_qty`])
			.where('dispatch_order = :dispatchOrder')
			.getQuery()

		const dispatchedPurchaseOrderQuery = this.deliveryRepository
			.createQueryBuilder()
			.select([`po`, `SUM(outbound_qty) AS dispatched_outbound_qty`])
			.groupBy('po')
			.getQuery()

		return await this.dataSourceDL
			.createQueryBuilder()
			.addCommonTableExpression(dispatchOrderDetailQuery, 'dispatch_order_detail')
			.addCommonTableExpression(dispatchedPurchaseOrderQuery, 'dispatch_po_outbound')
			.select([
				`DISTINCT a.id`,
				`a.po AS po`,
				`e.brand_name AS brand_name`,
				`d.shoestyle_codefactory AS factory_shoes_style`,
				`c.color_sn AS color_sn`,
				`SUM(ISNULL(b.or_totalqty, 0)) AS po_qty`,
				`a.outbound_qty AS outbound_qty`,
				`MAX(aa.dispatched_outbound_qty) AS dispatched_outbound_qty`,
				`a.created AS created`,
				`a.user_code_created AS user_code_created`
			])
			.from((qb) => {
				return qb.select('*').from('dispatch_order_detail', 'a')
			}, 'a')
			.leftJoin(
				(qb) => {
					return qb.select('*').from('dispatch_po_outbound', 'aa')
				},
				'aa',
				'aa.po = a.po'
			)
			.leftJoin(
				(qb) => {
					return qb
						.select([
							`IIF(ISNULL(b.or_custpoone, '') = '', b.or_custpo, b.or_custpoone) AS po`,
							'b.mat_code',
							'b.custbrand_id',
							'b.or_totalqty'
						])
						.from('wuerp_vnrd.dbo.ta_ordermst', 'b')
						.where('b.isactive = :isActive')
				},
				'b',
				'a.po = b.po'
			)
			.leftJoin(
				(qb) => {
					return qb
						.select(['c.mat_code', 'c.color_sn', 'c.shoestyle_systemcodefty'])
						.from('wuerp_vnrd.dbo.ta_productmst', 'c')
						.where('c.isactive = :isActive')
				},
				'c',
				`c.mat_code = b.mat_code`
			)
			.leftJoin(
				(qb) => {
					return qb
						.select(['d.shoestyle_systemcodefty', 'd.shoestyle_codefactory'])
						.from('wuerp_vnrd.dbo.ta_shoefactorymst', 'd')
						.where('d.isactive = :isActive')
				},
				'd',
				'd.shoestyle_systemcodefty = c.shoestyle_systemcodefty'
			)
			.leftJoin(
				(qb) => {
					return qb
						.select(['e.custbrand_id', 'e.brand_name'])
						.from('wuerp_vnrd.dbo.ta_brand', 'e')
						.where('e.isactive = :isActive')
				},
				'e',
				'b.custbrand_id = e.custbrand_id'
			)
			.groupBy('a.id')
			.addGroupBy('a.po')
			.addGroupBy('e.brand_name')
			.addGroupBy('d.shoestyle_codefactory')
			.addGroupBy('c.color_sn')
			.addGroupBy('a.user_code_created')
			.addGroupBy('a.created')
			.addGroupBy('a.outbound_qty')
			// .addGroupBy('aa.dispatched_outbound_qty')
			.setParameters({ isActive: RecordStatus.ACTIVE, dispatchOrder })
			.getRawMany<{
				po: string
				brand_name: string
				factory_shoes_style: string
				color_sn: string
				po_qty: number
				user_code_created: string
				dispatched_outbound_qty: number
			}>()
	}

	public override async insertMany(payload: Partial<TruckloadDeliveryEntity>[]) {
		const entities = payload.map((item) => this.deliveryRepository.create(item))
		return await this.deliveryRepository.insert(entities)
	}

	public async searchDispatchOutboundPurchaseOrder(searchTerm: string) {
		return await this.dataSourceERP
			.createQueryBuilder()
			.select([
				`DISTINCT TOP 5 IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) AS po`,
				`e.brand_name AS brand_name`,
				`d.shoestyle_codefactory AS factory_shoes_style`,
				`c.color_sn AS color_sn`,
				`ISNULL(b.dispatched_outbound_qty, 0) AS dispatched_outbound_qty`,
				`SUM(ISNULL(a.or_totalqty, 0)) AS po_qty`,
				`SUM(ISNULL(a.or_totalqty, 0)) - ISNULL(b.dispatched_outbound_qty, 0) AS max_outbound_qty`
			])
			.from('wuerp_vnrd.dbo.ta_ordermst', 'a')
			.leftJoin(
				(qb) =>
					qb
						.select(['po', 'SUM(outbound_qty) AS dispatched_outbound_qty'])
						.from('DV_DATA_LAKE.dbo.dv_truckload_delivery', 'b')
						.where(/* SQL */ `po LIKE '%${searchTerm}%'`)
						.groupBy('po'),
				'b',
				/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) = b.po
			`
			)
			.leftJoin(
				(qb) => {
					return qb
						.select(['mat_code', 'color_sn', 'shoestyle_systemcodefty'])
						.from('wuerp_vnrd.dbo.ta_productmst', 'c')
						.where(`c.isactive = :isActive`)
				},
				'c',
				`c.mat_code = a.mat_code`
			)
			.leftJoin(
				(qb) => {
					return qb
						.select(['shoestyle_systemcodefty', 'shoestyle_codefactory'])
						.from('wuerp_vnrd.dbo.ta_shoefactorymst', 'd')
						.where(`d.isactive = :isActive`)
				},
				'd',
				'd.shoestyle_systemcodefty = c.shoestyle_systemcodefty'
			)
			.leftJoin(
				(qb) =>
					qb
						.select(['custbrand_id', 'brand_name'])
						.from('wuerp_vnrd.dbo.ta_brand', 'e')
						.where(`e.isactive = :isActive`),
				'e',
				'e.custbrand_id = a.custbrand_id'
			)
			.where(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) LIKE '%${searchTerm}%'`)
			.groupBy(/* SQL */ `IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)`)
			.addGroupBy('e.brand_name')
			.addGroupBy('d.shoestyle_codefactory')
			.addGroupBy('c.color_sn')
			.addGroupBy('b.dispatched_outbound_qty')
			.setParameters({ isActive: RecordStatus.ACTIVE })
			.getRawMany<{
				po: string
				brand_name: string | null
				factory_shoes_style: string | null
				color_sn: string | null
				max_outbound_qty: number
			}>()
	}

	public async bulkUpdateByDispatchOrder(
		dispatchOrder: string,
		payload: UpdateDeliveryDTO & Partial<BaseAbstractEntity>
	) {
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

	public async updateDispatchOrderSignature(
		dispatchOrder: string,
		payload: UpdateSignatureDTO & Partial<BaseAbstractEntity>
	) {
		return await this.deliveryRepository.update(
			{ dispatch_order: dispatchOrder },
			{
				...omit(payload, ['approval_status', 'signature_type']),
				...(payload.security_2_signature && { approval_status: payload.approval_status }),
				...(!!payload.security_1_signature && {
					container_sealing_time: payload.approval_status === TruckloadDeliveryStatus.CONFIRMED ? new Date() : null
				}),
				...(!!payload.security_2_signature && {
					factory_departure_time: payload.approval_status === TruckloadDeliveryStatus.CONFIRMED ? new Date() : null
				})
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

		const [{ next_seq_no }] = await this.dataSourceDL.query<Array<{ next_seq_no: number }>>(this.getNextSeqNoQuery)
		const sequenceNumber = padStart(next_seq_no.toString(), 3, '0')
		return `${factoryCode}-EXP-${createDate}-${sequenceNumber}` satisfies TruckloadDeliveryDispatchOrder
	}

	public async updateContainerCondition(dispatchOrder: string, payload) {
		return await this.deliveryRepository.update({ dispatch_order: dispatchOrder }, payload)
	}

	public async exportToExcel(factoryCode: string, queryParams?: Omit<UnflatedFilterQueryDTO, 'page' | 'limit'>) {
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet('Truckload Deliveries')
		const currentLanguage = I18nContext.current()?.lang

		const whereClause = this.generateRawWhereClause(queryParams)

		// * Fetch data
		const data = await this.dataSourceDL.query(/* SQL */ `
			WITH CTE AS (${this.getDispatchOrderWithProductAttrQuery})
			SELECT * FROM CTE
			${whereClause}
		`)

		const worksheetData = data.map((row) => {
			const detail = SuperJson.parse<
				Array<{
					id: number
					po: string
					brand_name?: string
					factory_shoes_style?: string
					color_sn?: string
					outbound_qty: number
					user_code_created: string
					created: Date
				}>
			>(row.delivery_details, 1).sort((a, b) => a.id - b.id)

			return {
				...row,
				total_outbound_qty: detail.reduce((acc, curr) => acc + curr.outbound_qty, 0),
				delivery_details: detail,
				punctured_container: row.punctured_container ? '✕' : '',
				smelling_container: row.smelling_container ? '✕' : '',
				moist_container: row.moist_container ? '✕' : '',
				factory_departure_time: row.factory_departure_time
					? format(new Date(row.factory_departure_time), 'yyyy-MM-dd HH:mm:ss')
					: ''
			}
		})

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
			// row.height = 30

			// * Store signature images for later rendering
			const signatureColumns = [
				{ key: 'ie_signature', colIndex: 9 },
				{ key: 'warehouse_officer_signature', colIndex: 10 },
				{ key: 'security_1_signature', colIndex: 11 },
				{ key: 'security_2_signature', colIndex: 12 }
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
						tl: { col: colIndex - 1, row: newRowNumber } as any,
						br: { col: colIndex, row: newRowNumber + 1 } as any,
						editAs: 'oneCell'
					})
				})
			}
		})

		// * Add  header title
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

		return await workbook.xlsx.writeBuffer()
	}
}
