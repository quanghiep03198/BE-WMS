import { AggregateRoot } from '@nestjs/cqrs'
import { EXCLUDED_EPC_PREFIX, FALLBACK_VALUE, INTERNAL_EPC_PREFIX } from '../constants'

export class ElectronicProductCode extends AggregateRoot {
	constructor(
		private readonly productCode: string,
		private readonly scannable?: boolean,
		private readonly commandNumber?: string,
		private readonly shoeStyle?: string,
		private readonly color?: string,
		private readonly size?: string,
		private readonly factoryProduce?: string
	) {
		super()
		this.autoCommit = true
	}

	public static createFactory(
		data: Array<{
			epc?: string
		}>
	): ElectronicProductCode[] {
		return data.map((item) => new ElectronicProductCode(item.epc.trim())).filter((item) => item.getIsWritable())
	}

	public getProductCode() {
		return this.productCode
	}

	public getCommandNumber() {
		return this.commandNumber ?? FALLBACK_VALUE
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
		return !this.productCode.startsWith(EXCLUDED_EPC_PREFIX)
	}

	public getIsScannable() {
		return this.scannable
	}

	public getIsInternal() {
		return this.productCode.startsWith(INTERNAL_EPC_PREFIX)
	}

	public getCanExchange(target: ElectronicProductCode) {
		if (this.getIsInternal() || target.getIsInternal()) return false
		if (!this.getIsWritable() || !target.getIsWritable()) return false
		return this.shoeStyle === target.shoeStyle && this.color === target.color && this.size
	}
}
