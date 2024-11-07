import { HttpException, HttpStatus } from '@nestjs/common'

class FatalError extends Error {}

export interface IResponseBody {
	message: string
	statusCode: HttpStatus
	stack?: HttpException | FatalError | string
	timestamp: Date | string
	path: string
}

export class ResponseBody implements IResponseBody {
	message: string
	statusCode: HttpStatus
	stack?: HttpException | FatalError | string
	timestamp: Date | string
	path: string

	constructor({ message, statusCode, stack, timestamp, path }: IResponseBody) {
		this.message = message
		this.statusCode = statusCode
		this.stack = stack
		this.timestamp = timestamp
		this.path = path
	}
}
