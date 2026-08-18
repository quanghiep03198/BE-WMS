import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'

export const CDC_QUARANTINE_COLLECTION = 'cdc_quarantine'

@Schema({ collection: CDC_QUARANTINE_COLLECTION, timestamps: true, versionKey: false })
export class CdcQuarantine {
	/**
	 * @description The name of the source table from which the change was captured. This is useful for identifying which table the change originated from, especially in systems that monitor multiple tables.
	 */
	@Prop({ required: true })
	source_table: string

	/**
	 * @description The database connection token that was used to connect to the source database. This is useful for multi-database setups where you might have different connections for different databases.
	 */
	@Prop({ required: true })
	data_source_token: string // VD: 'DATA_SOURCE_DATA_LAKE' — DB nào (khi ông có multi-DB)

	/**
	 * @description The type of operation that was performed on the source table. This can be one of 'INSERT', 'UPDATE', or 'DELETE'. It helps in understanding what kind of change was made to the data.
	 */
	@Prop({ type: Object, required: true })
	raw_payload: Record<string, any>

	/**
	 * @description A human-readable message describing the error that caused the change to be quarantined. This is useful for debugging and understanding why a particular change was not processed successfully.
	 */
	@Prop({ required: true })
	error: string

	/**
	 * @description The Log Sequence Number (LSN) associated with the change. This is a unique identifier that helps in tracking the order of changes and is crucial for ensuring that changes are processed in the correct sequence.
	 */
	@Prop({ type: Buffer })
	lsn: Buffer

	/**
	 * @description A boolean flag indicating whether the quarantined change has been resolved. This is useful for tracking the status of quarantined changes and knowing whether they have been addressed or not.
	 */
	@Prop({ default: false })
	resolved: boolean

	@Prop()
	resolved_at?: Date

	@Prop()
	resolved_note?: string

	@Prop()
	quarantined_at: Date
}

export const CdcQuarantineSchema = SchemaFactory.createForClass(CdcQuarantine)

export type CdcQuarantineDocument = HydratedDocument<CdcQuarantine>
export type CdcQuarantineModel = Model<CdcQuarantineDocument>
