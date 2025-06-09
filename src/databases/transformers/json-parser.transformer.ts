import { SuperJson } from '@/common/utils'
import { ValueTransformer } from 'typeorm'

export type Bit = 0 | 1

export class JsonParserTransformer<T> implements ValueTransformer {
	// To db from typeorm
	public from(value?: string | null): T | Array<T> {
		return SuperJson.parse<T>(value)
	}

	public to(value?: string): string {
		return SuperJson.stringify(value)
	}
}
