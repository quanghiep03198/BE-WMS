import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { DefectiveCategory, DefectiveLocation } from '../constants'

@Entity({
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	name: 'dv_defective_goods',
	synchronize: true
})
export class DefectiveGoodEntity extends BaseAbstractEntity {
	@Column({
		name: 'epc',
		nullable: false,
		type: 'nvarchar',
		length: 24,
		unique: true,
		comment: 'Electronic Product Code to indentify defective goods'
	})
	epc: string

	@Column({
		name: 'brand_name',
		nullable: false,
		type: 'nvarchar',
		length: 24,
		unique: true,
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
	category: string

	@Column({
		name: 'defective_location',
		type: 'nvarchar',
		length: 5,
		enum: DefectiveLocation,
		nullable: false,
		comment: 'Defective location, including A (All), B (Upper), C (Bottom), D (Other)'
	})
	defect_location: string

	@Column({
		name: 'storage_location',
		type: 'nvarchar',
		length: 10,
		nullable: false,
		comment: 'Storage location, this is the location where the defective goods are stored'
	})
	storage_location: string

	@Column({
		name: 'defective_description',
		type: 'text',
		nullable: false,
		comment: 'Raw text from editor, do not update this column manually, it will be updated by editor from Front-end'
	})
	defect_description: string

	constructor(defectiveGoods: Partial<DefectiveGoodEntity>) {
		super()
		Object.assign(this, defectiveGoods)
	}
}
