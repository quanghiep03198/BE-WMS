import { RequestUser } from '@common/decorators'
import { DispatchOrderSignatureField, TruckloadDeliveryStatus } from '../../../domain/constants'

export class SignDispatchOrderCommand {
	constructor(
		public readonly dispatchOrder: string,
		public readonly signatureField: DispatchOrderSignatureField,
		public readonly signature: string,
		public readonly approvalStatus?: TruckloadDeliveryStatus | null,
		public readonly updatedBy?: RequestUser
	) {}
}
