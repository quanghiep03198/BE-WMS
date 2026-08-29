import { IResponseBody } from '@common/helpers'
import { I18nTranslations } from '@generated/i18n.generated'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableEpcException
} from '@modules/finished-goods/domain/exceptions/mo-exchange-tx.exception'
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { TokenExpiredError } from '@nestjs/jwt'
import { I18nContext } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsGateway } from '../gateways/finished-goods.gateway'

@Catch()
export class MoExchageExceptionFilter implements ExceptionFilter {
	constructor(
		@InjectPinoLogger(MoExchageExceptionFilter.name)
		private readonly logger: PinoLogger,
		private readonly httpAdapterHost: HttpAdapterHost,
		private readonly finishedGoodsGateway: FinishedGoodsGateway
	) {}

	catch(exception: unknown, host: ArgumentsHost) {
		const { httpAdapter } = this.httpAdapterHost
		const ctx = host.switchToHttp()
		const i18n = I18nContext.current<I18nTranslations>(host)

		let message: string = i18n.t('inoutbound.notification.exchange_mo_failed', { lang: i18n.lang }),
			statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
			stack: string | undefined = undefined,
			cause: unknown = undefined

		switch (true) {
			case exception instanceof NoExchangableEpcException: {
				message = i18n.t('inoutbound.notification.no_exchangable_sku', { lang: i18n.lang })
				statusCode = HttpStatus.NOT_FOUND
				stack = exception.stack
				cause = exception.cause
				break
			}
			case exception instanceof MismatchingMoSpecsException: {
				message = i18n.t('inoutbound.notification.mismatching_mo_specs', { lang: i18n.lang })
				statusCode = HttpStatus.BAD_REQUEST
				stack = exception.stack
				cause = exception.cause
				break
			}
			case exception instanceof MismatchingSizeNumberException: {
				message = i18n.t('inoutbound.notification.mismatching_size_number', { lang: i18n.lang })
				statusCode = HttpStatus.BAD_REQUEST
				stack = exception.stack
				cause = exception.cause
				break
			}
			case exception instanceof TokenExpiredError: {
				message = i18n.t('common.unauthorized', { lang: i18n.lang })
				statusCode = HttpStatus.UNAUTHORIZED
				stack = exception.stack
				cause = exception.cause
				break
			}
			default:
				stack = (exception as Error).stack
				cause = (exception as Error).cause
				break
		}

		const responseBody: IResponseBody = {
			message,
			statusCode,
			stack,
			cause,
			timestamp: new Date().toISOString(),
			path: httpAdapter.getRequestUrl(ctx.getRequest())
		}
		if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(exception)

		// this.finishedGoodsGateway.server.emit('finished_goods:upserted_epcs_match:failed', message)

		httpAdapter.reply(ctx.getResponse(), responseBody, statusCode)
	}
}
