import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { JsonParserTransformer } from '@/databases/transformers/json-parser.transformer'
import { ViewColumn, ViewEntity } from 'typeorm'

@ViewEntity({
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	name: 'dvview_invexcel'
})
export class ProductInventoryReportEntity {
	@ViewColumn({ name: 'shoes_style' })
	shoes_style: string

	@ViewColumn({ name: 'color' })
	color: string

	@ViewColumn({ name: 'mo_no' })
	mo_no: string

	@ViewColumn({ name: 'mo_qty' })
	mo_qty: number

	@ViewColumn({ name: 'total_qty' })
	total_qty: number

	@ViewColumn({
		name: 'inv_sizes',
		transformer: new JsonParserTransformer<Array<{ size_numcode: string; qty: number }>>()
	})
	inv_sizes: Array<{ size_numcode: string; qty: number }>
}
