import { JwtGuard } from '@/modules/auth/guards/jwt.guard'
import { applyDecorators, UseGuards } from '@nestjs/common'
import { UserRoles } from '../constants/global.enum'
import { Roles } from './roles.decorator'

export const UseAuth = (...roles: Array<UserRoles>) => {
	return applyDecorators(UseGuards(JwtGuard), Roles(...roles))
}
