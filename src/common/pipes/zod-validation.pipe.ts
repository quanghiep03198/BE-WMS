import { ArgumentMetadata, PipeTransform, UnprocessableEntityException } from '@nestjs/common'
import { ZodSchema } from 'zod'

export class ZodValidationPipe implements PipeTransform {
	constructor(private schema: ZodSchema) {}

	transform(value: unknown, metadata: ArgumentMetadata) {
		try {
			if (metadata.type === 'body') {
				return this.schema.parse(value)
			}
			return value
		} catch (error) {
			throw new UnprocessableEntityException(error.message)
		}
	}
}
