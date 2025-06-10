import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants/index'
import { ViewColumn, ViewEntity } from 'typeorm'

@ViewEntity({
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	name: 'dvview_invinb'
})
export class InboundInventoryEntity {
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
}
