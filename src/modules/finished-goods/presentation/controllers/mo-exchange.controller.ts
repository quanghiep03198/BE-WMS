import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableEpcException,
	NoExchangableMoException
} from '@modules/finished-goods/domain/exceptions/mo-exchange-tx.exception'
import {
	ExchangeOrderDTO,
	exchangeOrderValidator,
	UpsertEpcInformationDTO,
	upsertEpcInformationSchema
} from '@modules/finished-goods/presentation/dto/rfid-inbound.dto'
import {
	searchCustomerValidator,
	SearchCustOrderParamsDTO
} from '@modules/finished-goods/presentation/dto/rfid-shared.dto'
import { UserRole } from '@modules/user/constants'
import { Body, Controller, Headers, HttpException, HttpStatus, Query } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { I18n, I18nContext } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ExchangeMoRmCommand } from '../../application/commands/exchange-mo/impl/exchange-mo-rm.command'
import { UpsertEpcsMatchCommand } from '../../application/commands/upsert-epcs-match/upsert-epcs-match.command'
import { SearchExchangableMoQuery } from '../../application/queries/search-exchangable-mo/search-exchangable-mo.query'
import { FinishedGoodsGateway } from '../gateways/inoutbound.gateway'

@Controller('finished-goods')
export class MoExchangeController {
	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		@InjectPinoLogger(MoExchangeController.name) private readonly logger: PinoLogger
	) {}

	@RouteHandler({
		endpoint: 'search-exchangable-order',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async searchExchangableOrder(
		@Headers(CommonRequestHeader.FACTORY_CODE) factory_code: string,
		@Query(new ZodValidationPipe(searchCustomerValidator))
		queries: SearchCustOrderParamsDTO
	) {
		return await this.queryBus.execute(new SearchExchangableMoQuery(queries.q, factory_code, queries['color_sn:eq']))
	}

	@RouteHandler({
		endpoint: 'exchange-manufacturing-order',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async exchangeEpc(
		@I18n() i18n: I18nContext,
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Body(new ZodValidationPipe(exchangeOrderValidator)) payload: ExchangeOrderDTO
	) {
		try {
			return await this.commandBus.execute(
				new ExchangeMoRmCommand(deviceSerialNumber, payload.mo_no.split(','), payload.mo_no_actual)
			)
		} catch (error) {
			let message: string
			let status: HttpStatus

			switch (true) {
				case error instanceof NoExchangableEpcException: {
					message = i18n.t('inoutbound.notification.no_exchangable_sku', { lang: i18n.lang })
					status = HttpStatus.NOT_FOUND
					break
				}
				case error instanceof MismatchingMoSpecsException: {
					message = i18n.t('inoutbound.notification.mismatching_mo_specs', { lang: i18n.lang })
					status = HttpStatus.BAD_REQUEST
					break
				}
				case error instanceof MismatchingSizeNumberException: {
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

			this.finishedGoodsGateway.server.emit('exchange_mo:error', message)
			throw new HttpException(message, status)
		}
	}

	@RouteHandler({
		method: HttpMethod.PUT,
		endpoint: 'upsert-epcs-match'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertEpcInformation(
		@I18n() i18n: I18nContext,
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Body(new ZodValidationPipe(upsertEpcInformationSchema)) payload: UpsertEpcInformationDTO
	) {
		try {
			return await this.commandBus.execute(
				new UpsertEpcsMatchCommand(
					deviceSerialNumber,
					payload.mo_no,
					payload.mo_no_actual,
					payload.mo_noseq,
					payload.size_numcode_actual,
					payload.quantity
				)
			)
		} catch (error) {
			let message: string
			let status: HttpStatus

			switch (true) {
				case error instanceof NoExchangableMoException: {
					message = i18n.t('inoutbound.notification.no_exchangable_mo', { lang: i18n.lang })
					status = HttpStatus.NOT_FOUND
					break
				}
				case error instanceof MismatchingMoSpecsException: {
					message = i18n.t('inoutbound.notification.mismatching_mo_specs', { lang: i18n.lang })
					status = HttpStatus.BAD_REQUEST
					break
				}
				case error instanceof MismatchingSizeNumberException: {
					message = i18n.t('inoutbound.notification.mismatching_size_number', { lang: i18n.lang })
					status = HttpStatus.BAD_REQUEST
					break
				}
				default: {
					this.logger.error(error)
					message = i18n.t('inoutbound.notification.upsert_epc_info_failed', { lang: i18n.lang })
					status = HttpStatus.INTERNAL_SERVER_ERROR
					break
				}
			}
			this.finishedGoodsGateway.server.emit('exchange_mo:error', message)
			throw new HttpException(message, status)
		}
	}
}
