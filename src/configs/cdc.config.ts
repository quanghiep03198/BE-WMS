import { CdcProvisionConfig } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATABASE_SCHEMA } from '@databases/constants'
import { registerAs } from '@nestjs/config'

export const CDC_CONFIG_TOKEN = Symbol('cdc')

export default registerAs(CDC_CONFIG_TOKEN, (): Array<CdcProvisionConfig> => [
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
	},
	{
		schema: DATABASE_SCHEMA,
		sourceName: 'dv_defective_goods',
		dataSourceToken: DATA_SOURCE_DATA_LAKE,
		capturedColumns: [
			'keyid', 'sync_id', 'epc', 'brand_name', 'mo_no', 'po', 'factory_shoes_style', 'cust_shoes_style',
			'color_sn', 'size_code', 'defective_category', 'defective_location', 'defective_description', 'shoe_source',
			'storage_location', 'sewing_line', 'assembly_line', 'ri_cancel', 'ri_type', 'inbound_date', 'outbound_date',
			'outbound_purpose', 'unit', 'user_code_created', 'user_name_created', 'user_code_updated', 'user_name_updated',
			'created', 'updated', 'isactive', 'remark'
		],
		supportsNetChanges: true
	}
])
