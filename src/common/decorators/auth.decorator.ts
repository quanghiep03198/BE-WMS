import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@modules/auth/guards/roles.guard'
import { UserRole } from '@modules/user/constants'
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'

export const IS_PUBLIC_KEY = Symbol('isPublic')
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const ROLES_KEY = Symbol('roles')
/**
 * @description Decorator to specify required user roles for accessing a route.
 * @param roles
 * @returns
 */
export const Roles = (...roles: Array<UserRole>) => SetMetadata(ROLES_KEY, roles)

export const IS_STRICT_ROLES_KEY = Symbol('isStrictRoles')

/**
 *
 * @returns Decorator to enforce strict role checking.
 * When applied, only the specified roles in the `RequireAuthorized` decorator are allowed access.
 * Users with the `admin` role will not be granted automatic access.
 */
export const StrictRoles = () => SetMetadata(IS_STRICT_ROLES_KEY, true)

/**
 * @description Decorator to require authentication for accessing a route.
 * It uses the JwtAuthGuard to enforce authentication.
 * @returns
 */
export const RequireAuthenticated = () => {
	return applyDecorators(UseGuards(JwtAuthGuard))
}

/**
 * @description Decorator to require specific user roles for accessing a route.
 * It uses the RolesGuard to enforce role-based access control.
 * By default, if the user has the `admin` role, they are granted access unless roles are restricted using `StrictRoles`.
 * @param {Array<UserRole>} roles
 * @returns
 */
export const RequireAuthorized = (...roles: Array<UserRole>) => {
	return applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...roles))
}
