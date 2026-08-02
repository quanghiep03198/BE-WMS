// all-exceptions.filter.ts

import { ArgumentsHost, Catch } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
	constructor(private readonly logger: PinoLogger) {
		super()
	}

	catch(exception: unknown, host: ArgumentsHost) {
		this.logger.error(exception)
		super.catch(exception, host)
	}
}
