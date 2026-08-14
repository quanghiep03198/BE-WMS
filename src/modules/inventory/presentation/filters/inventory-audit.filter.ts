// src/presentation/filters/order-cannot-be-closed.filter.ts

import { ResponseBody } from '@common/helpers'
import { I18nTranslations } from '@generated/i18n.generated'
import {
	AlreadyCheckedOutException,
	CheckoutTimeNotElapsedException,
	SupplementalQtyExcessException
} from '@modules/inventory/domain/exceptions'
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { I18nContext } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

@Catch()
export class InventoryAuditExceptionFilter implements ExceptionFilter {
	constructor(
		@InjectPinoLogger(InventoryAuditExceptionFilter.name)
		private readonly logger: PinoLogger,
		private readonly httpAdapterHost: HttpAdapterHost
	) {}

	catch(exception: unknown, host: ArgumentsHost) {
		const { httpAdapter } = this.httpAdapterHost

		const i18n = I18nContext.current<I18nTranslations>(host)

		const ctx = host.switchToHttp()

		let message: string = i18n.t('common.internal_server_error', { lang: i18n.lang }),
			statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
			cause: unknown = undefined

		switch (true) {
			case exception instanceof CheckoutTimeNotElapsedException: {
				message = i18n.t('inventory.exceptions.time_not_elapsed', { lang: i18n.lang })
				statusCode = HttpStatus.BAD_REQUEST
				cause = exception.cause

				break
			}
			case exception instanceof AlreadyCheckedOutException: {
				message = i18n.t('inventory.exceptions.already_checkout', { lang: i18n.lang })
				statusCode = HttpStatus.CONFLICT
				cause = exception.cause
				break
			}
			case exception instanceof SupplementalQtyExcessException: {
				message = i18n.t('inventory.exceptions.supplemental_qty_excess', { lang: i18n.lang })
				statusCode = HttpStatus.BAD_REQUEST
				cause = exception.cause
				break
			}
			default:
				break
		}

		// Trả về 409 Conflict hoặc 400 Bad Request tùy quy ước
		const responseBody = new ResponseBody({
			message: message,
			statusCode: statusCode,
			stack: exception instanceof Error ? exception.stack : undefined,
			cause: exception instanceof Error ? (exception as Error & { cause?: unknown }).cause : undefined,
			timestamp: new Date().toISOString(),
			path: httpAdapter.getRequestUrl(ctx.getRequest())
		})

		if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
			this.logger.error({ exception, responseBody }, 'Inventory audit exception occurred')
		}

		httpAdapter.reply(ctx.getResponse(), responseBody, statusCode)
	}
}
