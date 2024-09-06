import { SetMetadata } from '@nestjs/common'
import { UserRoles } from '../constants/global.enum'

export const ROLES = 'roles'
export const Roles = (...roles: Array<UserRoles>) => SetMetadata(ROLES, roles)
