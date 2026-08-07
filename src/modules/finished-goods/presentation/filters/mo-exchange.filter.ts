import { I18nTranslations } from '@generated/i18n.generated'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableEpcException
} from '@modules/finished-goods/domain/exceptions/mo-exchange-tx.exception'
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsGateway } from '../gateways/finished-goods.gateway'

@Catch()
export class MoExchageExceptionFilter implements ExceptionFilter {
	constructor(
		@InjectPinoLogger(MoExchageExceptionFilter.name)
		private readonly logger: PinoLogger,
		private readonly finishedGoodsGateway: FinishedGoodsGateway
	) {}

	catch(exception: unknown, host: ArgumentsHost) {
		const i18n = I18nContext.current<I18nTranslations>(host)
		this.logger.error(exception)

		let message: string
		let status: HttpStatus

		switch (true) {
			case exception instanceof NoExchangableEpcException: {
				message = i18n.t('inoutbound.notification.no_exchangable_sku', { lang: i18n.lang })
				status = HttpStatus.NOT_FOUND
				break
			}
			case exception instanceof MismatchingMoSpecsException: {
				message = i18n.t('inoutbound.notification.mismatching_mo_specs', { lang: i18n.lang })
				status = HttpStatus.BAD_REQUEST
				break
			}
			case exception instanceof MismatchingSizeNumberException: {
				message = i18n.t('inoutbound.notification.mismatching_size_number', { lang: i18n.lang })
				status = HttpStatus.BAD_REQUEST
				break
			}
			default: {
				message = i18n.t('inoutbound.notification.exchange_mo_failed', { lang: i18n.lang })
				status = HttpStatus.INTERNAL_SERVER_ERROR
				break
			}
		}

		this.finishedGoodsGateway.server.emit('finished_goods:upserted_epcs_match:failed', message)

		throw new HttpException(message, status)
	}
}
