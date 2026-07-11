import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, User } from '@common/decorators'
import { AllExceptionsFilter } from '@common/filters'
import { ZodValidationPipe } from '@common/pipes'
import { GetScanningEpcsQuery } from '@modules/finished-goods/application/queries/get-scanning-epcs/get-scanning-epcs.query'
import { GetScanningMosQuery } from '@modules/finished-goods/application/queries/get-scanning-mo/get-scanning-mo.query'
import { UserRole } from '@modules/user/constants'
import { Body, Controller, Get, HttpStatus, Headers as RequestHeaders, Res, UseFilters } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FastifyReply } from 'fastify'
import { pick } from 'lodash'
import { PaginateResult } from 'mongoose'
import { CreateEpcChangeStreamCommand } from '../../application/commands/create-epc-change-stream/create-epc-change-stream.command'
import { RFIDOutboundService } from '../../application/services/rfid-outbound.service'
import { ScannedOrderDetail, StockFlow } from '../../domain/types'
import { FinishedGoodsEpcDocument } from '../../infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'

@Controller('finished-goods/outbound')
export class OutboundController {
	constructor(
		private readonly rfidOutboundService: RFIDOutboundService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Get('sse')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async streamOutboundRFIDData(
		@Res()
		reply: FastifyReply & {
			sse: (data: {
				epcs: PaginateResult<FinishedGoodsEpcDocument>
				orders: ScannedOrderDetail[]
				// has_invalid: boolean
			}) => void
		}
	) {
		const stockFlow: StockFlow = 'outbound'

		const handleChange = async () => {
			const [epcs, orders] = await Promise.all([
				this.queryBus.execute(new GetScanningEpcsQuery(stockFlow, { page: 1, limit: 50 }, {})),
				this.queryBus.execute(new GetScanningMosQuery(stockFlow))
				// this.queryBus.execute(new GetInternalEpcsExistsQuery())
			])

			reply.sse({ epcs, orders })
		}
		await handleChange()
		const changeStream = await this.commandBus.execute(
			new CreateEpcChangeStreamCommand({ 'fullDocument.outbound_device_sn': { $ne: null } }, handleChange)
		)

		reply.raw.on('close', async () => {
			changeStream.removeListener('change', handleChange)
			await changeStream.close()

			reply.raw.end()
		})
	}

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
