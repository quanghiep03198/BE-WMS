import { ResponseMessageKey } from '@/common/decorators/response-message.decorator'
import { I18nPath } from '@/generated/i18n.generated'
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { HttpAdapterHost, Reflector } from '@nestjs/core'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface Response<T> {
	metadata: T
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
	constructor(
		private reflector: Reflector,
		private httpAdapterHost: HttpAdapterHost,
		private i18nService: I18nService
	) {}
	intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
		const responseMessage =
			this.reflector.get<string | { i18nKey: I18nPath; bindings?: Record<string, any> }>(
				ResponseMessageKey,
				context.getHandler()
			) ?? ''
		const { httpAdapter } = this.httpAdapterHost
		const message = typeof responseMessage === 'string' ? responseMessage : responseMessage.i18nKey
		const messageBindings = typeof responseMessage === 'string' ? {} : responseMessage.bindings
		return next.handle().pipe(
			map((metadata) => ({
				metadata,
				statusCode: context.switchToHttp().getResponse().statusCode,
				message: this.i18nService.t(message, {
					lang: I18nContext.current().lang,
					defaultValue: message,
					...messageBindings
				}),
				timestamp: new Date().toISOString(),
				path: httpAdapter.getRequestUrl(context.switchToHttp().getRequest())
			}))
		)
	}
}
