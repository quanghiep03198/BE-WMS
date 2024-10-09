import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { UserRoles } from '@/modules/user/constants'
import { applyDecorators, UseGuards } from '@nestjs/common'
import { Roles } from './roles.decorator'

export const AuthGuard = (...roles: Array<UserRoles>) => {
	return applyDecorators(UseGuards(JwtAuthGuard), Roles(...roles))
}
