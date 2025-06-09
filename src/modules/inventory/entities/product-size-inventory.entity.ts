import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { JsonParserTransformer } from '@/databases/transformers/json-parser.transformer'
import { ViewColumn, ViewEntity } from 'typeorm'

@ViewEntity({
	database: DATABASE_DATA_LAKE,
	name: 'dvview_invtot'
})
export class ProductSizeInventoryEntity {
	@ViewColumn({ name: 'shoestyle' })
	shoes_style: string

	@ViewColumn({ name: 'color' })
	color: string

	@ViewColumn({ name: 'qty' })
	order_qty: number

	@ViewColumn({
		name: 'size_data',
		transformer: new JsonParserTransformer<Array<{ size_numcode: string; qty: number }>>()
	})
	size_qty: Array<{ size_numcode: string; qty: number }>
}
