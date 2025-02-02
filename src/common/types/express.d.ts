export module 'express' {
	export interface Response {
		flush: () => void
	}

	export interface Request {
		tenancyHost?: string
		user?: Partial<UserEntity>
	}
}
