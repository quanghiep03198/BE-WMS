import config from './migrate-descriptions.config.mjs'

export default {
	...config,
	entry: { 'order-search': './scripts/migrate-order-search.ts' },
	output: { ...config.output, clean: false }
}
