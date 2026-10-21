import { BaseAbstractSchema } from '@modules/_base/base.abstract.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, PaginateModel } from 'mongoose'
import { SoftDeleteModel } from 'mongoose-delete'
import { DepartmentGroup } from '../constants'

export const DEPARTMENT_COLLECTION = 'departments'

@Schema({
	collection: DEPARTMENT_COLLECTION,
	versionKey: false,
	strict: false,
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	toObject: { virtuals: true },
	toJSON: { virtuals: true }
})
export class Department extends BaseAbstractSchema {
	@Prop({ type: String, enum: DepartmentGroup, required: true })
	group: DepartmentGroup

	@Prop({ type: String, required: true })
	code: string

	@Prop({ type: Object, required: true })
	name: {
		cn: string
		en: string
		vi: string
	}
}

const DepartmentSchema = SchemaFactory.createForClass(Department)

DepartmentSchema.index({ group: 1 })

DepartmentSchema.index({ code: 1 }, { unique: true })

DepartmentSchema.loadClass(Department)

type DepartmentDocument = HydratedDocument<Department, { created_at: Date; updated_at?: Nullable<Date> }>

type DepartmentModel = SoftDeleteModel<DepartmentDocument> & PaginateModel<DepartmentDocument>

export { DepartmentSchema, type DepartmentDocument, type DepartmentModel }
