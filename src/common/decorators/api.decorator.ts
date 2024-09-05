import { I18nPath } from '@/generated/i18n.generated'
import { applyDecorators, HttpCode, HttpStatus, UseFilters, UseInterceptors } from '@nestjs/common'

import { AllExceptionsFilter } from '../filters/exceptions.filter'
import { TransformInterceptor } from '../interceptors/transform.interceptor'
import { ResponseMessage } from './response-message.decorator'

export const ApiHelper = (
	statusCode: HttpStatus,
	message: { i18nKey: I18nPath; bindings?: Record<string, any> } | string
) => {
	return applyDecorators(
		UseFilters(AllExceptionsFilter),
		UseInterceptors(TransformInterceptor),
		HttpCode(statusCode),
		ResponseMessage(message)
	)
}
