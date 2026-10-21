import { RFIDDeviceType } from '@modules/rfid-device/domain/constants'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Types, type HydratedDocument, type PaginateModel } from 'mongoose'
import MongooseAutoPopulate from 'mongoose-autopopulate'
import MongooseDelete, { type SoftDeleteModel } from 'mongoose-delete'
import MongoosePaginate from 'mongoose-paginate-v2'

export const RFID_DEVICE_COLLECTION = 'rfid_devices'

@Schema({
	collection: RFID_DEVICE_COLLECTION,
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	versionKey: false,
	strict: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' }
})
export class RFIDDevice {
	@Prop({ type: Object, required: true })
	device_name: {
		vi: string
		en: string
		cn: string
	}

	@Prop({ type: String, required: true })
	station_no: string

	@Prop({ type: String, required: true })
	tcp_ip: string

	@Prop({ type: String, required: true })
	tcp_port: string

	@Prop({ type: String, required: true })
	device_sn: string

	@Prop({ type: String, enum: RFIDDeviceType, required: true })
	device_type: RFIDDeviceType

	@Prop({ type: Date })
	last_used_at: Date

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: { select: 'username display_name roles created_at' } })
	created_by: Types.ObjectId

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: { select: 'username display_name roles created_at' } })
	updated_by: Types.ObjectId
}

export const RFIDDeviceSchema = SchemaFactory.createForClass(RFIDDevice)

RFIDDeviceSchema.index({ device_sn: 1 }, { unique: true })

RFIDDeviceSchema.plugin(MongooseDelete)
RFIDDeviceSchema.plugin(MongoosePaginate)
RFIDDeviceSchema.plugin(MongooseAutoPopulate)

export type RFIDDeviceDocument = HydratedDocument<RFIDDevice, { created_at: Date; updated_at?: Date }>

export type RFIDDeviceModel = SoftDeleteModel<RFIDDeviceDocument> & PaginateModel<RFIDDeviceDocument>
