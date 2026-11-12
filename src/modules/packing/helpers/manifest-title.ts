import { I18nService } from 'nestjs-i18n'

export function manifestTitle(i18n: I18nService, factoryCode: string, language: string, timestamp: number) {
	const date = new Date(timestamp).toISOString().slice(0, 10)
	return i18n.t('packing.titles.manifest_report', {
		lang: language,
		args: { factory: i18n.t(`factory.${factoryCode}`, { lang: language }), date }
	})
}
