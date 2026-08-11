import { I18nTranslations } from '@generated/i18n.generated'
import {
	ExcessInboundOrderException,
	ExcessOutboundOrderException
} from '@modules/finished-goods/domain/exceptions/excess-order.exception'
import { InsufficientInventoryException } from '@modules/finished-goods/domain/exceptions/insufficient-inventory.exception'
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsGateway } from '../gateways/finished-goods.gateway'

@Catch(ExcessInboundOrderException, ExcessOutboundOrderException, InsufficientInventoryException)
export class StockExceptionFilter implements ExceptionFilter {
	constructor(
		@InjectPinoLogger(StockExceptionFilter.name)
		private readonly logger: PinoLogger,
		private readonly finishedGoodsGateway: FinishedGoodsGateway
	) {}

	catch(exception: unknown, host: ArgumentsHost) {
		const i18n = I18nContext.current<I18nTranslations>(host)
		this.logger.error(exception)

		let message: string = i18n.t('common.internal_server_error', { lang: i18n.lang }),
			status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
			cause: unknown = undefined

		switch (true) {
			case exception instanceof ExcessInboundOrderException: {
				message = i18n.t('inoutbound.notification.over_inbound_limit', { lang: i18n.lang })
				status = HttpStatus.BAD_REQUEST
				cause = exception.cause
				break
			}
			case exception instanceof ExcessOutboundOrderException: {
				message = i18n.t('inoutbound.notification.over_outbound_limit', { lang: i18n.lang })
				status = HttpStatus.BAD_REQUEST
				cause = exception.cause
				break
			}
			case exception instanceof InsufficientInventoryException: {
				message = i18n.t('inoutbound.notification.insufficient_inventory', { lang: i18n.lang })
				status = HttpStatus.BAD_REQUEST
				cause = exception.cause
				break
			}
			default:
				break
		}
		this.finishedGoodsGateway.server.emit('stock:update-variation:failed', message)
		throw new HttpException(message, status, { cause })
	}
}
