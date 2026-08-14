import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequireAuthorized, ResponseMessage, RouteHandler } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
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
import { Body, Controller, Headers, HttpCode, HttpStatus, Patch, Put, Query, UseFilters } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { I18n, I18nContext } from 'nestjs-i18n'
import { ExchangeMoRmCommand } from '../../application/commands/exchange-mo/impl/exchange-mo-rm.command'
import { UpsertEpcsMatchCommand } from '../../application/commands/upsert-epcs-match/upsert-epcs-match.command'
import { SearchExchangableMoQuery } from '../../application/queries/search-exchangable-mo/search-exchangable-mo.query'
import { MoExchageExceptionFilter } from '../filters/mo-exchange.filter'
import { FinishedGoodsGateway } from '../gateways/finished-goods.gateway'

@Controller('finished-goods')
export class MoExchangeController {
	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly finishedGoodsGateway: FinishedGoodsGateway
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

	@Patch('exchange-manufacturing-order')
	@HttpCode(HttpStatus.CREATED)
	@ResponseMessage('common.updated')
	@UseFilters(MoExchageExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async exchangeEpc(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Body(new ZodValidationPipe(exchangeOrderValidator)) payload: ExchangeOrderDTO,
		@I18n() i18n: I18nContext
	) {
		await this.commandBus.execute(
			new ExchangeMoRmCommand(deviceSerialNumber, payload.mo_no.split(','), payload.mo_no_actual)
		)
		this.finishedGoodsGateway.server.emit(
			'finished_goods:upserted_epcs_match:success',
			i18n.t('inoutbound.notification.exchange_mo_success', { lang: i18n.lang })
		)
	}

	@Put('upsert-epcs-match')
	@HttpCode(HttpStatus.CREATED)
	@UseFilters(MoExchageExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertEpcInformation(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Body(new ZodValidationPipe(upsertEpcInformationSchema)) payload: UpsertEpcInformationDTO,
		@I18n() i18n: I18nContext
	) {
		await this.commandBus.execute(
			new UpsertEpcsMatchCommand(
				deviceSerialNumber,
				payload.mo_no,
				payload.mo_no_actual,
				payload.mo_noseq,
				payload.size_numcode_actual,
				payload.quantity
			)
		)
		this.finishedGoodsGateway.server.emit(
			'finished_goods:upserted_epcs_match:success',
			i18n.t('inoutbound.notification.exchange_mo_success', { lang: i18n.lang })
		)
	}
}
