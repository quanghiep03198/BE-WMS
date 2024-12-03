/* eslint-disable @typescript-eslint/no-unused-vars */
import { ArgumentMetadata, PipeTransform, UnprocessableEntityException } from '@nestjs/common'
import { ZodSchema } from 'zod'

export class ZodValidationPipe implements PipeTransform {
	constructor(private schema: ZodSchema) {}

	transform(value: unknown, _metadata: ArgumentMetadata) {
		try {
			return this.schema.parse(value)
		} catch (error) {
			const firstEarliestError = error?.issues?.[0]
			throw new UnprocessableEntityException(firstEarliestError?.message)
		}
	}
}
