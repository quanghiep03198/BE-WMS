import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, Scope } from '@nestjs/common'
import { Request, Response } from 'express'
import { Observable } from 'rxjs'
import { DataSource } from 'typeorm'

@Injectable({ scope: Scope.REQUEST })
export class TenancyInterceptor implements NestInterceptor {
	private readonly logger = new Logger(TenancyInterceptor.name)

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const ctx = context.switchToHttp()
		const request: Request = ctx.getRequest()
		const response: Response = ctx.getResponse()

		const dataSource: DataSource = request['dataSource'] // Assuming dataSource is attached to request

		// Check if this is an SSE request
		const isSSE = request.headers.accept && request.headers.accept === 'text/event-stream'

		if (isSSE) {
			// For SSE: Handle dataSource cleanup differently
			response.on('close', async () => {
				if (dataSource) {
					this.logger.log('Closing SSE connection and destroying database conneciton...')
					await dataSource.destroy() // Destroy the dataSource when the SSE connection is closed
				}
			})
		} else {
			// For normal HTTP requests: Handle the finish event
			response.on('finish', async () => {
				if (dataSource) {
					this.logger.log('Destroying database connection after HTTP request...')
					await dataSource.destroy() // Destroy the dataSource after the response is sent
				}
			})
		}

		return next.handle()
	}
}
