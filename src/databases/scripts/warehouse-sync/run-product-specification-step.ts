import type { mongo } from 'mongoose'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'
import { PRODUCT_SPECIFICATIONS_SQL } from './product-specifications.sql'

interface ProductSpecification {
	brand_name: string
	factory_shoes_style: string
	cust_shoes_style: string
	variants: Map<string, Set<string>>
}

function requiredText(value: unknown, name: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid product specification ${name}`)
	return value.trim()
}

export async function runProductSpecificationStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db
): Promise<{ productSpecifications: number }> {
	const specifications = new Map<string, ProductSpecification>()
	for await (const row of streamMssqlRows(pool.request(), PRODUCT_SPECIFICATIONS_SQL)) {
		if (!row || typeof row !== 'object') throw new Error('Invalid product specification row')
		if (!(
			'brand_name' in row &&
			'factory_shoes_style' in row &&
			'cust_shoes_style' in row &&
			'product_variants' in row
		)) {
			throw new Error('Incomplete product specification row')
		}
		const brand_name = requiredText(row.brand_name, 'brand_name')
		const factory_shoes_style = requiredText(row.factory_shoes_style, 'factory_shoes_style')
		const cust_shoes_style = requiredText(row.cust_shoes_style, 'cust_shoes_style')
		const key = JSON.stringify([brand_name, factory_shoes_style, cust_shoes_style])
		let specification = specifications.get(key)
		if (!specification) {
			specification = { brand_name, factory_shoes_style, cust_shoes_style, variants: new Map() }
			specifications.set(key, specification)
		}
		if (typeof row.product_variants !== 'string') throw new Error(`Invalid product variants for ${key}`)
		const variants: unknown = JSON.parse(row.product_variants)
		if (!Array.isArray(variants) || variants.length === 0) throw new Error(`Invalid product variants for ${key}`)
		for (const variant of variants) {
			if (!variant || typeof variant !== 'object' || !('color_sn' in variant && 'sizes' in variant)) {
				throw new Error(`Invalid product variant for ${key}`)
			}
			const color = requiredText(variant.color_sn, 'color_sn')
			if (!Array.isArray(variant.sizes)) {
				throw new Error(`Invalid product sizes for ${key}`)
			}
			let sizes = specification.variants.get(color)
			if (!sizes) {
				sizes = new Set()
				specification.variants.set(color, sizes)
			}
			for (const size of variant.sizes) {
				if (!size || typeof size !== 'object' || !('size_numcode' in size)) {
					throw new Error(`Invalid product size for ${key}`)
				}
				sizes.add(requiredText(size.size_numcode, 'size_numcode'))
			}
		}
	}

	const collection = database.collection('product_specifications')
	await collection.createIndex({ brand_name: 1, factory_shoes_style: 1, cust_shoes_style: 1 }, { unique: true })
	for (const { brand_name, factory_shoes_style, cust_shoes_style, variants } of specifications.values()) {
		const product_variants = [...variants].map(([color_sn, sizes]) => ({ color_sn, sizes: [...sizes].sort() }))
		product_variants.sort((a, b) => a.color_sn.localeCompare(b.color_sn))
		const result = await collection.updateOne(
			{ brand_name, factory_shoes_style, cust_shoes_style },
			{ $set: { product_variants } },
			{ upsert: true }
		)
		if (!result.acknowledged) throw new Error(`Unacknowledged product specification write: ${factory_shoes_style}`)
	}
	return { productSpecifications: specifications.size }
}
