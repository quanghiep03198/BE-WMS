import 'dotenv/config'

export default function env<T>(
	key: keyof ProcessEnv,
	options?: { serialize?: (value: string) => T; fallbackValue?: any }
) {
	const value = process.env[key]
	if (!value) {
		if (options?.fallbackValue) return options.fallbackValue
		return null
	}
	if (typeof options?.serialize === 'function') {
		return options.serialize(value) as T
	}
	return value.trim()
}
