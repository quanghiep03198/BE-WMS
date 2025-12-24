import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { BoolBitTransformer } from '@/databases/transformers/bool.transformer'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { DefectiveCategory, DefectiveGoodsOutboundPurpose, DefectiveLocation } from '../constants'

export type CombinationCombinationStrategy = 'uhf' | 'usb' | 'manually'

@Entity({
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	name: 'dv_defective_goods',
	synchronize: true,
	comment: 'Defective goods table'
})
export class DefectiveGoodsEntity extends BaseAbstractEntity {
	@Column({
		name: 'epc',
		nullable: false,
		type: 'nvarchar',
		length: 30,
		comment: 'Electronic Product Code to indentify defective goods'
	})
	epc: string

	@Column({
		name: 'brand_name',
		nullable: false,
		type: 'nvarchar',
		length: 24,
		comment: 'Customer brand name of the defective goods'
	})
	brand_name: string

	@Column({
		name: 'mo_no',
		nullable: true,
		type: 'nvarchar',
		length: 20,
		comment: 'This field in only required when defective category is B  '
	})
	mo_no: string

	@Column({
		name: 'po',
		nullable: true,
		type: 'nvarchar',
		length: 20,
		comment: 'This field in only required when defective category is B  '
	})
	po: string

	@Column({ name: 'factory_shoes_style', nullable: false, type: 'nvarchar', length: 30 })
	factory_shoes_style: string

	@Column({ name: 'cust_shoes_style', nullable: false, type: 'nvarchar', length: 30 })
	cust_shoes_style: string

	@Column({ name: 'color_sn', type: 'nvarchar', length: 10 })
	color_sn: string

	@Column({ name: 'size_code', type: 'nvarchar', length: 5, nullable: false, comment: 'Size' })
	size_code: string

	@Column({
		name: 'defective_category',
		type: 'nvarchar',
		length: 5,
		enum: DefectiveCategory,
		nullable: false,
		comment: 'Defective category, including B (Grade B shoes), C (Grade C shoes), RD (Research and developement)'
	})
	defective_category: string

	@Column({
		name: 'defective_location',
		type: 'nvarchar',
		length: 5,
		enum: DefectiveLocation,
		nullable: false,
		comment: 'Defective location, including A (All), B (Upper), C (Bottom), D (Other)'
	})
	defective_location: string

	@Column({
		name: 'defective_description',
		type: 'text',
		nullable: false,
		comment: 'Raw text from editor, do not update this column manually, it will be updated by editor from Front-end'
	})
	defective_description: string

	@Column({
		name: 'storage_location',
		type: 'nvarchar',
		length: 10,
		nullable: true,
		comment: 'Storage location, this is the location where the defective goods are stored'
	})
	storage_location: string

	@Column({
		name: 'sewing_line',
		type: 'nvarchar',
		length: 50,
		nullable: true,
		comment: 'Sewing line of the defective goods'
	})
	sewing_line: string

	@Column({
		name: 'assembly_line',
		type: 'nvarchar',
		length: 50,
		nullable: true,
		comment: 'Assembly line of the defective goods'
	})
	assembly_line: string

	@Column({
		name: 'ri_cancel',
		type: 'bit',
		nullable: false,
		default: 0,
		comment: 'Return instruction cancel status, true means the return instruction is cancelled',
		transformer: new BoolBitTransformer()
	})
	ri_cancel: boolean

	@Column({
		name: 'ri_type',
		type: 'nvarchar',
		nullable: false,
		length: 10,
		enum: ['uhf', 'usb', 'manually'],
		comment: 'Return Instruction type, including uhf, usb, manually'
	})
	ri_type: CombinationCombinationStrategy

	@Column({
		name: 'inbound_date',
		type: 'datetime',
		nullable: true,
		comment: 'The date when the defective goods are inbounded to warehouse'
	})
	inbound_date: Date

	@Column({
		name: 'outbound_date',
		type: 'datetime',
		nullable: true,
		comment: 'The date when the defective goods are outbounded from warehouse'
	})
	outbound_date: Date

	@Column({
		name: 'outbound_purpose',
		type: 'nvarchar',
		length: 20,
		nullable: true,
		enum: Object.values(DefectiveGoodsOutboundPurpose) // SELL, GIVEAWAY, RECYCLE
	})
	outbound_purpose: string

	constructor(defectiveGoods: Partial<DefectiveGoodsEntity>) {
		super()
		Object.assign(this, defectiveGoods)
	}
}
