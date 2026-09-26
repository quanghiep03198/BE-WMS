export class UpdateLastUseTimeEvent {
	constructor(public readonly deviceSn: string) {}
}

export const UPDATE_LAST_USE_TIME_EVENT = Symbol('rfid.reader.post_data')
