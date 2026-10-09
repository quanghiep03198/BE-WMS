import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { format } from 'date-fns'
import orderBy from 'lodash/orderBy'
import { DispatchOrderListItem } from '../../interfaces'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { GetDispatchOrdersQuery } from './get-dispatch-orders.query'

@QueryHandler(GetDispatchOrdersQuery)
export class GetDispatchOrdersHandler implements IQueryHandler<
	GetDispatchOrdersQuery,
	Pagination<DispatchOrderListItem>
> {
	constructor(@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository) {}

	async execute({ filter }: GetDispatchOrdersQuery): Promise<Pagination<DispatchOrderListItem>> {
		const result = await this.repository.paginate(filter)
		return {
			...result,
			data: result.data.map((view): DispatchOrderListItem => ({
				...view,
				packing: orderBy(view.packing, (item) => format(new Date(item.created_at), 'yyyy-MM-dd HH:mm:ss'), ['asc']),
				actual_snap_time: view.license_plate_capture_time,
				actual_departure_time: view.license_plate_capture_time ?? view.factory_departure_time
			}))
		}
	}
}
