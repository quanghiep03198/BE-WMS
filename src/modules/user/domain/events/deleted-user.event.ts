export class DeletedUserEvent {
	constructor(public readonly usernames: string[]) {}
}

export const DELETED_USER_EVENT = 'user.deleted'
