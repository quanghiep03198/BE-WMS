import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { JsonParserTransformer } from '@/databases/transformers/json-parser.transformer'
import { ViewColumn, ViewEntity } from 'typeorm'

@ViewEntity({
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	name: 'dvview_invtot'
})
export class SizeInventoryEntity {
	@ViewColumn({ name: 'shoes_style' })
	shoes_style: string

	@ViewColumn({ name: 'color' })
	color: string

	@ViewColumn({ name: 'total_qty' })
	total_qty: number

	@ViewColumn({
		name: 'inv_sizes',
		transformer: new JsonParserTransformer<Array<{ size_numcode: string; qty: number }>>()
	})
	inv_sizes: Array<{ size_numcode: string; qty: number }>
}
