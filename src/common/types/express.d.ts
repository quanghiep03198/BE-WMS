export module 'express' {
	export interface Response {
		flush: () => void
	}

	export interface Request {
		accessToken?: string
		factoryCode?: string
		tenancyHost?: string
		user?: Partial<UserEntity>
	}
}
