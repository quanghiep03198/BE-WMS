import { IUser } from '@modules/user/user.interface'
import { createParamDecorator, ExecutionContext } from '@nestjs/common'

type UserDecoratorProperty = Extract<keyof IUser, 'id' | 'username' | 'employee_code' | 'display_name' | 'roles'>

export type RequestUser = Pick<IUser, UserDecoratorProperty>

/**
 * @description Decorator to extract user information from the request object.
 * It can return the entire user object or a specific property of the user.
 * @param property - The property of the user to extract. If not provided, the entire user object is returned.
 * @param ctx - The execution context of the request.
 * @returns The user object or the specified property of the user.
 */
export const User = createParamDecorator(
	(
		property: UserDecoratorProperty,
		ctx: ExecutionContext
	): IUser[UserDecoratorProperty] | Pick<IUser, UserDecoratorProperty> => {
		const request = ctx.switchToHttp().getRequest()
		const user = request.user
		if (!user) {
			return null
		}
		return property ? user[property] : user
	}
)
