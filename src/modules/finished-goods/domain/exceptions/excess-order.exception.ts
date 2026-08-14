export class ExcessInboundOrderException extends Error {
	constructor(message = 'Inbound order exceeded limit', options?: ErrorOptions) {
		super(message, options)
		this.name = 'ExcessInboundOrderException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class ExcessOutboundOrderException extends Error {
	constructor(message = 'Outbound order exceeded limit', options?: ErrorOptions) {
		super(message, options)
		this.name = 'ExcessOutboundOrderException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
