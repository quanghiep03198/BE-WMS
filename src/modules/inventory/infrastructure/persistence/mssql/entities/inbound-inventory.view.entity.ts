import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@databases/constants/index'
import { JsonParserTransformer } from '@databases/transformers/json-parser.transformer'
import { ViewColumn, ViewEntity } from 'typeorm'

@ViewEntity({
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	name: 'dvview_invinb'
})
export class InboundInventoryEntity {
	@ViewColumn({ name: 'brand_name' })
	brand_name: string

	@ViewColumn({ name: 'shoes_style' })
	shoes_style: string

	@ViewColumn({ name: 'color' })
	color: string

	@ViewColumn({ name: 'mo_no' })
	mo_no: string

	@ViewColumn({ name: 'mo_qty' })
	mo_qty: number

	@ViewColumn({ name: 'inbound_qty' })
	inbound_qty: number

	@ViewColumn({ name: 'inspected_qty' })
	inspected_qty: number

	@ViewColumn({ name: 'last_inbound_time' })
	last_inbound_time: Date

	@ViewColumn({
		name: 'inv_sizes',
		transformer: new JsonParserTransformer<Array<{ size_numcode: string; qty: number }>>()
	})
	inv_sizes: Array<{ size_numcode: string; qty: number }>
}
