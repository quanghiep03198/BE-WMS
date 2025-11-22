import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { DefectiveCategory, DefectiveGoodsOutboundPurpose, DefectiveLocation } from '../constants'

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
