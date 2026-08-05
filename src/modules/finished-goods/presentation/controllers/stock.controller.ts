import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, User } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { RecallFromStockCommand } from '@modules/finished-goods/application/commands/recall-from-stock/recall-from-stock.command'
import { StockOutCommand } from '@modules/finished-goods/application/commands/stock-out/stock-out.command'
import { StockVariationDTO, stockVariationValidator } from '@modules/finished-goods/presentation/dto/rfid-inbound.dto'
import { UserRole } from '@modules/user/constants'
import { Body, Controller, Headers, HttpStatus, UseFilters } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { omit } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { StockInCommand } from '../../application/commands/stock-in/stock-in.command'
import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'
import { StockExceptionFilter } from '../filters/stock-exception.filter'

@Controller('finished-goods')
export class StockController {
	constructor(
		@InjectPinoLogger(StockController.name) private readonly logger: PinoLogger,
		private readonly commandBus: CommandBus
	) {}

	@RouteHandler({
		endpoint: 'stock-in',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@UseFilters(StockExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async stockIn(
		@User() user: RequestUser,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(stockVariationValidator)) payload: StockVariationDTO
	) {
		return await this.commandBus.execute(
			new StockInCommand({
				...payload,
				factory_code_produce: factoryCode,
				username: user.username,
				display_name: user.display_name
			})
		)
	}

	@RouteHandler({
		endpoint: 'stock-out',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@UseFilters(StockExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertStockOut(@Body(new ZodValidationPipe(upsertStockOutValidator)) payload: UpsertStockOutDTO) {
		return await this.commandBus.execute(
			new StockOutCommand(
				payload.po,
				payload.mo_no,
				payload.sizes as Array<Required<{ size_numcode: string; qty: number }>> | undefined
			)
		)
	}

	@RouteHandler({
		endpoint: 'recall',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@UseFilters(StockExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async recallFromStock(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@User() user: RequestUser,
		@Body(new ZodValidationPipe(stockVariationValidator)) payload: StockVariationDTO
	) {
		return await this.commandBus.execute(
			new RecallFromStockCommand({
				...omit(payload, ['dept_code', 'dept_name', 'storage_num', 'storage_name']),
				factory_code_produce: factoryCode,
				username: user.username,
				display_name: user.display_name
			})
		)
	}
}
