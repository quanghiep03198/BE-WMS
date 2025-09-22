export enum Tenant {
	DEV = 'tenant-dev',
	CENTRAL = 'tenant-central', // 10.30.0.21
	GL1 = 'tenant-gl1', // 10.30.80.2
	GL3 = 'tenant-gl3', // 10.30.201.202
	GL4 = 'tenant-gl4' // 10.50.5.1
}

export const TENANCY_DATA_SOURCE = 'TENANCY_DATA_SOURCE' as const
