import { mongo } from 'mongoose'

export module 'mongoose' {
	type BulkWriteResult = mongo.BulkWriteResult
	type ChangeStream = mongo.ChangeStream
}
