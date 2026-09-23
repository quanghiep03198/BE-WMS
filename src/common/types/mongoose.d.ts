import { mongo, type SchemaDefinitionProperty as DefinitionProperty } from 'mongoose'
import { SoftDeleteModel } from 'mongoose-delete'

export module 'mongoose' {
	type BulkWriteResult = mongo.BulkWriteResult
	type ChangeStream = mongo.ChangeStream

	interface PaginateOptions {
		customFind?: keyof Pick<SoftDeleteModel, 'findDeleted' | 'findWithDeleted'>
	}

	type LeanDocument<T> = T & { $locals?: never }

	type SchemaDefinitionProperty<T> = DefinitionProperty<T> & {
		autopopulate?: boolean
	}
}
