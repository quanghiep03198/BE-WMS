import { DispatchOrderModel } from '../../domain/models/dispatch-order.model'
import { UnflatedFilterQueryDTO } from '../dto/truckload-delivery.dto'
import { DispatchOrderView } from '../interfaces'

export interface ITruckloadDeliveryRepository {
	// * Write side - always reads from the primary node
	findByDispatchOrder(dispatchOrder: string): Promise<DispatchOrderModel | null>
	/** @throws DispatchOrderNotFoundException */
	getByDispatchOrder(dispatchOrder: string): Promise<DispatchOrderModel>
	findDispatchOrderCodesByPrefix(prefix: string): Promise<string[]>
	findLicensePlateCaptureCandidates(licensePlate: string, snapTime: Date): Promise<DispatchOrderModel[]>
	findMissingLicensePlateImage(): Promise<DispatchOrderModel[]>

	/** @throws DispatchOrderAlreadyExistsException */
	insert(model: DispatchOrderModel): Promise<void>

	/** @throws ConcurrentDispatchOrderModificationException */
	save(model: DispatchOrderModel): Promise<void>
	deleteByDispatchOrder(dispatchOrder: string): Promise<void>

	// * Read side - reads from secondary nodes
	paginate(query: UnflatedFilterQueryDTO): Promise<Pagination<DispatchOrderView>>
	findAll(query?: Omit<UnflatedFilterQueryDTO, 'page' | 'limit'>): Promise<DispatchOrderView[]>
	sumDispatchedQtyByPo(purchaseOrders: string[]): Promise<Map<string, number>>
}

export const TRUCKLOAD_DELIVERY_REPOSITORY = Symbol('ITruckloadDeliveryRepository')
