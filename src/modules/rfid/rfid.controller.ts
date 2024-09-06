import { AllExceptionsFilter } from '@/common/filters/exceptions.filter'
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Patch,
	Sse,
	UseFilters,
	UseGuards,
	UseInterceptors,
	UsePipes
} from '@nestjs/common'
import { interval, map } from 'rxjs'
import { DynamicDataSourceService } from '../_shared/services/dynamic-datasource.service'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { UpdateStockDTO, updateStockValidator } from './dto/rfid.dto'
import { RFIDService } from './rfid.service'

@Controller('rfid')
export class RFIDController {
	constructor(
		private rfidService: RFIDService,
		private dynamicDataSourceService: DynamicDataSourceService
	) {}

	@Sse('read-epc')
	@UseGuards(JwtGuard)
	@UseFilters(AllExceptionsFilter)
	async retrieveEPC() {
		const dataSource = this.dynamicDataSourceService.getDataSource()
		const responseData = await this.rfidService.findUnstoredEPC(dataSource)
		return interval(1000).pipe(map(() => ({ data: responseData })))
	}

	@Patch('update-stock')
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(updateStockValidator))
	@UseFilters(AllExceptionsFilter)
	@UseInterceptors(TransformInterceptor)
	@HttpCode(HttpStatus.CREATED)
	async updateStock(@Body() payload: UpdateStockDTO) {
		const dataSource = this.dynamicDataSourceService.getDataSource()
		return await this.rfidService.updateStock(dataSource, payload)
	}
}
