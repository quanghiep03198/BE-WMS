export enum Tenant {
	DEV = 'tenant-dev',
	MAIN = 'tenant-main', // 10.30.0.21
	VN_LIANYING_PRIMARY = 'tenant-lianying-primary', // 10.30.80.2
	VN_LIANYING_SECONDARY = 'tenant-lianying-secondary', // 10.30.80.1
	VN_LIANSHUN_PRIMARY = 'tenant-lianshun-primary', // 10.30.201.202
	VN_LIANSHUN_SECONDARY = 'tenant-lianshun-secondary', // 10.30.201.201
	KM_PRIMARY = 'tenant-cambodia-primary', // 10.50.5.1
	KM_SECONDARY = 'tenant-cambodia-secondary' // 10.50.5.251
}

export const TENANCY_DATASOURCE = 'TENANCY_DATASOURCE' as const
