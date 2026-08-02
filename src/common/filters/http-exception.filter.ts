import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'
import { IResponseBody } from '../helpers/transform-response.helper'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	constructor(
		private readonly logger: PinoLogger,
		private readonly httpAdapterHost: HttpAdapterHost
	) {}

	/**
	 *	@description Catch all exceptions and log the error
	 * @param {HttpException | Error} exception
	 * @param {ArgumentsHost} host
	 */
	// @SentryExceptionCaptured()
	catch(exception: HttpException | Error, host: ArgumentsHost): void {
		const { httpAdapter } = this.httpAdapterHost
		const ctx = host.switchToHttp()
		const httpStatus = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
		const responseBody: IResponseBody = {
			message: exception.message,
			statusCode: httpStatus,
			stack: exception.stack,
			cause: exception.cause,
			timestamp: new Date().toISOString(),
			path: httpAdapter.getRequestUrl(ctx.getRequest())
		}
		if (httpStatus === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(exception)
		httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus)
	}
}
