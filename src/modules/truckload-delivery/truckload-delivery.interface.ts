import { DeleteResult, UpdateResult } from 'typeorm'
import { IBaseService } from '../_base/base.service.interface'
import { FactoryAgencyCode } from '../department/constants'
import {
	FilterQueryDTO,
	UpdateDeliveryDTO,
	UpdateSignatureDTO,
	UpsertPurchaseOrdersDTO
} from './dto/truckload-delivery.dto'
import { type TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'
import { TruckloadDeliveryDispatchOrder } from './types'

export type DispatchOrder = {
	created_at: Date
	dispatch_order: string
	license_plate: string | null
	container_number: string | null
	punctured_container: boolean
	smelling_container: boolean
	moist_container: boolean
	factory_departure_time: Date | null
	ie_signature: string | null
	warehouse_officer_signature: string | null
	security_guard_signature: string | null
	approval_status: string
	delivery_details:
		| string
		| Array<{
				id: number
				po: string
				brand_name: string
				factory_shoes_style: string
				color_sn: string
				outbound_qty: number
				user_code_created: string
				created: Date
		  }>
}

export interface ITruckloadDeliveryService extends IBaseService<TruckloadDeliveryEntity> {
	getDispatchOrders(filters?: FilterQueryDTO): Promise<DispatchOrder[]>
	getNextDispatchOrder(factoryCode: FactoryAgencyCode): Promise<TruckloadDeliveryDispatchOrder>
	updateDispatchOrderSignature(dispatchOrder: string, payload: UpdateSignatureDTO): Promise<UpdateResult>
	upsertPurchaseOrderDeliveries(dispatchOrder: string, payload: UpsertPurchaseOrdersDTO): Promise<any>
	bulkUpdateByDispatchOrder(dispatchOrder: string, payload: UpdateDeliveryDTO): Promise<UpdateResult>
	bulkDeleteByDispatchOrder(dispatchOrder: string): Promise<DeleteResult>
}
