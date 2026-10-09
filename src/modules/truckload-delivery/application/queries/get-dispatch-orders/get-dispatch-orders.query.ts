import { UnflatedFilterQueryDTO } from '../../dto/truckload-delivery.dto'

export class GetDispatchOrdersQuery {
	constructor(public readonly filter: UnflatedFilterQueryDTO) {}
}
