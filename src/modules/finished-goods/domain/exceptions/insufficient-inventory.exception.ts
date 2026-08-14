export class InsufficientInventoryException extends Error {
	constructor(message = 'Insufficient inventory', options?: ErrorOptions) {
		super(message, options)
		this.name = 'InsufficientInventoryException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
