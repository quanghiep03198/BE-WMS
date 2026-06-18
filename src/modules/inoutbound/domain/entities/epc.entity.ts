import { EXCLUDED_EPC_PREFIX, FALLBACK_VALUE, INTERNAL_EPC_PREFIX } from '../constants'

export class ElectronicProductCode {
	constructor(
		private readonly sku: string,
		private readonly scannable?: boolean,
		private readonly manufacturingOrder?: string,
		private readonly shoeStyle?: string,
		private readonly color?: string,
		private readonly size?: string,
		private readonly factoryProduce?: string
	) {}

	public static createFactory(
		data: Array<{
			sku: string
			scannable?: boolean
			manufacturingOrder?: string
			shoeStyle?: string
			color?: string
			size?: string
			factoryProduce?: string
		}>
	): ElectronicProductCode[] {
		return data
			.map(
				(item) =>
					new ElectronicProductCode(
						item.sku.trim(),
						item.scannable,
						item.manufacturingOrder,
						item.shoeStyle,
						item.color,
						item.size,
						item.factoryProduce
					)
			)
			.filter((item) => item.getIsWritable())
	}

	public getStockKeepingUnit() {
		return this.sku
	}

	public getManufacturingOrder() {
		return this.manufacturingOrder ?? FALLBACK_VALUE
	}

	public getFactoryProduce() {
		return this.factoryProduce ?? FALLBACK_VALUE
	}

	public getShoeStyle() {
		return this.shoeStyle ?? FALLBACK_VALUE
	}

	public getColor() {
		return this.color ?? FALLBACK_VALUE
	}

	public getSize() {
		return this.size ?? FALLBACK_VALUE
	}

	public getIsWritable() {
		return !this.sku.startsWith(EXCLUDED_EPC_PREFIX)
	}

	public getIsScannable() {
		return this.scannable
	}

	public getIsInternal() {
		return this.sku.startsWith(INTERNAL_EPC_PREFIX)
	}

	public getCanExchange(target: ElectronicProductCode) {
		if (this.getIsInternal() || target.getIsInternal()) return false
		if (!this.getIsWritable() || !target.getIsWritable()) return false
		return this.shoeStyle === target.shoeStyle && this.color === target.color && this.size
	}
}
