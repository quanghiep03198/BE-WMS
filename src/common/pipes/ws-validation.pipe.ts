import { Injectable, PipeTransform } from '@nestjs/common'
import { WsException } from '@nestjs/websockets'
import { ZodSchema } from 'zod'

@Injectable()
export class WsZodValidationPipe implements PipeTransform {
	constructor(private readonly schema: ZodSchema) {}

	transform(value: any) {
		try {
			return this.schema.parse(value)
		} catch (error) {
			const firstEarliestError = error?.issues?.[0]
			throw new WsException(firstEarliestError?.message)
		}
	}
}
