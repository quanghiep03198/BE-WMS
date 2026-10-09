export class CreatedUserEvent {
	constructor(
		public readonly username: string,
		public readonly password: string,
		public readonly createdBy: string
	) {}
}

export const CREATED_USER_EVENT = 'user.created'
