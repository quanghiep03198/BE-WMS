import { AllExceptionsFilter } from '@/common/filters/exceptions.filter'
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters, UseInterceptors, UsePipes } from '@nestjs/common'
import { RegisterDTO, registerValidator } from './dto/user.dto'
import { UserService } from './user.service'

@Controller()
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Post('register')
	@HttpCode(HttpStatus.CREATED)
	@UseInterceptors(TransformInterceptor)
	@UseFilters(AllExceptionsFilter)
	@UsePipes(new ZodValidationPipe(registerValidator))
	async register(@Body() payload: RegisterDTO) {
		return await this.userService.createUser(payload)
	}
}
