import { CommonRequestHeader } from '@common/constants'
import { RequestUser, RequireAuthorized, ResponseMessage, User } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { RecallFromStockCommand } from '@modules/finished-goods/application/commands/recall-from-stock/recall-from-stock.command'
import { StockOutCommand } from '@modules/finished-goods/application/commands/stock-out/stock-out.command'
import { StockVariationDTO, stockVariationValidator } from '@modules/finished-goods/presentation/dto/rfid-inbound.dto'
import { UserRole } from '@modules/user/constants'
import { Body, Controller, Headers, HttpCode, HttpStatus, Put, UseFilters } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { omit } from 'lodash'
import { StockInCommand } from '../../application/commands/stock-in/stock-in.command'
import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'
import { StockExceptionFilter } from '../filters/stock-exception.filter'

@Controller('finished-goods')
export class StockController {
	constructor(private readonly commandBus: CommandBus) {}

	@Put('stock-in')
	@HttpCode(HttpStatus.CREATED)
	@UseFilters(StockExceptionFilter)
	@ResponseMessage('inoutbound.notification.stock_in_success')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async stockIn(
		@User() user: RequestUser,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(stockVariationValidator)) payload: StockVariationDTO
	) {
		await this.commandBus.execute(
			new StockInCommand({
				...payload,
				factory_code_produce: factoryCode,
				username: user.username,
				display_name: user.display_name
			})
		)
	}

	@Put('stock-out')
	@HttpCode(HttpStatus.CREATED)
	@UseFilters(StockExceptionFilter)
	@ResponseMessage('inoutbound.notification.stock_out_success')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async stockOut(@Body(new ZodValidationPipe(upsertStockOutValidator)) payload: UpsertStockOutDTO) {
		await this.commandBus.execute(
			new StockOutCommand(
				payload.po,
				payload.mo_no,
				payload.sizes as Array<Required<{ size_numcode: string; qty: number }>> | undefined
			)
		)
	}

	@Put('recall')
	@HttpCode(HttpStatus.CREATED)
	@ResponseMessage('inoutbound.notification.recalled_from_stock')
	@UseFilters(StockExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async recallFromStock(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@User() user: RequestUser,
		@Body(new ZodValidationPipe(stockVariationValidator)) payload: StockVariationDTO
	) {
		await this.commandBus.execute(
			new RecallFromStockCommand({
				...omit(payload, ['dept_code', 'dept_name', 'storage_num', 'storage_name']),
				factory_code_produce: factoryCode,
				username: user.username,
				display_name: user.display_name
			})
		)
	}
}
