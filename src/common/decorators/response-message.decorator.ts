import { I18nPath } from '@/generated/i18n.generated'
import { SetMetadata } from '@nestjs/common'
/**
 * @description Decorator trả message về theo response body
 */
export const ResponseMessageKey = 'RESPONSE_MESSAGE_KEY' as const
export const ResponseMessage = (arg: { i18nKey: I18nPath; bindings?: Record<string, any> } | string) =>
	SetMetadata(ResponseMessageKey, arg)
