import { IResponseBody } from '@common/helpers'
import { I18nTranslations } from '@generated/i18n.generated'
import {
	ExcessInboundOrderException,
	ExcessOutboundOrderException
} from '@modules/finished-goods/domain/exceptions/excess-order.exception'
import { InsufficientInventoryException } from '@modules/finished-goods/domain/exceptions/insufficient-inventory.exception'
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { I18nContext } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsGateway } from '../gateways/finished-goods.gateway'

@Catch()
export class StockExceptionFilter implements ExceptionFilter {
	constructor(
		private readonly httpAdapterHost: HttpAdapterHost,
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		@InjectPinoLogger(StockExceptionFilter.name)
		private readonly logger: PinoLogger
	) {}

	catch(exception: unknown, host: ArgumentsHost) {
		const { httpAdapter } = this.httpAdapterHost
		const ctx = host.switchToHttp()
		const i18n = I18nContext.current<I18nTranslations>(host)

		let message: string = i18n.t('common.internal_server_error', { lang: i18n.lang }),
			statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
			cause: unknown = undefined,
			stack: string | undefined = undefined

		switch (true) {
			case exception instanceof ExcessInboundOrderException: {
				message = i18n.t('inoutbound.notification.over_inbound_limit', { lang: i18n.lang })
				statusCode = HttpStatus.BAD_REQUEST
				cause = exception.cause
				break
			}
			case exception instanceof ExcessOutboundOrderException: {
				message = i18n.t('inoutbound.notification.over_outbound_limit', { lang: i18n.lang })
				statusCode = HttpStatus.BAD_REQUEST
				cause = exception.cause
				stack = exception.stack
				break
			}
			case exception instanceof InsufficientInventoryException: {
				message = i18n.t('inoutbound.notification.insufficient_inventory', { lang: i18n.lang })
				statusCode = HttpStatus.BAD_REQUEST
				cause = exception.cause
				break
			}
			default:
				break
		}

		const responseBody: IResponseBody = {
			message: message,
			statusCode: statusCode,
			stack: exception instanceof Error ? exception.stack : undefined,
			cause: exception instanceof Error ? (exception as Error & { cause?: unknown }).cause : undefined,
			timestamp: new Date().toISOString(),
			path: httpAdapter.getRequestUrl(ctx.getRequest())
		}

		if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(exception)

		// const event = responseBody.path.includes('stock-in') ? 'stock:in:failed' : 'stock:recall:failed'
		// this.finishedGoodsGateway.server.emit(event, message)

		httpAdapter.reply(ctx.getResponse(), responseBody, statusCode)
	}
}
