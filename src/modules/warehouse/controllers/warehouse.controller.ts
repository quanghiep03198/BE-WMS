import { ApiHelper } from '@/common/decorators/api.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { JwtGuard } from '@/modules/auth/guards/jwt.guard'
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
	@UseGuards(JwtGuard)
	@ApiHelper(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getWarehouses(@Headers('X-User-Company') cofactorCode: string) {
		return await this.warehouseService.findAllByFactory(cofactorCode)
	}

	@Post()
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(createWarehouseValidator))
	@ApiHelper(HttpStatus.CREATED, { i18nKey: 'common.created' })
	async createWarehouse(@Headers('X-User-Company') factoryCode: string, @Body() payload: CreateWarehouseDTO) {
		const data = new WarehouseEntity({ ...payload, cofactory_code: factoryCode })
		return await this.warehouseService.insertOne(data)
	}

	@Patch(':id')
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(updateWarehouseValidator))
	@ApiHelper(HttpStatus.CREATED, { i18nKey: 'common.updated' })
	async updateWarehouse(@Param('id') id: string, @Body() payload: UpdateWarehouseDTO) {
		return await this.warehouseService.updateOneById(+id, payload)
	}

	@Delete()
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(deleteWarehouseValidator))
	@ApiHelper(HttpStatus.NO_CONTENT, { i18nKey: 'common.deleted' })
	async deleteWarehouses(@Body() payload: DeleteWarehouseDTO) {
		return await this.warehouseService.deleteMany(payload.id)
	}
}
