import { I18nPath } from '@/generated/i18n.generated'
import { SetMetadata } from '@nestjs/common'

export interface PluralI18nPath {
	i18nKey: I18nPath
	bindings?: Record<string, any>
}

/**
 * @description Decorator trả message về theo response body
 */
export const ResponseMessageKey = 'RESPONSE_MESSAGE_KEY' as const
export const ResponseMessage = (arg: (I18nPath & string) | PluralI18nPath) => SetMetadata(ResponseMessageKey, arg)
