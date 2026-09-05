import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, ResponseMessage, RouteHandler, User } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { I18nTranslations } from '@generated/i18n.generated'
import { RecallFromStockCommand } from '@modules/finished-goods/application/commands/recall-from-stock/recall-from-stock.command'
import { RollbackStockInTxCommand } from '@modules/finished-goods/application/commands/rollback-inbound-tx/rollback-inbound-tx.command'
import { StockOutCommand } from '@modules/finished-goods/application/commands/stock-out/stock-out.command'
import { GetCurrentTxQueryFactory } from '@modules/finished-goods/application/queries/get-current-tx/get-current-tx.factory'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { StockBalancesDTO, stockBalancesValidator } from '@modules/finished-goods/presentation/dto/rfid-inbound.dto'
import { UserRole } from '@modules/user/constants'
import {
	BadRequestException,
	Body,
	Controller,
	Headers,
	HttpCode,
	HttpStatus,
	Param,
	Put,
	UnprocessableEntityException,
	UseFilters
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { omit } from 'lodash'
import { I18n, I18nContext } from 'nestjs-i18n'
import { StockInCommand } from '../../application/commands/stock-in/stock-in.command'
import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'
import { StockExceptionFilter } from '../filters/stock-exception.filter'

@Controller('finished-goods')
export class StockController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Put('stock-in')
	@HttpCode(HttpStatus.CREATED)
	@UseFilters(StockExceptionFilter)
	@ResponseMessage('inoutbound.notification.stock_in_success')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async stockIn(
		@User() user: RequestUser,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(stockBalancesValidator)) payload: StockBalancesDTO
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
		@Body(new ZodValidationPipe(stockBalancesValidator)) payload: StockBalancesDTO
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

	@RouteHandler({
		endpoint: 'transactions/:stockFlow',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK,
		message: 'common.ok'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	public async getStockTransaction(@Param('stockFlow') stockFlow: StockFlow) {
		if (stockFlow !== 'inbound' && stockFlow !== 'outbound')
			throw new BadRequestException('Invalid stock transaction type. Must be either "inbound" or "outbound".')

		return await this.queryBus.execute(GetCurrentTxQueryFactory.create(stockFlow))
	}

	@RouteHandler({
		endpoint: 'transactions/:stockFlow/:transactionId',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.ok'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	public async rollbackStockTransaction(
		@Param('stockFlow') stockFlow: StockFlow,
		@Param('transactionId') transactionId: string,
		@I18n() i18n: I18nContext<I18nTranslations>
	) {
		if (stockFlow !== 'inbound' && stockFlow !== 'outbound')
			throw new UnprocessableEntityException(i18n.t('common.unprocessable_entity'))

		if (stockFlow === 'inbound') await this.commandBus.execute(new RollbackStockInTxCommand(transactionId))
	}
}
