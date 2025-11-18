import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { padStart } from 'lodash'
import { Between, DataSource, Repository } from 'typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { FactoryAgencyCode } from '../department/constants'
import { TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'
import type { TruckloadDeliveryDispatchOrder } from './types'

@Injectable()
export class DeliveryService extends BaseAbstractService<TruckloadDeliveryEntity> {
	constructor(
		@InjectRepository(TruckloadDeliveryEntity, DATA_SOURCE_DATA_LAKE)
		private readonly deliveryRepository: Repository<TruckloadDeliveryEntity>,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource
	) {
		super(deliveryRepository)
	}

	public override async findAll(): Promise<any> {
		// Optimized CTE with callback joins for cross-database queries
		const deliveryDetailsCte = this.dataSource
			.createQueryBuilder()
			.select('a.dispatch_order', 'dispatch_order')
			.addSelect('a.po', 'po')
			.addSelect('d.shoestyle_codefactory', 'factory_shoes_style')
			.addSelect('c.color_sn', 'color_sn')
			.addSelect('a.outbound_qty', 'outbound_qty')
			.from('DV_DATA_LAKE.dbo.dv_truckload_delivery', 'a')
			.leftJoin(
				(qb) =>
					qb
						.select(/* SQL */ `IIF(ISNULL(or_custpoone, '') = '', or_custpo, or_custpoone)`, 'po')
						.addSelect('mat_code', 'mat_code')
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

		return await this.deliveryRepository
			.createQueryBuilder('a')
			.addCommonTableExpression(deliveryDetailsCte.getQuery(), 'delivery_details')
			.select('a.dispatch_order', 'dispatch_order')
			.addSelect('a.license_plate', 'license_plate')
			.addSelect('a.container_number', 'container_number')
			.addSelect('a.user_code_created', 'user_code_created')
			.addSelect('a.created', 'created')
			.addSelect('a.factory_departure_time', 'factory_departure_time')
			.addSelect('a.status', 'status')
			.addSelect(
				/* SQL */ `(
					SELECT dd.po, dd.factory_shoes_style, dd.color_sn, dd.outbound_qty
					FROM delivery_details dd
					WHERE dd.dispatch_order = a.dispatch_order
					FOR JSON PATH
				)`,
				'delivery_details'
			)
			.groupBy('a.dispatch_order')
			.addGroupBy('a.license_plate')
			.addGroupBy('a.container_number')
			.addGroupBy('a.user_code_created')
			.addGroupBy('a.created')
			.addGroupBy('a.factory_departure_time')
			.addGroupBy('a.status')
			.getRawMany<{
				dispatch_order: string
				license_plate: string
				container_number: string
				user_code_created: string
				created: Date
				factory_departure_time: Date
				status: string
				delivery_details: string
			}>()
			.then((results) =>
				results.map((row) => ({
					...row,
					delivery_details: SuperJson.parse<
						Array<{
							po: string
							factory_shoes_style: string
							color_sn: string
							outbound_qty: number
						}>
					>(row.delivery_details, 1)
				}))
			)
	}

	public override async insertMany(payload: Partial<TruckloadDeliveryEntity>[]) {
		const entities = payload.map((item) => this.deliveryRepository.create(item))
		return await this.deliveryRepository.insert(entities)
	}

	/**
	 * @description Generates a new dispatch code in the format `DO-YYYYMMDD-XXX` where:
	 * - `DO` is a fixed prefix
	 * - `YYYYMMDD` is the create date
	 * - `XXX` daily sequential number, padded to 3 digits
	 *
	 * @returns A promise that resolves to the generated dispatch code
	 */
	public async generateDispatchCode(factoryCode: FactoryAgencyCode): Promise<TruckloadDeliveryDispatchOrder> {
		const createDate = format(new Date(), 'yyyyMMdd')

		const count: Awaited<number> = await this.deliveryRepository
			.count({
				where: {
					created: Between(
						new Date(new Date().setHours(0, 0, 0, 0)),
						new Date(new Date().setHours(23, 59, 59, 999))
					)
				},
				order: { dispatch_order: 'DESC', created: 'DESC' }
			})
			.catch(() => 0)

		const sequenceNumber = padStart((count + 1).toString(), 3, '0')
		return `${factoryCode}-EXP-${createDate}-${sequenceNumber}` satisfies TruckloadDeliveryDispatchOrder
	}
}
