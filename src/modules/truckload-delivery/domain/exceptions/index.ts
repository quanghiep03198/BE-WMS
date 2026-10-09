export class DispatchOrderNotFoundException extends Error {
	constructor(dispatchOrder: string) {
		super(`Dispatch order ${dispatchOrder} not found`)
		this.name = 'DispatchOrderNotFoundException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class DispatchOrderAlreadyExistsException extends Error {
	constructor(dispatchOrder: string) {
		super(`Dispatch order ${dispatchOrder} already exists`)
		this.name = 'DispatchOrderAlreadyExistsException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class ConcurrentDispatchOrderModificationException extends Error {
	constructor(dispatchOrder: string) {
		super(`Dispatch order ${dispatchOrder} was modified by another request, please retry`)
		this.name = 'ConcurrentDispatchOrderModificationException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class EmptyDispatchOrderException extends Error {
	constructor() {
		super('Dispatch order must contain at least one purchase order')
		this.name = 'EmptyDispatchOrderException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class DuplicatePurchaseOrderException extends Error {
	constructor(po: string) {
		super(`Purchase order ${po} is duplicated in the dispatch order`)
		this.name = 'DuplicatePurchaseOrderException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class PurchaseOrderNotFoundException extends Error {
	constructor(dispatchOrder: string, po: string) {
		super(`Purchase order ${po} not found in dispatch order ${dispatchOrder}`)
		this.name = 'PurchaseOrderNotFoundException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class DispatchOrderSequenceExhaustedException extends Error {
	constructor(prefix: string) {
		super(`Daily dispatch order sequence is exhausted for ${prefix}`)
		this.name = 'DispatchOrderSequenceExhaustedException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
