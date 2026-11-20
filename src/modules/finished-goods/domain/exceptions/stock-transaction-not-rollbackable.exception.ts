export class StockTransactionNotRollbackableException extends Error {
	constructor(message = 'Stock transaction can no longer be rolled back', options?: ErrorOptions) {
		super(message, options)
		this.name = 'StockTransactionNotRollbackableException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
