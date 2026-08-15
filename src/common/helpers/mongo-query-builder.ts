import { FilterQuery, PipelineStage } from 'mongoose'

/**
 * Infers the value type of a field — if the field is an array, returns the
 * element type (used for $in, $nin, $all...)
 */
type FieldValue<T extends Record<string, any>, K extends keyof T> = T[K] extends (infer U)[] ? U : T[K]

type Nullable<V> = V | null | undefined
type ComparableValue = string | number | Date

/**
 * Query builder that produces a FilterQuery for Mongoose, usable both for
 * `find()` and as a `$match` stage in an aggregation pipeline.
 *
 * Key changes compared to the original version:
 * 1) FIXED BUG: whereGreaterOrEqual/whereLessOrEqual previously used $gt/$lt
 *    by mistake instead of $gte/$lte.
 * 2) FIXED BUG: setting a field now merges the operator instead of
 *    overwriting the whole field → allows combining $gte + $lte on the SAME
 *    field (e.g. filtering a date range). Previously, calling
 *    whereLessOrEqual after whereGreaterOrEqual would wipe out the $gte
 *    condition set earlier.
 * 3) Comparison operators (whereEqual, whereNotEqual, whereGreaterThan,
 *    whereGreaterOrEqual, whereLessThan, whereLessOrEqual) now resolve their
 *    value with "explicit value wins, entry is the fallback": if `value` is
 *    passed and is not null/undefined, it's used as-is; otherwise the method
 *    falls back to `entry[field]`. Only skipped when BOTH are absent. This
 *    replaces the original behavior, which silently skipped the condition
 *    whenever `entry[field]` was missing even if a valid `value` was passed.
 * 4) whereLike: automatically escapes regex special characters (avoids
 *    runtime errors / regex injection when the pattern comes from user
 *    input), drops the meaningless 'g' flag, defaults to case-insensitive.
 * 5) Added: whereBetween, whereNotIn, whereExists, whereContains,
 *    whereAnyContains (OR search across multiple fields),
 *    whereArrayContainsAll, whereArraySize, whereOr, whereAnd, raw()
 *    (escape hatch), isEmpty(), toMatchStage() (dynamic $match stage for
 *    aggregation pipelines).
 */
export class MongoQueryBuilder<T extends Record<string, any>> {
	private query: FilterQuery<T> = {}
	private orGroups: FilterQuery<T>[] = []
	private andGroups: FilterQuery<T>[] = []

	protected constructor(protected readonly entry: Partial<T> = {}) {}

	public static from<T extends Record<string, any>>(entry: Partial<T> = {}): MongoQueryBuilder<T> {
		return new MongoQueryBuilder<T>(entry)
	}

	// ==================== Internal helpers ====================

	private isPresent(value: unknown): boolean {
		return typeof value !== 'undefined' && value !== null
	}

