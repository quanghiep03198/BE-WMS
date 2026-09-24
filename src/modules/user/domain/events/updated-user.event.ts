export class UpdatedUserEvent {
	constructor(
		public readonly username: string,
		public readonly update: {
			password?: string
			is_active?: boolean
			user_code_updated?: string
			user_name_updated?: string
		}
	) {}
}

export const UPDATED_USER_EVENT = 'user.updated'
