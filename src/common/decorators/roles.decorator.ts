import { UserRoles } from '@/modules/user/constants'
import { SetMetadata } from '@nestjs/common'

export const ROLES = 'roles'
export const Roles = (...roles: Array<UserRoles>) => SetMetadata(ROLES, roles)
