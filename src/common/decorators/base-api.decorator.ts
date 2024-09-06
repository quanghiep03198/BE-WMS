import { I18nPath } from '@/generated/i18n.generated'
import { applyDecorators, HttpCode, HttpStatus, UseFilters, UseInterceptors } from '@nestjs/common'
import { AllExceptionsFilter } from '../filters/exceptions.filter'
import { TransformInterceptor } from '../interceptors/transform.interceptor'
import { ResponseMessage } from './response-message.decorator'

export const UseBaseAPI = (
	statusCode: HttpStatus,
	message: string | { i18nKey: I18nPath; bindings?: Record<string, any> }
) => {
	return applyDecorators(
		UseFilters(AllExceptionsFilter),
		UseInterceptors(TransformInterceptor),
		HttpCode(statusCode),
		ResponseMessage(message)
	)
}
