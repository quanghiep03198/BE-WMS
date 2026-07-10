import { IS_PUBLIC_KEY, IS_STRICT_ROLES_KEY, ROLES_KEY } from '@common/decorators'
import { UserRole } from '@modules/user/constants'
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		// If route is public, grant access
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass()
		])
		if (isPublic) return true

		const shouldRestrictAdministrator = this.reflector.getAllAndOverride<boolean>(IS_STRICT_ROLES_KEY, [
			context.getHandler(),
			context.getClass()
		])

		const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
			context.getHandler(),
			context.getClass()
		])

		if (!requiredRoles) {
			return true
		}

		const { user } = context.switchToHttp().getRequest()
		if (!user) return false

		if (!Array.isArray(user.roles)) return false

		// * Grant access if Admin is system user
		if (user.roles.some((role) => role === UserRole.ADMIN) && (!shouldRestrictAdministrator || user.is_system_user))
			return true

		return requiredRoles.some((role) => user.roles?.includes(role))
	}
}
