export class ActiveEpcsRecombinationException extends Error {
	constructor() {
		super(`Unable to activate defective goods`)
		this.name = 'ActiveEpcsRecombinationException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class StockInDeactivatedException extends Error {
	constructor() {
		super(`Cannot stock in deactivated defective goods`)
		this.name = 'StockInDeactivatedException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class DefectiveGoodsNotFound extends Error {
	constructor() {
		super('Cannot find defective goods')
		this.name = 'DefectiveGoodsNotFound'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class NoDefectiveGoodsToStockInException extends Error {
	constructor() {
		super(`No defective goods available to stock in`)
		this.name = 'NoDefectiveGoodsToStockIn'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class NoDefectiveGoodsToStockOutExcpetion extends Error {
	constructor() {
		super(`No defective goods available to stock out`)
		this.name = 'NoDefectiveGoodsToStockOut'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class NotStockedInYetException extends Error {
	constructor() {
		super(`Defective goods have not been stocked in yet`)
		this.name = 'NotStockedInYetException'
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
