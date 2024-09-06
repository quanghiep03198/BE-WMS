import { JwtGuard } from '@/modules/auth/guards/jwt.guard'
import { UserRoles } from '@/modules/user/constants'
import { applyDecorators, UseGuards } from '@nestjs/common'
import { Roles } from './roles.decorator'

export const UseAuth = (...roles: Array<UserRoles>) => {
	return applyDecorators(UseGuards(JwtGuard), Roles(...roles))
}
