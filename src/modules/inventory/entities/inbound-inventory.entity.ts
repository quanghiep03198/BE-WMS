import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants/index'
import { ViewColumn, ViewEntity } from 'typeorm'

@ViewEntity({ database: DATABASE_DATA_LAKE, schema: DATABASE_SCHEMA, name: 'dvview_invinb' })
export class InboundInventoryEntity {
	@ViewColumn({ name: 'shoestyle' })
	shoes_style: string

	@ViewColumn({ name: 'color' })
	color: string

	@ViewColumn({ name: 'mo_no' })
	mo_no: string

	@ViewColumn({ name: 'mo_totalqty' })
	mo_qty: number

	@ViewColumn({ name: 'inbound' })
	inbound_qty: number

	@ViewColumn({ name: 'acceptqty' })
	accept_qty: number
}
