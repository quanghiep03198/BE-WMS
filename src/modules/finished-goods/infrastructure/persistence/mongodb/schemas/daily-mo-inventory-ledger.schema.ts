import { type DepartmentDocument } from '@modules/department/schemas/department.schema'
import { type StorageLocationDocument } from '@modules/warehouse/infrastructure/persistence/mongodb/schemas/storage-location.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, LeanDocument, Model, Types } from 'mongoose'
import MongooseAutoPopulate from 'mongoose-autopopulate'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'

export const DAILY_MO_INVENTORY_LEDGER_COLLECTION = 'daily_mo_inventory_ledger'

@Schema({ _id: false })
export class InventoryLedgerTransaction {
	@Prop({ type: String, required: true })
	time: string

	@Prop({ type: Types.ObjectId, required: true, ref: 'Department', autopopulate: true })
	assembly_line: Types.ObjectId | Pick<LeanDocument<DepartmentDocument>, 'name'>

	@Prop({ type: Types.ObjectId, ref: 'StorageLocation', autopopulate: true })
	storage_location: Types.ObjectId | Pick<LeanDocument<StorageLocationDocument>, 'name'>

	@Prop({
		type: Map,
		of: {
			stocked_in_qty: { type: Number, default: 0 },
			total_recall_tx: { type: Number, default: 0 },
			total_return_tx: { type: Number, default: 0 }
		},
		required: true
	})
	size_ledger: Map<
		string,
		{
			stocked_in_qty: number
			total_recall_tx: number
			total_return_tx: number
		}
	>

	@Prop({ type: Boolean, default: false })
	voided: boolean // * Indicates whether the transaction has been voided or not

	get total_balance() {
		return this.size_ledger
			.values()
			.reduce((acc, curr) => acc + curr.stocked_in_qty - curr.total_recall_tx + curr.total_return_tx, 0)
	}
}

const InventoryLedgerTransactionSchema = SchemaFactory.createForClass(InventoryLedgerTransaction)

InventoryLedgerTransactionSchema.loadClass(InventoryLedgerTransaction)

InventoryLedgerTransactionSchema.plugin(MongooseAutoPopulate)
InventoryLedgerTransactionSchema.plugin(MongooseLeanVirtuals)

@Schema({
	collection: DAILY_MO_INVENTORY_LEDGER_COLLECTION,
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' }
})
export class DailyMoInventoryLedger {
	@Prop({ type: String, required: true })
	date: string

	@Prop({ type: String, required: true })
	mo_no: string

	@Prop({
		type: Map,
		of: {
			stocked_in_qty: { type: Number, default: 0 },
			total_recall_tx: { type: Number, default: 0 },
			total_return_tx: { type: Number, default: 0 }
		},
		required: true
	})
	size_ledger: Map<
		string,
		{
			stocked_in_qty: number
			total_recall_tx: number
			total_return_tx: number
		}
	>

	@Prop({ type: Map, of: InventoryLedgerTransactionSchema, required: true })
	transaction_history: Map<
		string, // * Transaction ID
		InventoryLedgerTransaction
	>
}

export const DailyMoInventoryLedgerSchema = SchemaFactory.createForClass(DailyMoInventoryLedger)

DailyMoInventoryLedgerSchema.index({ date: 1, mo_no: 1 }, { name: 'idx_date_mo', unique: true })

DailyMoInventoryLedgerSchema.plugin(MongooseLeanVirtuals)

DailyMoInventoryLedgerSchema.virtual('mo_specification', {
	ref: 'ManufacturingOrder',
	localField: 'mo_no',
	foreignField: 'mo_no',
	justOne: true
})

DailyMoInventoryLedgerSchema.set('toObject', { virtuals: true })
DailyMoInventoryLedgerSchema.set('toJSON', { virtuals: true })

export type DailyMoInventoryLedgerDocument = HydratedDocument<
	DailyMoInventoryLedger,
	{
		created_at: Date
		updated_at?: Date
		mo_specification: {
			factory_shoes_style: string
			color_sn: string
			factory_code_produce: string
			order_qty: number
			brand_name: string
			size_ledger: Record<
				string,
				{
					order_qty: number
					stocked_in_qty: number
					total_recall_tx: number
					total_return_tx: number
					shipped_out_qty: number
				}
			>
		}
	}
>

export type DailyMoInventoryLedgerModel = Model<DailyMoInventoryLedgerDocument>
