import { Injectable, PipeTransform } from '@nestjs/common'

@Injectable()
export class TransformUppercasePipe<T> implements PipeTransform<string | T, unknown> {
	transform(value: T) {
		if (typeof value !== 'string') return value
		return value.toUpperCase()
	}
}
