import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { User } from '@/common/decorators/user.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Controller, Param, UseGuards, UsePipes } from '@nestjs/common'
import { AuthService } from './auth.service'
import { loginValidator } from './dto/auth.dto'
import { LocalAuthGuard } from './guards/local-auth.guard'

@Controller()
export class AuthController {
	constructor(private authService: AuthService) {}

	@Api({
		endpoint: 'login',
		method: HttpMethod.POST
	})
	@UseGuards(LocalAuthGuard)
	@UsePipes(new ZodValidationPipe(loginValidator))
	async login(@User() user) {
		return await this.authService.login(user)
	}

	@Api({
		endpoint: 'refresh-token/:id',
		method: HttpMethod.GET
	})
	async refreshToken(@Param('id') id: number) {
		return await this.authService.refreshToken(id)
	}

	@Api({
		endpoint: 'logout',
		method: HttpMethod.POST
	})
	@AuthGuard()
	async logout(@User('id') userId) {
		return await this.authService.logout(userId)
	}
}
