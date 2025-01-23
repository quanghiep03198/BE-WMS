export module 'express' {
	export interface Response {
		flush: () => void
	}

	export interface Request {
		dataSource?: DataSource
		user?: Partial<UserEntity>
	}
}
