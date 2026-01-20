/* eslint-disable @typescript-eslint/no-unused-vars */
import { ArgumentMetadata, PipeTransform, UnprocessableEntityException } from '@nestjs/common'
import { ZodError, ZodSchema } from 'zod'

export class ZodValidationPipe implements PipeTransform {
	constructor(private readonly schema: ZodSchema) {}

	transform(value: unknown, _metadata: ArgumentMetadata) {
		try {
			return this.schema.parse(value)
		} catch (error) {
			const firstEarliestError = (error as ZodError)?.issues?.[0]
			throw new UnprocessableEntityException(error)
		}
	}
}
