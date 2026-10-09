import { IUser } from '@modules/user/domain/interfaces'
import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { ParseObjectIdPipe } from '@nestjs/mongoose'

type UserDecoratorProperty = Extract<keyof IUser, '_id' | 'username' | 'display_name' | 'roles'>

export type RequestUser = Pick<IUser, UserDecoratorProperty>

/**
 * @description Decorator to extract user information from the request object.
 * It can return the entire user object or a specific property of the user.
 * `_id` is automatically parsed into a `Types.ObjectId` via `ParseObjectIdPipe`.
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
		if (!user) return null
		const _id = new ParseObjectIdPipe().transform(user._id)
		Object.assign(user, { _id })
		if (!property) return user
		if (property === '_id') return _id
		return user[property]
	}
)
