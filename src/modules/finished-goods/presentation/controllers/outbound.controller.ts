import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, User } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { UserRole } from '@modules/user/constants'
import { Body, Controller, HttpStatus, Headers as RequestHeaders } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { pick } from 'lodash'
import { RFIDOutboundService } from '../../application/services/rfid-outbound.service'
import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'

@Controller('finished-goods/outbound')
export class OutboundController {
	constructor(
		private readonly rfidOutboundService: RFIDOutboundService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@RouteHandler({
		endpoint: 'stock-out',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertStockOut(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@User() user: RequestUser,
		@Body(new ZodValidationPipe(upsertStockOutValidator)) payload: UpsertStockOutDTO
	) {
		return await this.rfidOutboundService.upsertStockOut(factoryCode, {
			...payload,
			...pick(user, ['username', 'display_name'])
		})
	}
}
