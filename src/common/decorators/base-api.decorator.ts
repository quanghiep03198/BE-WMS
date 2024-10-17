import { I18nPath } from '@/generated/i18n.generated'
import {
	applyDecorators,
	Delete,
	Get,
	Head,
	HttpCode,
	HttpStatus,
	Options,
	Patch,
	Post,
	Put,
	RequestMethod,
	UseFilters,
	UseInterceptors
} from '@nestjs/common'
import { AllExceptionsFilter } from '../filters/exceptions.filter'
import { TransformInterceptor } from '../interceptors/transform.interceptor'
import { PluralI18nPath, ResponseMessage } from './response-message.decorator'

export enum HttpMethod {
	GET = RequestMethod.GET,
	POST = RequestMethod.POST,
	PUT = RequestMethod.PUT,
	PATCH = RequestMethod.PATCH,
	DELETE = RequestMethod.DELETE,
	OPTIONS = RequestMethod.OPTIONS,
	HEAD = RequestMethod.HEAD
}

interface ApiOptions {
	endpoint?: string
	method: HttpMethod
	statusCode?: HttpStatus
	message?: (I18nPath & string) | PluralI18nPath
}

export const BASE_ROUTE = '' as const

export const Api = ({
	endpoint = BASE_ROUTE,
	method,
	statusCode = HttpStatus.OK,
	message = 'common.ok'
}: ApiOptions) => {
	const HttpRequest = (route: string) => {
		switch (method) {
			case HttpMethod.GET:
				return Get(route)
			case HttpMethod.POST:
				return Post(route)
			case HttpMethod.PUT:
				return Put(route)
			case HttpMethod.PATCH:
				return Patch(route)
			case HttpMethod.DELETE:
				return Delete(route)
			case HttpMethod.OPTIONS:
				return Options(route)
			case HttpMethod.HEAD:
				return Head(route)
		}
	}

	return applyDecorators(
		HttpRequest(endpoint),
		UseFilters(AllExceptionsFilter),
		UseInterceptors(TransformInterceptor),
		HttpCode(statusCode),
		ResponseMessage(message)
	)
}
