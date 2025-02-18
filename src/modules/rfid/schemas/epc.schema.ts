import { Tenant } from '@/modules/tenancy/constants'
import { Prop, Schema, SchemaFactory, SchemaOptions } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type EpcDocument = HydratedDocument<Epc> & { record_time: string }

const defaultSchemaOptions: SchemaOptions = Object.freeze({
	collection: 'epcs',
	timestamps: {
		createdAt: 'record_time',
		updatedAt: 'modified_at',
		currentTime: () => new Date()
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false
})

@Schema({
	collection: 'epcs',
	...defaultSchemaOptions
})
export class Epc {
	@Prop({ type: mongoose.Schema.Types.ObjectId })
	_id: mongoose.Types.ObjectId

	@Prop({ type: String, required: true, index: true })
	tenant_id: Tenant

	@Prop({ type: String, required: true, unique: true })
	epc: string

	@Prop({ type: String, required: true, index: true })
	mo_no: string

	@Prop({ type: String, required: true })
	mat_code: string

	@Prop({ type: String, required: true })
	shoes_style_code_factory: string

	@Prop({ type: String, required: true })
	size_numcode: string

	@Prop({ type: String, required: true })
	station_no: string
}

@Schema({
	collection: 'epcs_backup',
	...defaultSchemaOptions
})
export class EpcBackup extends Epc {}

export const EpcSchema = SchemaFactory.createForClass(Epc)
export const EpcBackupSchema = SchemaFactory.createForClass(EpcBackup)
