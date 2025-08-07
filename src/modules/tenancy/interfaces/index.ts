import { FactoryCode } from '../../department/constants'
import { Tenant } from '../constants'

export interface ITenancy {
	id: Tenant
	factory: Array<FactoryCode> | FactoryCode
	alias: string
	host: string
}
