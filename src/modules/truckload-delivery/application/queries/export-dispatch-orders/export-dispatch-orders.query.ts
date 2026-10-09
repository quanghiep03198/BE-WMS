import { UnflatedFilterQueryDTO } from '../../dto/truckload-delivery.dto'

export class ExportDispatchOrdersQuery {
	constructor(
		public readonly factoryCode: string,
		public readonly filter?: Omit<UnflatedFilterQueryDTO, 'page' | 'limit'>
	) {}
}
