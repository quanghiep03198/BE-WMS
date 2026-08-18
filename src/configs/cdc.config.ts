import { CdcProvisionConfig } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATABASE_SCHEMA } from '@databases/constants'
import { registerAs } from '@nestjs/config'

export default registerAs(
	'cdc',
	() =>
		[
			{
				schema: DATABASE_SCHEMA,
				sourceName: 'dv_truckload_delivery',
				dataSourceToken: DATA_SOURCE_DATA_LAKE,
				capturedColumns: [
					'keyid',
					'dispatch_order',
					'approval_status',
					'po',
					'license_plate',
					'container_number',
					'container_sealing_time',
					'factory_departure_time',
					'actual_factory_departure_time'
				],
				supportsNetChanges: true
			},
			{
				schema: DATABASE_SCHEMA,
				sourceName: 'dv_rfidmatchmst_cust',
				dataSourceToken: DATA_SOURCE_DATA_LAKE,
				capturedColumns: [
					'keyid',
					'EPC_Code',
					'mo_no',
					'mo_no_actual',
					'shoestyle_codefactory',
					'cust_shoestyle',
					'color_sn',
					'size_numcode',
					'sync_id'
				],
				supportsNetChanges: true
			}
		] satisfies CdcProvisionConfig[]
)
