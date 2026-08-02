/**
 * Domain interface for EPC change stream
 * Provides abstraction for real-time data streaming without exposing infrastructure details
 */
export interface IEpcChangeStream {
	/**
	 * Register a callback to be invoked when changes occur
	 */
	onChange(handler: () => void | Promise<void>): void

	/**
	 * Cleanup and close the stream connection
	 */
	close(): Promise<void>
}

export type EpcChangeStreamFilterQuery =
	| {
			'fullDocument.inbound_device_sn': string
	  }
	| {
			'fullDocument.outbound_device_sn': {
				$ne: null
			}
	  }
