import { EXCLUDED_EPC_PREFIX, INTERNAL_EPC_PREFIX } from '../constants'

export class ElectronicProductCode {
	constructor(
		private readonly code: string,
		private readonly commandNumber?: string,
		private readonly factoryShoeStyle?: string,
		private readonly color?: string,
		private readonly scannable?: boolean
	) {}

	getCode() {
		return this.code
	}

	getIsWritable() {
		return !this.code.startsWith(EXCLUDED_EPC_PREFIX)
	}

	getIsScannable() {
		return this.scannable
	}

	getIsInternal() {
		return this.code.startsWith(INTERNAL_EPC_PREFIX)
	}

	// getIsValid(value: string) {
	// 	return /^(?!E28|303429|3134).{24}$/.test(value)
	// }
}
