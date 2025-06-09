import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { ViewColumn, ViewEntity } from 'typeorm'

@ViewEntity({ database: DATABASE_DATA_LAKE, schema: DATABASE_SCHEMA, name: 'dvview_invoub' })
export class OutboundInventoryEntity {
	@ViewColumn({ name: 'shoestyle' })
	shoes_style: string

	@ViewColumn({ name: 'color' })
	color: string

	@ViewColumn({ name: 'po' })
	po: string

	@ViewColumn({ name: 'or_deliverdate_confirm' })
	deliver_date: Date

	@ViewColumn({ name: 'oub_QTY' })
	outbound_qty: number
}
