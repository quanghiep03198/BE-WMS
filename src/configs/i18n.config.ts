import { env } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { AcceptLanguageResolver, HeaderResolver, type I18nOptions } from 'nestjs-i18n'
import path from 'node:path'

export const I18N_CONFIG_TOKEN = Symbol('i18n')

export default registerAs(I18N_CONFIG_TOKEN, (): I18nOptions => {
	return {
		fallbackLanguage: env('FALLBACK_LANGUAGE', { fallbackValue: 'en' }),
		loaderOptions: {
			path:
				env('NODE_ENV') === 'development'
					? path.resolve(process.cwd(), 'src', 'i18n')
					: path.resolve(process.cwd(), 'dist', 'i18n'),
			watch: env('NODE_ENV') === 'development'
		},
		typesOutputPath: path.resolve(process.cwd(), 'src', 'generated', 'i18n.generated.ts'),
		resolvers: [AcceptLanguageResolver, new HeaderResolver(['Accept-Language'])]
	}
})
