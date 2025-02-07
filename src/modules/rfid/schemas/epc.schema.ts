import { Tenant } from '@/modules/tenancy/constants'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type EpcDocument = HydratedDocument<Epc> & { record_time: string }

@Schema({
	collection: 'epcs',
	timestamps: {
		createdAt: 'record_time',
		updatedAt: 'updated_at',
		currentTime: () => new Date()
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false
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

export const EpcSchema = SchemaFactory.createForClass(Epc)
