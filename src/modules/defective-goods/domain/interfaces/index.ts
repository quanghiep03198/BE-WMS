import { IDepartment } from '@modules/department/department.repository.interface'
import { IUser } from '@modules/user/domain/interfaces'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveLocation
} from '../constants'

export interface IDefectiveGoods {
	_id?: TObjectId
	epc: string
	combination_strategy: CombinationStrategy
	defective_category: DefectiveCategory
	po?: Nullish<string>
	mo_no?: Nullish<string>
	brand_name: string
	cust_shoes_style: string
	factory_shoes_style: string
	color_sn: string
	size_numcode: string
	unit: 'prs' | 'pcs'
	defective_location: DefectiveLocation
	shoe_source?: DefectiveGoodsSource
	defective_description: string
	sewing_line?: IDepartment | TObjectId | string
	assembly_line?: IDepartment | TObjectId | string
	storage_location?: string
	inbound_date?: Date
	outbound_date?: Date
	outbound_purpose?: DefectiveGoodsOutboundPurpose
	created_by: IUser | TObjectId
	created_at?: Date
	updated_by?: IUser | TObjectId
	updated_at?: Date
	deleted?: boolean
	deleted_at?: Date
}
