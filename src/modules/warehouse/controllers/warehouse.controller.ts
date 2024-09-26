import { UseBaseAPI } from '@/common/decorators/base-api.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpStatus,
	Param,
	Patch,
	Post,
	UseGuards,
	UsePipes
} from '@nestjs/common'
import {
	CreateWarehouseDTO,
	createWarehouseValidator,
	DeleteWarehouseDTO,
	deleteWarehouseValidator,
	UpdateWarehouseDTO,
	updateWarehouseValidator
} from '../dto/warehouse.dto'
import { WarehouseEntity } from '../entities/warehouse.entity'
import { WarehouseService } from '../services/warehouse.service'

@Controller('warehouse')
export class WarehouseController {
	constructor(private warehouseService: WarehouseService) {}
	@Get()
	@UseGuards(JwtAuthGuard)
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getWarehouses(@Headers('X-User-Company') cofactorCode: string) {
		return await this.warehouseService.findAllByFactory(cofactorCode)
	}

	@Get(':warehouseCode')
	@UseGuards(JwtAuthGuard)
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getOneByWarehouseCode(@Param('warehouseCode') cofactorCode: string) {
		return await this.warehouseService.findOneByWarehouseCode(cofactorCode)
	}

	@Post()
	@UseGuards(JwtAuthGuard)
	@UsePipes(new ZodValidationPipe(createWarehouseValidator))
	@UseBaseAPI(HttpStatus.CREATED, { i18nKey: 'common.created' })
	async createWarehouse(@Headers('X-User-Company') factoryCode: string, @Body() payload: CreateWarehouseDTO) {
		const data = new WarehouseEntity({ ...payload, cofactory_code: factoryCode })
		return await this.warehouseService.insertOne(data)
	}

	@Patch(':id')
	@UseGuards(JwtAuthGuard)
	@UsePipes(new ZodValidationPipe(updateWarehouseValidator))
	@UseBaseAPI(HttpStatus.CREATED, { i18nKey: 'common.updated' })
	async updateWarehouse(@Param('id') id: string, @Body() payload: UpdateWarehouseDTO) {
		return await this.warehouseService.updateOneById(+id, payload)
	}

	@Delete()
	@UseGuards(JwtAuthGuard)
	@UsePipes(new ZodValidationPipe(deleteWarehouseValidator))
	@UseBaseAPI(HttpStatus.NO_CONTENT, { i18nKey: 'common.deleted' })
	async deleteWarehouses(@Body() payload: DeleteWarehouseDTO) {
		return await this.warehouseService.deleteMany(payload.id)
	}
}
