export const DATABASE_DATA_LAKE = 'DV_DATA_LAKE' as const
export const DATABASE_SYSCLOUD = 'syscloud_vn' as const
export const DATABASE_ERP = 'wuerp_vnrd' as const

export const DATA_SOURCE_DATA_LAKE = 'DATA_LAKE' as const
export const DATA_SOURCE_SYSCLOUD = 'SYSCLOUD' as const
export const DATA_SOURCE_ERP = 'ERP' as const

export enum RecordStatus {
	ACTIVE = 'Y',
	INACTIVE = 'N'
}

export enum LinkedServer {
	VA1 = 'DV_SERVER802',
	VB2 = 'DV_SERVER202',
	CA1 = 'DV_SERVER51'
}
