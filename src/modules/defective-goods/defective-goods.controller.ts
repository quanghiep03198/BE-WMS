import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { TransformUppercasePipe, ZodValidationPipe } from '@/common/pipes'
import { EventGateway } from '@/events/event.gateway'
import { Body, Controller, DefaultValuePipe, HttpStatus, Param, ParseIntPipe, Query } from '@nestjs/common'
import { isEmpty, omit } from 'lodash'
import { PostReaderDataDTO, readerPostDataValidator } from '../rfid/dto/rfid.dto'
import { UserEntity } from '../user/entities/user.entity'
import { DefectiveGoodsService } from './defective-goods.service'
import {
	CreateDefectiveGoodsDTO,
	createDefectiveGoodsDTO,
	UpdateDefectiveGoodsDTO,
	updateDefectiveGoodsDTO
} from './dto/defective-goods.dto'
import {
	UpdateInboundStatusDTO,
	updateInboundStatusDTO,
	UpdateOutboundStatusDTO,
	updateOutboundStatusDTO
} from './dto/inoutbound.dto'

@Controller('defective-goods')
export class DefectiveGoodsController {
	constructor(
		private readonly eventGateway: EventGateway,
		private readonly defectiveGoodsService: DefectiveGoodsService
	) {}

	@Api({
		endpoint: 'post-rfid-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.ok'
	})
	public postData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		this.eventGateway.server.emit(
			'def_rfid_data',
			payload.data.tagList.map((item) => item.epc)
		)
	}

	@Api({
		endpoint: '',
		method: HttpMethod.GET,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	public async get(
		@Query('q', TransformUppercasePipe) epc: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
	) {
		const filterQuery = typeof epc === 'string' && !isEmpty(epc) ? { epc: epc } : {}
		return await this.defectiveGoodsService.paginate(filterQuery, {
			page,
			limit
		})
		// Todo: create new resource for defective goods
	}
	@Api({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	public async insertOne(
		@User() user: UserEntity,
		@Body(new ZodValidationPipe(createDefectiveGoodsDTO)) payload: CreateDefectiveGoodsDTO
	) {
		if (Array.isArray(payload.epc))
			return await this.defectiveGoodsService.insertMany(
				payload.epc.map((item) => ({ epc: item, user_code_created: user.username, ...omit(payload, ['epc']) }))
			)
		if (typeof payload.epc === 'string')
			return await this.defectiveGoodsService.insertOne({
				...payload,
				epc: payload.epc,
				user_code_created: user.username
			})

		// Todo: create new resource for defective goods
	}

	@Api({
		endpoint: 'update/:id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	public async updateOne(
		@User() user: UserEntity,
		@Param('id', ParseIntPipe) id: number,
		@Body(new ZodValidationPipe(updateDefectiveGoodsDTO)) payload: UpdateDefectiveGoodsDTO
	) {
		return await this.defectiveGoodsService.updateOneById(id, { ...payload, user_code_updated: user.username })
	}

	@Api({
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT
	})
	@AuthGuard()
	public async deleteOne(@Param('id', ParseIntPipe) id: number) {
		return await this.defectiveGoodsService.deleteOneById(id)
	}

	@Api({
		method: HttpMethod.POST,
		endpoint: '/retrieve-size-qty',
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	public async retrieveSizeQty(@Body() data: string[]) {
		return await this.defectiveGoodsService.retrieveSizeQty(data)
	}

	@Api({
		method: HttpMethod.PATCH,
		endpoint: '/inbound',
		statusCode: HttpStatus.CREATED
	})
	public async updateInboundStatus(@Body(new ZodValidationPipe(updateInboundStatusDTO)) data: UpdateInboundStatusDTO) {
		return await this.defectiveGoodsService.updateInboundStatus(data)
	}

	@Api({
		method: HttpMethod.PATCH,
		endpoint: '/outbound',
		statusCode: HttpStatus.CREATED
	})
	public async updateOutboundStatus(
		@Body(new ZodValidationPipe(updateOutboundStatusDTO)) data: UpdateOutboundStatusDTO
	) {
		return await this.defectiveGoodsService.updateInboundStatus(data)
	}
}
