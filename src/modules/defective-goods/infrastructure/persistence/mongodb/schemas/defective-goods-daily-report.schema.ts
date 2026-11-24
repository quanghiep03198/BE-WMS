import {
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource
} from '@modules/defective-goods/domain/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'

export const DEFECTIVE_GOODS_DAILY_REPORT_COLLECTION = 'defective_goods_daily_report'

@Schema({
	collection: DEFECTIVE_GOODS_DAILY_REPORT_COLLECTION,
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strictQuery: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' }
})
export class DefectiveGoodsDailyReport {
	@Prop({ type: String })
	report_key?: string

	@Prop({ type: String, required: true })
	date: string

	@Prop({ type: String, enum: ['inbound', 'outbound'], required: true })
	type: StockFlow

	@Prop({ type: String, required: true })
	brand_name: string

	@Prop({ type: String })
	po: string

	@Prop({ type: String, enum: DefectiveGoodsOutboundPurpose })
	outbound_purpose?: DefectiveGoodsOutboundPurpose

	@Prop({ type: String })
	mo_no: string

	@Prop({ type: String, required: true })
	cust_shoes_style: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: String, enum: DefectiveCategory, required: true })
	defective_category: string

	@Prop({ type: String, enum: DefectiveGoodsSource, required: true })
	shoe_source: DefectiveGoodsSource

	@Prop({ type: String })
	sewing_line: string

	@Prop({ type: String })
	assembly_line: string

	@Prop({ type: String })
	storage_location?: string

	@Prop({ type: Array, required: true })
	size_ledger: Array<{ size_numcode: string; qty: number }>
}

export const DefectiveGoodsDailyReportSchema = SchemaFactory.createForClass(DefectiveGoodsDailyReport)

DefectiveGoodsDailyReportSchema.index({ date: 1, type: 1 })
DefectiveGoodsDailyReportSchema.index(
	{ report_key: 1 },
	{ unique: true, partialFilterExpression: { report_key: { $type: 'string' } } }
)

DefectiveGoodsDailyReportSchema.virtual('total_qty').get(function () {
	return this.size_ledger.reduce((sum, item) => sum + item.qty, 0)
})

DefectiveGoodsDailyReportSchema.plugin(MongooseLeanVirtuals)

DefectiveGoodsDailyReportSchema.set('toJSON', { virtuals: true })
DefectiveGoodsDailyReportSchema.set('toObject', { virtuals: true })

export type DefectiveGoodsDailyReportDocument = HydratedDocument<DefectiveGoodsDailyReport>

export type DefectiveGoodsDailyReportModel = Model<DefectiveGoodsDailyReportDocument>
