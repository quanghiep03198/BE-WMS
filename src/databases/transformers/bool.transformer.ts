import { ValueTransformer } from 'typeorm'
import { RecordStatus } from '../constants'

export type Bit = 0 | 1

export class BoolBitTransformer implements ValueTransformer {
	// To db from typeorm
	public from(value?: string | null): boolean | undefined {
		return Boolean(Number(value))
	}

	public to(value?: boolean | null): Bit | undefined {
		return value ? 1 : 0
	}
}

export class StringToBoolTransformer implements ValueTransformer {
	public from(value: RecordStatus): boolean {
		return value === RecordStatus.ACTIVE
	}

	public to(value: boolean) {
		console.log('value', value)
		return value ? RecordStatus.ACTIVE : RecordStatus.INACTIVE
	}
}
