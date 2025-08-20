import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { TransformUppercasePipe, ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, DefaultValuePipe, HttpStatus, Param, ParseIntPipe, Query } from '@nestjs/common'
import { isEmpty } from 'lodash'
import { UserEntity } from '../user/entities/user.entity'
import { DefectiveGoodsService } from './defective-goods.service'
import {
	CreateDefectiveGoodsDTO,
	createDefectiveGoodsDTO,
	UpdateDefectiveGoodsDTO,
	updateDefectiveGoodsDTO
} from './dto/defective-goods.dto'

@Controller('defective-goods')
export class DefectiveGoodsController {
	constructor(private readonly defectiveGoodsService: DefectiveGoodsService) {}

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
		return await this.defectiveGoodsService.insertOne({ ...payload, user_code_created: user.username })
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
}
