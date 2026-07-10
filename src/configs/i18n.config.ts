import { env } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { AcceptLanguageResolver, HeaderResolver, type I18nOptions } from 'nestjs-i18n'
import path from 'node:path'

export default registerAs(
	'i18n',
	(): I18nOptions => ({
		fallbackLanguage: env('FALLBACK_LANGUAGE', { fallbackValue: 'en' }),
		loaderOptions: {
			path: path.resolve(__dirname, '..', 'i18n'),
			watch: env('NODE_ENV') === 'development'
		},
		typesOutputPath: path.resolve(__dirname, '..', '..', 'src', 'generated', 'i18n.generated.ts'),
		resolvers: [AcceptLanguageResolver, new HeaderResolver(['Accept-Language'])]
	})
)
