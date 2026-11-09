import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Types } from 'mongoose'

@Schema({ collection: 'stored_files', versionKey: false })
export class StoredFile {
	@Prop({ type: Types.ObjectId, required: true, unique: true })
	gridfs_id: Types.ObjectId

	@Prop({ type: Types.ObjectId, required: true })
	owner_id: Types.ObjectId

	@Prop({ type: String, required: true })
	mimetype: string

	@Prop({ type: Number, required: true })
	size: number

	@Prop({ type: String, enum: ['pending', 'attached'], default: 'pending', required: true })
	status: 'pending' | 'attached'

	@Prop({ type: [String], default: [] })
	refs: string[]

	@Prop({ type: Date })
	orphaned_at?: Date

	@Prop({ type: Date, default: Date.now, required: true })
	created_at: Date

	@Prop({ type: Date })
	cleanup_started_at?: Date
}

export const StoredFileSchema = SchemaFactory.createForClass(StoredFile)
StoredFileSchema.index({ status: 1, created_at: 1 })
StoredFileSchema.index({ orphaned_at: 1 })
