import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, User } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { RecallFromStockCommand } from '@modules/finished-goods/application/commands/recall-from-stock/recall-from-stock.command'
import { ExcessInboundOrderException } from '@modules/finished-goods/domain/exceptions/excess-order.exception'
import { InsufficientInventoryException } from '@modules/finished-goods/domain/exceptions/insufficient-inventory.exception'
import { StockVariationDTO, stockVariationValidator } from '@modules/finished-goods/presentation/dto/rfid-inbound.dto'
import { UserRole } from '@modules/user/constants'
import { BadRequestException, Body, Controller, Headers, HttpStatus } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { omit } from 'lodash'
import { I18n, I18nContext } from 'nestjs-i18n'
import { StockInCommand } from '../../application/commands/stock-in/stock-in.command'
import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'

@Controller('finished-goods')
export class StockController {
	constructor(private readonly commandBus: CommandBus) {}

	@RouteHandler({
		endpoint: 'stock-in',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async stockIn(
		@User() user: RequestUser,
		@I18n() i18n: I18nContext,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(stockVariationValidator)) payload: StockVariationDTO
	) {
		try {
			return await this.commandBus.execute(
				new StockInCommand({
					...payload,
					factory_code_produce: factoryCode,
					username: user.username,
					display_name: user.display_name
				})
			)
		} catch (error) {
			if (error instanceof ExcessInboundOrderException) {
				const message = i18n.t('inoutbound.notification.over_inbound_limit', { lang: i18n.lang })
				throw new BadRequestException(message, { cause: error.cause })
			}

			throw error
		}
	}

	@RouteHandler({
		endpoint: 'stock-out',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertStockOut(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@User() user: RequestUser,
		@Body(new ZodValidationPipe(upsertStockOutValidator)) payload: UpsertStockOutDTO
	) {
		// return await this.commandBus.execute(new StockOutCommand())
	}

	@RouteHandler({
		endpoint: 'recall',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async recallFromStock(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@User() user: RequestUser,
		@Body(new ZodValidationPipe(stockVariationValidator)) payload: StockVariationDTO,
		@I18n() i18n: I18nContext
	) {
		try {
			return await this.commandBus.execute(
				new RecallFromStockCommand({
					...omit(payload, ['dept_code', 'dept_name', 'storage_num', 'storage_name']),
					factory_code_produce: factoryCode,
					username: user.username,
					display_name: user.display_name
				})
			)
		} catch (error) {
			if (error instanceof InsufficientInventoryException)
				// TODO: Add declaration for the translation key in the i18n files
				throw new BadRequestException(i18n.t('inoutbound.notification.out_of_order', { lang: i18n.lang }), {
					cause: error.cause
				})

			throw error
		}
	}
}
