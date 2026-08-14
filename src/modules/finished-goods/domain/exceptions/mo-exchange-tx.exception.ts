export class NoExchangableEpcException extends Error {
	constructor(message = 'No exchangeable EPC found', options?: ErrorOptions) {
		super(message, options)
		this.name = 'NoExchangableEpcException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class NoExchangableMoException extends Error {
	constructor(message = 'No exchangeable Manufacturing Order found', options?: ErrorOptions) {
		super(message, options)
		this.name = 'NoExchangableMoException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class MismatchingMoSpecsException extends Error {
	constructor(message = "Manufacturing order's specs mismatch", options?: ErrorOptions) {
		super(message, options)
		this.name = 'MismatchingMoSpecsException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class MismatchingSizeNumberException extends Error {
	constructor(message = 'Size number mismatch', options?: ErrorOptions) {
		super(message, options)
		this.name = 'MismatchingSizeNumberException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
