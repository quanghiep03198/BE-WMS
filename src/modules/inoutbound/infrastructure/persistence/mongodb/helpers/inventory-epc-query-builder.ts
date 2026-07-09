// archived-epc-query.builder.ts
import { InventoryEpcDocument } from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { FilterQuery } from 'mongoose'

type QueryField = keyof Pick<
	InventoryEpcDocument,
	| 'epc'
	| 'mo_no'
	| 'po'
	| 'factory_code_produce'
	| 'factory_shoes_style'
	| 'color_sn'
	| 'size_numcode'
	| 'inbound_at'
	| 'outbound_at'
	| 'inbound_device_sn'
	| 'outbound_device_sn'
	| 'scannable'
>

export class InventoryEpcQueryBuilder {
	private query: FilterQuery<InventoryEpcDocument> = {}

	public static createQueryBuilder() {
		return new InventoryEpcQueryBuilder()
	}

	public withEqual(field: QueryField, value: unknown): this {
		if (typeof value === 'undefined' || (typeof value === 'object' && value === null)) return this

		this.query[field] = { $eq: value }
		return this
	}

	public withNotEqual(field: QueryField, value: unknown): this {
		if (typeof value === 'undefined' || (typeof value === 'object' && value === null)) return this
		this.query[field] = { $ne: value }
		return this
	}

	public withEmptyString(field: QueryField): this {
		this.query[field] = { $eq: '' }
		return this
	}

	public withNotNull(field: QueryField, enabled: boolean = true): this {
		if (!enabled) return this
		this.query[field] = { $ne: null }
		return this
	}

	public withNull(field: QueryField, enabled: boolean = true): this {
		if (!enabled) return this
		this.query[field] = { $eq: null }
		return this
	}

	public withLike(field: keyof InventoryEpcDocument, value: string): this {
		if (value) {
			this.query[field] = { $regex: value, $options: 'i' }
		}
		return this
	}

	public withInclude(field: keyof InventoryEpcDocument, values: unknown[]): this {
		if (values && values.length > 0) {
			this.query[field] = { $in: values }
		}
		return this
	}

	public build(): FilterQuery<InventoryEpcDocument> {
		return this.query
	}
}
