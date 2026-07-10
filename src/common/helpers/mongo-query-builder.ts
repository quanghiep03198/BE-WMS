import { FilterQuery } from 'mongoose'

type FieldValue<T, K extends keyof T> = T[K] extends (infer U)[] ? U : T[K]

export class MongoQueryBuilder<T extends Record<string, unknown>> {
	private query: FilterQuery<T> = {}

	protected constructor(protected readonly entry: T) {}

	public static createQueryBuilder<T extends Record<string, unknown>>(entry: T): MongoQueryBuilder<T> {
		return new MongoQueryBuilder<T>(entry)
	}

	public withEqualFields<K extends keyof T>(...fields: K[]): this {
		fields.forEach((field) => {
			if (typeof this.entry[field] !== 'undefined' && this.entry[field] !== null) {
				this.query[field] = { $eq: this.entry[field] } as FilterQuery<T>[K]
			}
		})
		return this
	}

	public withNotEqualFields = <K extends keyof T>(...fields: K[]): this => {
		fields.forEach((field) => {
			if (typeof this.entry[field] !== 'undefined' && this.entry[field] !== null) {
				this.query[field] = { $ne: this.entry[field] } as FilterQuery<T>[K]
			}
		})
		return this
	}

	public withNullishFields = <K extends keyof T>(...fields: K[]): this => {
		fields.forEach((field) => {
			this.query[field] = { $eq: null } as FilterQuery<T>[K]
		})
		return this
	}

	public withNonNullableFields = <K extends keyof T>(...fields: K[]): this => {
		fields.forEach((field) => {
			this.query[field] = { $ne: null } as FilterQuery<T>[K]
		})
		return this
	}

	public withEqualBy<K extends keyof T>(field: K, value?: FieldValue<T, K> | null | undefined): this {
		if (typeof this.entry[field] === 'undefined' || this.entry[field] === null) return this
		if (typeof value === 'undefined' || value === null) return this
		this.query[field] = { $eq: value } as FilterQuery<T>[K]
		return this
	}

	public withNotEqualBy<K extends keyof T>(field: K, value?: FieldValue<T, K> | null | undefined): this {
		if (typeof this.entry[field] === 'undefined' || this.entry[field] === null) return this
		if (typeof value === 'undefined' || value === null) return this
		this.query[field] = { $ne: value } as FilterQuery<T>[K]
		return this
	}

	public withNullBy<K extends keyof T>(field: K): this {
		this.query[field] = { $eq: null } as FilterQuery<T>[K]
		return this
	}

	public readonly withNotNullBy = <K extends keyof T>(field: K): this => {
		this.query[field] = { $ne: null } as FilterQuery<T>[K]
		return this
	}

	public withMatchRegexBy<K extends keyof T>(field: K, pattern?: string): this {
		if (typeof this.entry[field] === 'undefined' || this.entry[field] === null || this.entry[field] === '')
			return this
		if (!pattern) return this

		this.query[field] = { $regex: pattern, $options: 'i' } as FilterQuery<T>[K]

		return this
	}

	public whereIn<K extends keyof T>(field: K, values: FieldValue<T, K>[]): this {
		if (values && values.length > 0) {
			this.query[field] = { $in: values } as FilterQuery<T>[K]
		}
		return this
	}

	// * Điều kiện tùy ý, không gắn với field cụ thể — dùng để nhóm/nhánh logic phức tạp
	public when(condition: boolean, callback: (builder: this) => this): this {
		return condition ? callback(this) : this
	}

	// * Xóa hẳn field khỏi query cuối cùng theo điều kiện tùy ý (áp dụng sau khi build)
	public omitIf(field: keyof T, condition: boolean | ((query: FilterQuery<T>) => boolean)): this {
		const shouldOmit = typeof condition === 'function' ? condition(this.query) : condition
		if (shouldOmit) delete this.query[field]
		return this
	}

	public build(): FilterQuery<T> {
		return this.query
	}
}
