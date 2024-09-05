import { UserEntity } from '@/modules/user/entities/user.entity'
import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const User = createParamDecorator(
	(property: Exclude<keyof UserEntity, 'authenticate'>, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest()
		const user = request.user
		if (!user) {
			return null
		}
		console.log(user)
		return property ? user[property] : user
	}
)
