import { DefectiveGoodsSource } from '@modules/defective-goods/domain/constants'

export const DEFECTIVE_GOODS_REPORT_REPOSITORY = Symbol('DEFECTIVE_GOODS_REPORT_REPOSITORY')

export interface IDefectiveGoodsReport {
	brand_name: string
	po: string
	mo_no: string
	cust_shoes_style: string
	factory_shoes_style: string
	color_sn: string
	defective_category: string
	shoe_source: DefectiveGoodsSource
	sewing_line: string
	assembly_line: string
	storage_location: string
	size_data: {
		size_numcode: string
		qty: any
	}[]
	total_qty: number
}

export interface IDailyInboundDefectiveGoodsReport extends IDefectiveGoodsReport {}

export interface IDailyOutboundDefectiveGoodsReport extends Omit<IDefectiveGoodsReport, 'storage_location'> {
	outbound_purpose: string
}

export interface IDefectiveGoodsReportRepository {
	getDailyInboundReport(date: Date): Promise<IDailyInboundDefectiveGoodsReport[]>
	getDailyOutboundReport(date: Date): Promise<IDailyOutboundDefectiveGoodsReport[]>
	getInventoryReport(): Promise<IDefectiveGoodsReport[]>
}
