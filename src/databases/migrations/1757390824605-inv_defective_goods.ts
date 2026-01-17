import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import {
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '@/modules/defective-goods/constants'
import { MigrationInterface, QueryRunner, Table } from 'typeorm'
import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '../constants'

export class InvDefectiveGoods1757390824605 implements MigrationInterface {
	private readonly tableSchema = new Table({
		database: DATABASE_DATA_LAKE,
		schema: DATABASE_SCHEMA,
		name: 'dv_defective_goods',
		comment: 'Defective goods table, including Grade B, Grade C and Research and development',
		columns: [
			...BaseAbstractEntity.BASE_COLUMNS.map((col) => {
				if (col.name === 'keyid') return { ...col, primaryKeyConstraintName: 'PK_dv_defective_goods' }
				else return col
			}),
			{
				name: 'epc',
				type: 'nvarchar',
				length: '30',
				isNullable: false,
				comment: 'Electronic Product Code to indentify defective goods'
			},
			{
				name: 'ri_cancel',
				type: 'bit',
				isNullable: false,
				default: 0,
				comment: 'Return Instruction Cancel flag'
			},
			{
				name: 'ri_type',
				type: 'nvarchar',
				length: '10',
				isNullable: false,
				enumName: 'CHK_defective_goods_ri_type',
				enum: ['uhf', 'usb', 'manually'],
				comment: 'Combination strategy, including "uhf", "usb", "manually"'
			},
			{
				name: 'sewing_line',
				type: 'nvarchar',
				length: '50',
				isNullable: true,
				comment: 'Sewing line of the defective goods'
			},
			{
				name: 'assembly_line',
				type: 'nvarchar',
				length: '50',
				isNullable: true,
				comment: 'Assembly line of the defective goods'
			},
			{
				name: 'brand_name',
				type: 'nvarchar',
				length: '30',
				isNullable: false,
				comment: 'Customer brand name of the defective goods'
			},
			{
				name: 'mo_no',
				type: 'nvarchar',
				length: '20',
				isNullable: true,
				comment: 'This field in only required when defective category is B'
			},
			{
				name: 'po',
				type: 'nvarchar',
				length: '20',
				isNullable: true,
				comment: 'This field in only required when defective category is B'
			},
			{ name: 'cust_shoes_style', type: 'nvarchar', length: '100', isNullable: false },
			{ name: 'factory_shoes_style', type: 'nvarchar', length: '50', isNullable: false },
			{ name: 'color_sn', type: 'nvarchar', length: '10', isNullable: false },
			{ name: 'size_code', type: 'nvarchar', length: '5', isNullable: false, comment: 'Size' },
			{
				name: 'defective_category',
				type: 'nvarchar',
				length: '2',
				isNullable: false,
				enumName: 'CHK_defective_goods_defective_category',
				enum: Object.values(DefectiveCategory),
				comment:
					'Defective category, including B (Grade B shoes), C (Grade C shoes), RD (Research and developement)'
			},
			{
				name: 'shoe_source',
				type: 'nvarchar',
				length: '1',
				isNullable: false,
				enumName: 'CHK_defective_goods_shoe_source',
				enum: Object.values(DefectiveGoodsSource),
				default: `'${DefectiveGoodsSource.FINAL_INSPECTION}'`,
				comment:
					'Source of the defective goods, including A (Final inspection), B (Assembly), C (Repacking inspection), D (Other)'
			},
			{
				name: 'defective_location',
				type: 'nvarchar',
				length: '1',
				isNullable: false,
				enumName: 'CHK_defective_goods_defective_location',
				enum: Object.values(DefectiveLocation),
				comment: 'Defective location, including A (All), B (Upper), C (Bottom), D (Other)'
			},
			{
				name: 'defective_description',
				type: 'text',
				isNullable: false,
				comment:
					'Raw text from editor, do not update this column manually, it will be updated by editor from Front-end'
			},
			{
				name: 'inbound_date',
				type: 'datetime',
				isNullable: true,
				comment: 'The date when the defective goods are inbounded to warehouse'
			},
			{
				name: 'storage_location',
				type: 'nvarchar',
				length: '10',
				isNullable: true,
				comment: 'Storage location, this is the location where the defective goods are stored'
			},
			{
				name: 'outbound_date',
				type: 'datetime',
				isNullable: true,
				comment: 'The date when the defective goods are inbounded to warehouse'
			},
			{
				name: 'outbound_purpose',
				type: 'nvarchar',
				length: '20',
				isNullable: true,
				enumName: 'CHK_defective_goods_outbound_purpose',
				enum: Object.values(DefectiveGoodsOutboundPurpose) // SELL, GIVEAWAY, ELIMINATE
			},
			{
				name: 'unit',
				type: 'nvarchar',
				length: '5',
				isNullable: false,
				enumName: 'CHK_defective_goods_unit',
				enum: Object.values(DefectiveGoodsUnit)
			}
		]
	})

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(this.tableSchema, true, false, true)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropPrimaryKey(this.tableSchema.name)
		await queryRunner.dropTable(this.tableSchema, true, true, true)
	}
}
