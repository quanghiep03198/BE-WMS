import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { TransformUppercasePipe, ZodValidationPipe } from '@/common/pipes'
import { EventGateway } from '@/events/event.gateway'
import {
	Body,
	ConflictException,
	Controller,
	DefaultValuePipe,
	HttpStatus,
	Param,
	ParseIntPipe,
	Query
} from '@nestjs/common'
import { isEmpty, isNil, omit, pickBy } from 'lodash'
import { Between, Like } from 'typeorm'

import { RecordStatus } from '@/databases/constants'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { PostReaderDataDTO, readerPostDataValidator } from '../rfid/dto/rfid-shared.dto'
import { UserEntity } from '../user/entities/user.entity'
import { DefectiveGoodsService } from './defective-goods.service'
import {
	CreateDefectiveGoodsDTO,
	createDefectiveGoodsDTO,
	DeleteManyDefectiveGoodsDTO,
	deleteManyDefectiveGoodsDTO,
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
		private readonly i18nService: I18nService,
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
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	public async get(
		@Query('epc', TransformUppercasePipe) epc: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
		@Query('brand_name', new DefaultValuePipe(''), TransformUppercasePipe) brand_name: string,
		@Query('category', new DefaultValuePipe(''), TransformUppercasePipe) category: string,
		@Query('factory_shoes_style', new DefaultValuePipe(''), TransformUppercasePipe) factory_shoes_style: string,
		@Query('cust_shoes_style') cust_shoes_style: string,
		@Query('po') po: string,
		@Query('mo_no', new DefaultValuePipe(''), TransformUppercasePipe) mo_no: string,
		@Query('size_code', TransformUppercasePipe) size_code: string,
		@Query('created') created: string | undefined
	) {
		const filterQuery = pickBy(
			{
				brand_name,
				category,
				factory_shoes_style,
				cust_shoes_style,
				po,
				mo_no,
				size_code
			},
			(item) => !isEmpty(item) && !isNil(item)
		)

		return await this.defectiveGoodsService.paginate(
			{
				is_active: RecordStatus.ACTIVE,
				...filterQuery,
				...(epc && { epc: Like(`%${epc}%`) }),
				...(created && {
					created: Between(
						new Date(new Date(created).setHours(0, 0, 0, 0)),
						new Date(new Date(created).setHours(23, 59, 59, 999))
					)
				})
			},
			{
				page,
				limit
			}
		)
		// Todo: create new resource for defective goods
	}
	@Api({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	public async create(
		@User() user: UserEntity,
		@Body(new ZodValidationPipe(createDefectiveGoodsDTO)) payload: CreateDefectiveGoodsDTO
	) {
		const isActiveEpcsExist: Awaited<boolean> = await this.defectiveGoodsService.checkActiveEpcsExist(payload.epc)
		if (isActiveEpcsExist)
			throw new ConflictException(
				this.i18nService.t('defective-goods.active_epcs_recombination_conflict', {
					lang: I18nContext.current()?.lang
				})
			)

		if (Array.isArray(payload.epc)) {
			return await this.defectiveGoodsService.insertMany(
				payload.epc.map((item) => ({ epc: item, user_code_created: user.username, ...omit(payload, ['epc']) }))
			)
		}
		if (typeof payload.epc === 'string') {
			return await this.defectiveGoodsService.insertOne({
				...payload,
				epc: payload.epc,
				user_code_created: user.username
			})
		}
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
		endpoint: 'delete',
		method: HttpMethod.POST,
		statusCode: HttpStatus.NO_CONTENT
	})
	@AuthGuard()
	public async deleteMany(@Body(new ZodValidationPipe(deleteManyDefectiveGoodsDTO)) ids: DeleteManyDefectiveGoodsDTO) {
		return await this.defectiveGoodsService.deleteMany(ids)
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
	public async updateInboundStatus(
		@Body(new ZodValidationPipe(updateInboundStatusDTO.partial())) data: UpdateInboundStatusDTO
	) {
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
		return await this.defectiveGoodsService.updateOutboundStatus(data)
	}

	@Api({
		method: HttpMethod.GET,
		endpoint: '/inventory',
		statusCode: HttpStatus.OK
	})
	async getDefectiveGoodsInventory() {
		return await this.defectiveGoodsService.getDefectiveGoodsInventory()
	}
}
