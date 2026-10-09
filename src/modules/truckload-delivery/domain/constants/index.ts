export enum TruckloadDeliveryStatus {
	PENDING = 'pending',
	CONFIRMED = 'confirmed',
	REQUEST_CHANGE = 'request_change'
}

export const DISPATCH_ORDER_SEQUENCE_LENGTH = 3

export const DISPATCH_ORDER_MAX_SEQUENCE = 999

/** Camera snapshot must fall in [container_sealing_time + 5m, factory_departure_time + 30m]. */
export const LICENSE_PLATE_CAPTURE_WINDOW = {
	AFTER_SEALING_MINUTES: 5,
	AFTER_DEPARTURE_MINUTES: 30
} as const

export const DISPATCH_ORDER_SIGNATURE_FIELDS = [
	'ie_signature',
	'warehouse_officer_signature',
	'security_1_signature',
	'security_2_signature'
] as const

export type DispatchOrderSignatureField = (typeof DISPATCH_ORDER_SIGNATURE_FIELDS)[number]

export const SIGNATURE_BUCKET_NAME = 'dispatch_order_signatures'

export const SIGNATURE_ENDPOINT = '/truckload-delivery/signatures'
