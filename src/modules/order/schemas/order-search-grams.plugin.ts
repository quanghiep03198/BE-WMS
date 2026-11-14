import { BadRequestException } from '@nestjs/common'
import { Schema } from 'mongoose'

function foldOrderSearch(value: string): string[] {
	return Array.from(
		Array.from(value, (character) => character.toUpperCase().toLowerCase().toUpperCase().toLowerCase()).join('')
	)
}

export function orderSearchGrams(value: string): string[] {
	if (typeof value !== 'string') throw new Error('Order identifier must be a string')
	const characters = foldOrderSearch(value)
	const grams = new Set<string>()
	for (let size = 1; size <= 3; size++) {
		for (let i = 0; i + size <= characters.length; i++) {
			grams.add(characters.slice(i, i + size).join(''))
		}
	}
	return [...grams]
}

export function orderSearchFilter(field: 'mo_no' | 'po', term: string, indexed: boolean) {
	if (typeof term !== 'string') throw new BadRequestException('Search term must be a string')
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const filter: Record<string, unknown> = { [field]: { $regex: escaped, $options: 'i' } }
	if (indexed && term.length > 0) {
		const characters = foldOrderSearch(term)
		const size = Math.min(3, characters.length)
		const grams = new Set<string>()
		for (let i = 0; i + size <= characters.length; i++) grams.add(characters.slice(i, i + size).join(''))
		filter.search_ngrams = { $all: [...grams] }
	}
	return filter
}

export function orderSearchPlugin(schema: Schema, options: { field: 'mo_no' | 'po' }) {
	const { field } = options
	schema.pre('save', function () {
		if (this.isNew || this.isModified(field)) {
			const value = this.get(field)
			if (typeof value !== 'string') throw new Error(`Order ${field} must be a string`)
			this.set('search_ngrams', orderSearchGrams(value))
		}
	})

	schema.pre('insertMany', function (next, documents: Record<string, unknown>[]) {
		for (const document of documents) {
			const value = document[field]
			if (typeof value !== 'string') return next(new Error(`Order ${field} must be a string`))
			document.search_ngrams = orderSearchGrams(value)
		}
		next()
	})

	function prepareUpdate(update: unknown, filter: Record<string, unknown>, upsert: boolean) {
		if (!update || Array.isArray(update)) {
			throw new Error('Order update pipelines require explicit search n-gram maintenance')
		}
		const changes = update as Record<string, unknown>
		const set = (changes.$set ?? {}) as Record<string, unknown>
		const setOnInsert = (changes.$setOnInsert ?? {}) as Record<string, unknown>
		const unset = (changes.$unset ?? {}) as Record<string, unknown>
		const rename = (changes.$rename ?? {}) as Record<string, unknown>
		if (field in unset || field in rename || Object.values(rename).includes(field)) {
			throw new Error(`Cannot unset or rename ${field}`)
		}
		const value = set[field] ?? changes[field] ?? setOnInsert[field]
		if (value !== undefined) {
			if (typeof value !== 'string') throw new Error(`Order ${field} must be a string`)
			set.search_ngrams = orderSearchGrams(value)
			delete setOnInsert.search_ngrams
			changes.$set = set
		} else if (upsert) {
			const filterValue = filter[field]
			if (typeof filterValue !== 'string') {
				throw new Error(`Upserting an order requires an explicit ${field}`)
			}
			setOnInsert.search_ngrams = orderSearchGrams(filterValue)
		}
		if (Object.keys(setOnInsert).length) changes.$setOnInsert = setOnInsert
		return changes
	}

	schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
		this.setUpdate(prepareUpdate(this.getUpdate(), this.getFilter(), Boolean(this.getOptions().upsert)))
	})

	schema.pre(['replaceOne', 'findOneAndReplace'], function () {
		const replacement = this.getUpdate()
		if (!replacement || Array.isArray(replacement)) throw new Error('Invalid order replacement')
		const value = replacement[field]
		if (typeof value !== 'string') throw new Error(`Order ${field} must be a string`)
		replacement.search_ngrams = orderSearchGrams(value)
	})

	schema.pre('bulkWrite', function (next, operations) {
		try {
			for (const operation of operations) {
				if ('insertOne' in operation) {
					const document = operation.insertOne.document
					if (typeof document[field] !== 'string') throw new Error(`Order ${field} must be a string`)
					document.search_ngrams = orderSearchGrams(document[field])
				} else if ('replaceOne' in operation) {
					const document = operation.replaceOne.replacement
					if (typeof document[field] !== 'string') throw new Error(`Order ${field} must be a string`)
					document.search_ngrams = orderSearchGrams(document[field])
				} else if ('updateOne' in operation || 'updateMany' in operation) {
					const op = 'updateOne' in operation ? operation.updateOne : operation.updateMany
					op.update = prepareUpdate(op.update, op.filter, Boolean(op.upsert))
				}
			}
			next()
		} catch (error) {
			next(error instanceof Error ? error : new Error(String(error)))
		}
	})
}
