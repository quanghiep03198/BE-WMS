export class ElectronicProductCode {
	private readonly EXCLUDED_EPC_PREFIX = '303429'
	private readonly INTERNAL_EPC_PREFIX = 'E28'

	constructor(public readonly value: string) {
		this.value = value
	}

	getIsWritable() {
		return !this.value.startsWith(this.EXCLUDED_EPC_PREFIX)
	}

	getIsInternal() {
		return this.value.startsWith(this.INTERNAL_EPC_PREFIX)
	}

	// getIsValid(value: string) {
	// 	return /^(?!E28|303429|3134).{24}$/.test(value)
	// }
}
