import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@databases/constants'
import { JsonParserTransformer } from '@databases/transformers/json-parser.transformer'
import { ViewColumn, ViewEntity } from 'typeorm'

@ViewEntity({
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	name: 'dvview_invoub'
})
export class OutboundEstimationEntity {
	@ViewColumn({ name: 'brand_name' })
	brand_name: string

	@ViewColumn({ name: 'shoes_style' })
	shoes_style: string

	@ViewColumn({ name: 'color' })
	color: string

	@ViewColumn({ name: 'po' })
	po: string

	@ViewColumn({ name: 'po_qty' })
	po_qty: number

	@ViewColumn({ name: 'outbound_date' })
	outbound_date: Date

	@ViewColumn({ name: 'last_outbound_time' })
	last_outbound_time: Date

	@ViewColumn({ name: 'outbound_qty' })
	outbound_qty: number

	@ViewColumn({
		name: 'inv_sizes',
		transformer: new JsonParserTransformer<Array<{ size_numcode: string; qty: number }>>()
	})
	inv_sizes: Array<{ size_numcode: string; qty: number }>
}
