export module 'typeorm' {
	export interface CachedResult<T = unknown> {
		identifier: string
		query: string
		time: number
		duration: number
		result: T[]
	}
}
