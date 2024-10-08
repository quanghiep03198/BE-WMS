import { Tenant } from '@/common/constants'
import { Request } from 'express'
import { DataSource } from 'typeorm'

export interface ITenancy {
	id: Tenant
	location: 'Vietnam' | 'Cambodia'
	host: string
}

export interface DynamicTenancyRequest extends Request {
	dataSource: DataSource
}
