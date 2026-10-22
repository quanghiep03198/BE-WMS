import { TRequestUser } from '@common/decorators'

export class UpdateContainerConditionCommand {
	constructor(
		public readonly dispatchOrder: string,
		public readonly condition: {
			punctured_container?: boolean
			smelling_container?: boolean
			moist_container?: boolean
		},
		public readonly updatedBy?: TRequestUser
	) {}
}
