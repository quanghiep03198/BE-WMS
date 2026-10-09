import { IResponseBody } from '@common/helpers'
import { I18nTranslations } from '@generated/i18n.generated'
import {
	ConcurrentDispatchOrderModificationException,
	DispatchOrderAlreadyExistsException,
	DispatchOrderNotFoundException,
	DispatchOrderSequenceExhaustedException,
	DuplicatePurchaseOrderException,
	EmptyDispatchOrderException,
	PurchaseOrderNotFoundException
} from '@modules/truckload-delivery/domain/exceptions'
import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	ForbiddenException,
	HttpException,
	HttpStatus,
	UnauthorizedException
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt'
import { I18nContext } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

@Catch()
export class TruckloadDeliveryExceptionFilter implements ExceptionFilter {
	constructor(
		private readonly httpAdapterHost: HttpAdapterHost,
		@InjectPinoLogger(TruckloadDeliveryExceptionFilter.name) private readonly logger: PinoLogger
	) {}

	catch(exception: unknown, host: ArgumentsHost): void {
		const { httpAdapter } = this.httpAdapterHost
		const ctx = host.switchToHttp()
		const i18n = I18nContext.current<I18nTranslations>(host)
		let statusCode = HttpStatus.INTERNAL_SERVER_ERROR
		let key: string = 'common.internal_server_error'
		let httpMessage: string | undefined

		switch (true) {
			case exception instanceof DispatchOrderNotFoundException:
				statusCode = HttpStatus.NOT_FOUND
				key = 'common.truckload_delivery.exceptions.dispatch_order_not_found'
				break
			case exception instanceof PurchaseOrderNotFoundException:
				statusCode = HttpStatus.NOT_FOUND
				key = 'common.truckload_delivery.exceptions.purchase_order_not_found'
				break
			case exception instanceof DispatchOrderAlreadyExistsException:
			case exception instanceof ConcurrentDispatchOrderModificationException:
				statusCode = HttpStatus.CONFLICT
				key = 'common.truckload_delivery.exceptions.conflict'
				break
			case exception instanceof DispatchOrderSequenceExhaustedException:
				statusCode = HttpStatus.CONFLICT
				key = 'common.truckload_delivery.exceptions.sequence_exhausted'
				break
			case exception instanceof EmptyDispatchOrderException:
				statusCode = HttpStatus.BAD_REQUEST
				key = 'common.truckload_delivery.exceptions.empty_dispatch_order'
				break
			case exception instanceof DuplicatePurchaseOrderException:
				statusCode = HttpStatus.BAD_REQUEST
				key = 'common.truckload_delivery.exceptions.duplicate_purchase_order'
				break
			case exception instanceof UnauthorizedException ||
				exception instanceof TokenExpiredError ||
				exception instanceof JsonWebTokenError:
				statusCode = HttpStatus.UNAUTHORIZED
				key = 'common.unauthorized'
				break
			case exception instanceof ForbiddenException:
				statusCode = HttpStatus.FORBIDDEN
				key = 'common.forbidden'
				break
			case exception instanceof HttpException: {
				statusCode = exception.getStatus()
				const response = exception.getResponse()
				httpMessage = typeof response === 'string' ? response : exception.message
				if (statusCode === HttpStatus.NOT_FOUND) key = 'common.not_found'
				else if (statusCode === HttpStatus.CONFLICT) key = 'common.conflict'
				else if (statusCode === HttpStatus.BAD_REQUEST) key = 'common.unprocessable_entity'
				else if (statusCode < HttpStatus.INTERNAL_SERVER_ERROR) key = ''
				break
			}
			default:
				break
		}

		const message = key
			? i18n.t(key as any, { lang: i18n.lang })
			: (httpMessage ?? (exception instanceof Error ? exception.message : String(exception)))
		const responseBody: IResponseBody = {
			message,
			statusCode,
			stack: exception instanceof Error ? exception.stack : undefined,
			cause: exception instanceof Error ? exception.cause : undefined,
			timestamp: new Date().toISOString(),
			path: httpAdapter.getRequestUrl(ctx.getRequest())
		}

		if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error({ exception, responseBody })
		httpAdapter.reply(ctx.getResponse(), responseBody, statusCode)
	}
}
