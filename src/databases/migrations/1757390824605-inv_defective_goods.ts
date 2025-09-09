import {
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveLocation
} from '@/modules/defective-goods/constants'
import { MigrationInterface, QueryRunner, Table } from 'typeorm'
import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '../constants'

export class InvDefectiveGoods1757390824605 implements MigrationInterface {
	private tableSchema = new Table({
		database: DATABASE_DATA_LAKE,
		schema: DATABASE_SCHEMA,
		name: 'dv_defective_goods',
		comment: 'Defective goods table, including Grade B, Grade C and Research and development',
		columns: [
			{
				name: 'keyid',
				type: 'int',
				isPrimary: true,
				primaryKeyConstraintName: 'PK_dv_defective_goods',
				isGenerated: true,
				generationStrategy: 'increment'
			},
			{
				name: 'epc',
				type: 'nvarchar',
				length: '30',
				isNullable: false,
				isUnique: true,
				comment: 'Electronic Product Code to indentify defective goods'
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
			{ name: 'factory_shoes_style', type: 'nvarchar', length: '30', isNullable: false },
			{ name: 'color_sn', type: 'nvarchar', length: '10', isNullable: false },
			{ name: 'size_code', type: 'nvarchar', length: '5', isNullable: false, comment: 'Size' },
			{
				name: 'defective_category',
				type: 'nvarchar',
				length: '2',
				isNullable: false,
				enum: Object.values(DefectiveCategory),
				comment:
					'Defective category, including B (Grade B shoes), C (Grade C shoes), RD (Research and developement)'
			},
			{
				name: 'defective_location',
				type: 'nvarchar',
				length: '1',
				isNullable: false,
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
				enum: Object.values(DefectiveGoodsOutboundPurpose) // SELL, GIVEAWAY, RECYCLE
			},
			{ name: 'user_code_created', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_name_created', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_code_updated', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_name_updated', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'created', type: 'datetime', default: 'GETDATE()', isNullable: true },
			{ name: 'updated', type: 'datetime', isNullable: true, onUpdate: 'CURRENT_TIMESTAMP' },
			{ name: 'isactive', type: 'varchar', length: '1', isNullable: false, default: "'Y'" },
			{ name: 'remark', type: 'nvarchar', length: '255', isNullable: true }
		]
	})

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(this.tableSchema, true)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable(this.tableSchema, false)
	}
}
