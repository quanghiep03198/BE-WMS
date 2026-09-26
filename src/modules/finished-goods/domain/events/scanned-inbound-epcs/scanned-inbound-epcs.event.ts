/**
 * @deprecated
 */
export class ScannedInboundEpcsEvent {
	constructor(
		public readonly payload: {
			method?: string
			sn?: string
			timestamp?: string
			data: {
				id: string
				timestamp?: string
				temperature?: string
				tagList: {
					ant: number
					epc: string
					firstAnt: number
					firstTime: number
					lastTime: number
					direction?: string
					rssi?: string
				}[]
			}
		}
	) {}
}

/**
 * @deprecated
 */
export const SCANNED_INBOUND_EPCS_EVENT = Symbol('rfid.inbound.check')
