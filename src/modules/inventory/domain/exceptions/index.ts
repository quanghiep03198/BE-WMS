export class CheckoutTimeNotElapsedException extends Error {
	constructor(public readonly message: string = 'Checkout time is not elapsed') {
		super(message)
		this.name = 'InventoryAuditBlockedException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class AlreadyCheckedOutException extends Error {
	constructor(public readonly message: string = 'Inventory audit has already been checked out') {
		super(message)
		this.name = 'AlreadyCheckedOutException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class SupplementalQtyExcessException extends Error {
	constructor(public readonly message: string = 'Supplemental quantity exceeds order quantity') {
		super(message)
		this.name = 'SupplementalQtyExcessException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
