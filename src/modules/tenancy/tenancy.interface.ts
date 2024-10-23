import { Tenant } from '@/common/constants'
import { Request } from 'express'
import { DataSource } from 'typeorm'
import { FactoryCode } from '../department/constants'

export interface ITenancy {
	id: Tenant
	factories: Array<FactoryCode>
	host: string
}

export interface DynamicTenancyRequest extends Request {
	dataSource: DataSource
}
