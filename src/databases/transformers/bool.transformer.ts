import { ValueTransformer } from 'typeorm'
export class BoolBitTransformer implements ValueTransformer {
	// To db from typeorm
	public from(value?: string | null): boolean | undefined {
		return Boolean(Number(value))
	}

	public to(value?: boolean | null): Bit | undefined {
		return value ? 1 : 0
	}
}
