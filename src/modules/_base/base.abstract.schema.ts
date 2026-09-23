import { Schema } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({
	timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
	versionKey: false,
	toObject: { virtuals: true },
	toJSON: { virtuals: true }
})
export abstract class BaseAbstractSchema extends Document {
	created_at: Date
	updated_at?: Date
}
