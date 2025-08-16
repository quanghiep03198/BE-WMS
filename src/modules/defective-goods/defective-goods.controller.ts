import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, DefaultValuePipe, HttpStatus, Param, ParseIntPipe, Query } from '@nestjs/common'
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
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('limit', new DefaultValuePipe(1), ParseIntPipe) limit: number
	) {
		return await this.defectiveGoodsService.paginate(
			{},
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
	public async insertOne(@Body(new ZodValidationPipe(createDefectiveGoodsDTO)) payload: CreateDefectiveGoodsDTO) {
		return await this.defectiveGoodsService.insertOne(payload)
		// Todo: create new resource for defective goods
	}

	@Api({
		endpoint: 'update/:id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	public async updateOne(
		@Param('id', ParseIntPipe) id: number,
		@Body(new ZodValidationPipe(updateDefectiveGoodsDTO)) payload: UpdateDefectiveGoodsDTO
	) {
		return await this.defectiveGoodsService.updateOneById(id, payload)
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