	/** Escapes special characters so the string is safe to use in a RegExp (prevents regex injection) */
	private static escapeRegex(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	/**
	 * Resolves the value to use for a comparison operator: the explicitly
	 * passed `value` wins if present, otherwise falls back to `entry[field]`.
	 */
	private resolveValue<K extends keyof T, V>(field: K, value: Nullable<V>): Nullable<V> {
		if (this.isPresent(value)) return value
		const fallback = this.entry[field]
		return this.isPresent(fallback) ? (fallback as unknown as V) : undefined
	}

	/** Merges an operator into the existing field instead of overwriting the whole field (key bug fix) */
	private setOperator<K extends keyof T>(field: K, operator: string, value: unknown): this {
		const existing = this.query[field]
		this.query[field] = {
			...(typeof existing === 'object' && existing !== null ? existing : {}),
			[operator]: value
		} as FilterQuery<T>[K]
		return this
	}

	// ==================== Conditions based on `entry` (constructor object) ====================

	public whereFieldsAreEqual<K extends keyof T>(...fields: K[]): this {
		fields.forEach((field) => {
			if (this.isPresent(this.entry[field])) this.setOperator(field, '$eq', this.entry[field])
		})
		return this
	}

	public withNotEqualFields<K extends keyof T>(...fields: K[]): this {
		fields.forEach((field) => {
			if (this.isPresent(this.entry[field])) this.setOperator(field, '$ne', this.entry[field])
		})
		return this
	}

	public whereFieldsAreNull<K extends keyof T>(...fields: K[]): this {
		fields.forEach((field) => this.setOperator(field, '$eq', null))
		return this
	}

	public whereFieldsAreNotNull<K extends keyof T>(...fields: K[]): this {
		fields.forEach((field) => this.setOperator(field, '$ne', null))
		return this
	}

	// ==================== Comparison operators (explicit value wins, entry[field] as fallback) ====================

	public whereEqual<K extends keyof T>(field: K, value?: Nullable<FieldValue<T, K>>): this {
		const resolved = this.resolveValue(field, value)
		if (!this.isPresent(resolved)) return this
		return this.setOperator(field, '$eq', resolved)
	}

	public whereNotEqual<K extends keyof T>(field: K, value?: Nullable<FieldValue<T, K>>): this {
		const resolved = this.resolveValue(field, value)
		if (!this.isPresent(resolved)) return this
		return this.setOperator(field, '$ne', resolved)
	}

	public whereFieldIsNull<K extends keyof T>(field: K): this {
		return this.setOperator(field, '$eq', null)
	}

	public whereFieldIsNotNull<K extends keyof T>(field: K): this {
		return this.setOperator(field, '$ne', null)
	}

	public whereGreaterThan<K extends keyof T>(field: K, value?: Nullable<ComparableValue>): this {
		const resolved = this.resolveValue(field, value)
		if (!this.isPresent(resolved)) return this
		return this.setOperator(field, '$gt', resolved)
	}

	public whereGreaterOrEqual<K extends keyof T>(field: K, value?: Nullable<ComparableValue>): this {
		const resolved = this.resolveValue(field, value)
		if (!this.isPresent(resolved)) return this
		return this.setOperator(field, '$gte', resolved) // fixed: was $gt before
	}

	public whereLessThan<K extends keyof T>(field: K, value?: Nullable<ComparableValue>): this {
		const resolved = this.resolveValue(field, value)
		if (!this.isPresent(resolved)) return this
		return this.setOperator(field, '$lt', resolved)
	}

	public whereLessOrEqual<K extends keyof T>(field: K, value?: Nullable<ComparableValue>): this {
		const resolved = this.resolveValue(field, value)
		if (!this.isPresent(resolved)) return this
		return this.setOperator(field, '$lte', resolved) // fixed: was $lt before
	}

	/**
	 * Filters a value range — reuses the same field for both ends thanks to
	 * setOperator merging (e.g. date range). Unlike the comparison operators
	 * above, `from`/`to` are explicit-only (no entry fallback), since a
	 * single `entry[field]` can't represent two bounds.
	 */
	public whereBetween<K extends keyof T>(
		field: K,
		from: Nullable<ComparableValue>,
		to: Nullable<ComparableValue>
	): this {
		if (this.isPresent(from)) this.setOperator(field, '$gte', from)
		if (this.isPresent(to)) this.setOperator(field, '$lte', to)
		return this
	}

	public whereIn<K extends keyof T>(field: K, values: Nullable<FieldValue<T, K>[]>): this {
		if (values && values.length > 0) return this.setOperator(field, '$in', values)
		return this
	}

	public whereNotIn<K extends keyof T>(field: K, values: Nullable<FieldValue<T, K>[]>): this {
		if (values && values.length > 0) return this.setOperator(field, '$nin', values)
		return this
	}

	public whereExists<K extends keyof T>(field: K, exists = true): this {
		return this.setOperator(field, '$exists', exists)
	}

	/**
	 * Matches a field that STARTS WITH `pattern` (prefix match — can use an
	 * index if one exists; see sargable filter notes). Regex special
	 * characters are escaped automatically.
	 */
	public whereLike<K extends keyof T>(field: K, pattern?: Nullable<string>, caseInsensitive = true): this {
		if (!pattern) return this
		const safe = MongoQueryBuilder.escapeRegex(pattern)
		return this.setOperator(field, '$regex', new RegExp(`^${safe}`, caseInsensitive ? 'i' : undefined))
	}

	/** Matches a field that CONTAINS `pattern` anywhere (cannot use an index) */
	public whereContains<K extends keyof T>(field: K, pattern?: Nullable<string>, caseInsensitive = true): this {
		if (!pattern) return this
		const safe = MongoQueryBuilder.escapeRegex(pattern)
		return this.setOperator(field, '$regex', new RegExp(safe, caseInsensitive ? 'i' : undefined))
	}

	/**
	 * Free-text (OR) search across multiple fields at once — e.g. searching by
	 * EPC / SKU / product name from a single search box. Skipped if the
	 * keyword is empty.
	 */
	public whereAnyContains(fields: (keyof T)[], keyword?: Nullable<string>, caseInsensitive = true): this {
		if (!keyword || fields.length === 0) return this
		const safe = MongoQueryBuilder.escapeRegex(keyword)
		const regex = new RegExp(safe, caseInsensitive ? 'i' : undefined)
		this.orGroups.push(...(fields.map((field) => ({ [field]: { $regex: regex } })) as FilterQuery<T>[]))
		return this
	}

	// ==================== Arrays ====================

	public whereArrayContainsAll<K extends keyof T>(field: K, values: Nullable<FieldValue<T, K>[]>): this {
		if (values && values.length > 0) return this.setOperator(field, '$all', values)
		return this
	}

	public whereArraySize<K extends keyof T>(field: K, size: Nullable<number>): this {
		if (!this.isPresent(size)) return this
		return this.setOperator(field, '$size', size)
	}

	// ==================== Logical composition ====================

	// * Arbitrary condition, not tied to a specific field — used to group/branch complex logic
	public when(condition: boolean, callback: (builder: this) => this): this {
		return condition ? callback(this) : this
	}

	/** Merges $or from one or more sub-builders: .whereOr([b1, b2]) => { $or: [b1.build(), b2.build()] } */
	public whereOr(builders: MongoQueryBuilder<T>[]): this {
		const conditions = builders.map((b) => b.build()).filter((q) => Object.keys(q).length > 0)
		if (conditions.length > 0) this.orGroups.push(...conditions)
		return this
	}

	public whereAnd(builders: MongoQueryBuilder<T>[]): this {
		const conditions = builders.map((b) => b.build()).filter((q) => Object.keys(q).length > 0)
		if (conditions.length > 0) this.andGroups.push(...conditions)
		return this
	}

	/** Escape hatch — merges an arbitrary FilterQuery directly (for Mongo operators not yet supported above) */
	public raw(filter: FilterQuery<T>): this {
		Object.assign(this.query, filter)
		return this
	}

	// * Drops a field from the final query based on an arbitrary condition (applied after being built)
	public omitIf(field: keyof T, condition: boolean | ((query: FilterQuery<T>) => boolean)): this {
		const shouldOmit = typeof condition === 'function' ? condition(this.query) : condition
		if (shouldOmit) delete this.query[field]
		return this
	}

	// ==================== Build ====================

	public build(): FilterQuery<T> {
		const query: FilterQuery<T> = { ...this.query }
		if (this.orGroups.length > 0) query.$or = this.orGroups as FilterQuery<T>['$or']
		if (this.andGroups.length > 0) query.$and = this.andGroups as FilterQuery<T>['$and']
		return query
	}

	/** true if the builder has no conditions yet — use this to skip the $match stage for a lighter aggregation */
	public isEmpty(): boolean {
		return Object.keys(this.query).length === 0 && this.orGroups.length === 0 && this.andGroups.length === 0
	}

	/**
	 * Returns a $match stage ready to be dropped straight into a Mongoose
	 * aggregation pipeline.
	 * E.g.: Model.aggregate([builder.toMatchStage(), { $group: {...} }])
	 */
	public toMatchStage(): PipelineStage.Match {
		return { $match: this.build() }
	}
}
