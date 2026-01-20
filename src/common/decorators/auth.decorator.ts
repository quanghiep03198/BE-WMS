import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { UserRoles } from '@/modules/user/constants'
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { Roles } from './roles.decorator'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const AuthGuard = (...roles: Array<UserRoles>) => {
	return applyDecorators(UseGuards(JwtAuthGuard), Roles(...roles))
}
