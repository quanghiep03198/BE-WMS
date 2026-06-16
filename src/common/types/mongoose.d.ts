import type { MongooseBulkWriteResult } from 'mongoose/types'

export module 'mongoose' {
	type BulkWriteResult = Omit<MongooseBulkWriteResult, 'mongoose'>
}
