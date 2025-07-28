import { Injectable, PipeTransform } from '@nestjs/common'
import { WsException } from '@nestjs/websockets'
import { ZodError, ZodSchema } from 'zod'

@Injectable()
export class WsZodValidationPipe implements PipeTransform {
	constructor(private readonly schema: ZodSchema) {}

	transform(value: any) {
		try {
			return this.schema.parse(value)
		} catch (error) {
			const firstEarliestError = (error as ZodError)?.issues?.[0]
			throw new WsException(firstEarliestError?.message)
		}
	}
}
