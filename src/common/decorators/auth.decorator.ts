import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { UserRole } from '@/modules/user/constants'
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { Roles } from './roles.decorator'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const AuthGuard = (...roles: Array<UserRole>) => {
	return applyDecorators(UseGuards(JwtAuthGuard), Roles(...roles))
}
