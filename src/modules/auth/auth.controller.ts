import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { ResponseMessage } from '@/common/decorators/response-message.decorator'
import { AllExceptionsFilter } from '@/common/filters/exceptions.filter'
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Patch,
	Post,
	UseFilters,
	UseGuards,
	UseInterceptors,
	UsePipes
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { loginValidator, UpdateProfileDTO, updateProfileValidator } from './dto/auth.dto'
import { JwtGuard } from './guards/jwt.guard'
import { LocalAuthGuard } from './guards/local-auth.guard'

@Controller()
export class AuthController {
	constructor(private authService: AuthService) {}

	@Post('login')
	@UseGuards(LocalAuthGuard)
	@UsePipes(new ZodValidationPipe(loginValidator))
	@UseFilters(AllExceptionsFilter)
	@UseInterceptors(TransformInterceptor)
	@HttpCode(HttpStatus.OK)
	@ResponseMessage('Logged in successfully')
	async login(@CurrentUser() user) {
		return await this.authService.login(user)
	}

	@Get('profile')
	@UseGuards(JwtGuard)
	@UseFilters(AllExceptionsFilter)
	@UseInterceptors(TransformInterceptor)
	@HttpCode(HttpStatus.OK)
	@ResponseMessage('Successfully')
	async getProfile(@CurrentUser() user) {
		return user
	}

	@Patch('profile/update')
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(updateProfileValidator))
	@UseFilters(AllExceptionsFilter)
	@UseInterceptors(TransformInterceptor)
	@HttpCode(HttpStatus.CREATED)
	@ResponseMessage('Updated profile')
	async updateProfile(@CurrentUser('id') userId: number, @Body() payload: UpdateProfileDTO) {
		return await this.authService.updateProfile(userId, payload)
	}
}
