import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { padStart } from 'lodash'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DataSource, Repository } from 'typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { FactoryAgencyCode } from '../department/constants'
import { TruckloadDeliveryStatus } from './constants'
import { UpdateDeliveryDTO, UpdateSignatureDTO, UpsertPurchaseOrdersDTO } from './dto/truckload-delivery.dto'
import { TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'
import type { TruckloadDeliveryDispatchOrder } from './types'

@Injectable()
export class TruckloadDeliveryService extends BaseAbstractService<TruckloadDeliveryEntity> {
	private readonly upsertPurchaseOrderDeliveryQuery: string = readFileSync(
		resolve(join(__dirname, './sql/upsert-purchase-orders.sql')),
		'utf-8'
	)

	constructor(
		@InjectRepository(TruckloadDeliveryEntity, DATA_SOURCE_DATA_LAKE)
		private readonly deliveryRepository: Repository<TruckloadDeliveryEntity>,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_SYSCLOUD) private readonly dataSourceSC: DataSource
	) {
		super(deliveryRepository)
	}

	public override async findAll(): Promise<any> {
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

		return await this.deliveryRepository
			.createQueryBuilder('a')
			.addCommonTableExpression(deliveryDetailsCte.getQuery(), 'delivery_details')
			.select('a.dispatch_order', 'dispatch_order')
			.addSelect('a.license_plate', 'license_plate')
			.addSelect('a.container_number', 'container_number')
			.addSelect('a.factory_departure_time', 'factory_departure_time')
			.addSelect('a.approval_status', 'approval_status')
			.addSelect('a.qc_signature', 'qc_signature')
			.addSelect('a.warehouse_officer_signature', 'warehouse_officer_signature')
			.addSelect('a.security_guard_signature', 'security_guard_signature')
			.addSelect(
				/* SQL */ `(
					SELECT dd.id, dd.po, dd.brand_name, dd.factory_shoes_style, dd.color_sn, dd.outbound_qty, dd.user_code_created, dd.created
					FROM delivery_details dd
					WHERE dd.dispatch_order = a.dispatch_order
					FOR JSON PATH
				)`,
				'delivery_details'
			)
			.groupBy('a.dispatch_order')
			.addGroupBy('a.license_plate')
			.addGroupBy('a.container_number')
			.addGroupBy('a.factory_departure_time')
			.addGroupBy('a.approval_status')
			.addGroupBy('a.qc_signature')
			.addGroupBy('a.warehouse_officer_signature')
			.addGroupBy('a.security_guard_signature')
			.getRawMany<{
				dispatch_order: string
				license_plate: string
				container_number: string
				factory_departure_time: Date
				approval_status: string
				delivery_details: string
			}>()
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
}
