import { env } from '@common/utils'
import { CdcProvisionConfig } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATABASE_SCHEMA } from '@databases/constants'
import { registerAs } from '@nestjs/config'

export const CDC_CONFIG_TOKEN = Symbol('cdc')

export default registerAs(CDC_CONFIG_TOKEN, (): Array<CdcProvisionConfig> =>
	env<string>('DB_HOST') !== '10.30.0.18'
		? []
		: [
				{
					schema: DATABASE_SCHEMA,
					sourceName: 'dv_truckload_delivery',
					dataSourceToken: DATA_SOURCE_DATA_LAKE,
					capturedColumns: [
						'keyid',
						'sync_id',
						'dispatch_order',
						'po',
						'outbound_qty',
						'factory_code',
						'approval_status',
						'isactive',
						'license_plate',
						'container_number',
						'seal_number',
						'factory_entrance_time',
						'container_sealing_time',
						'factory_departure_time',
						'actual_factory_departure_time'
					],
					supportsNetChanges: true
				},
				{
					schema: DATABASE_SCHEMA,
					sourceName: 'dv_carlicenseplates',
					dataSourceToken: DATA_SOURCE_DATA_LAKE,
					capturedColumns: ['keyid', 'plate_name', 'images', 'snap_time'],
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
						'factory_code_produce',
						'sync_id'
					],
					supportsNetChanges: true
				},
				{
					schema: DATABASE_SCHEMA,
					sourceName: 'dv_warehouseccodemst',
					dataSourceToken: DATA_SOURCE_DATA_LAKE,
					capturedColumns: ['keyid', 'warehouse_name', 'sync_id'],
					supportsNetChanges: true
				},
				{
					schema: DATABASE_SCHEMA,
					sourceName: 'dv_warehouseccodedet',
					dataSourceToken: DATA_SOURCE_DATA_LAKE,
					capturedColumns: ['keyid', 'storage_name', 'warehouse_id', 'sync_id'],
					supportsNetChanges: true
				}
			]
)
