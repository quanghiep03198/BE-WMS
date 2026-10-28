import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	IDailyInboundDefectiveGoodsReport,
	IDailyOutboundDefectiveGoodsReport,
	IDefectiveGoodsReportRepository
} from '@modules/defective-goods/application/ports/defective-goods-report.repository.port'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { format } from 'date-fns'
import { DefectiveGoods, DefectiveGoodsModel } from '../schemas/defective-goods.schema'

@Injectable()
export class DefectiveGoodsReportRepository implements IDefectiveGoodsReportRepository {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsModel: DefectiveGoodsModel
	) {}

	async getDailyInboundReport(date: Date) {
		return await this.defectiveGoodsModel.aggregateWithDeleted<IDailyInboundDefectiveGoodsReport>([
			{
				$match: {
					$expr: {
						$and: [
							{
								$eq: [
									{ $dateToString: { date: '$inbound_date', format: '%Y-%m-%d' } },
									format(date, 'yyyy-MM-dd')
								]
							},
							{
								$ne: ['$storage_location', null]
							}
						]
					}
				}
			},
			{
				$addFields: {
					inbound_date_str: {
						$dateToString: {
							format: '%Y-%m-%d',
							date: '$inbound_date'
						}
					}
				}
			},
			{
				$group: {
					_id: {
						inbound_date: '$inbound_date_str',
						brand_name: '$brand_name',
						po: '$po',
						mo_no: '$mo_no',
						cust_shoes_style: '$cust_shoes_style',
						factory_shoes_style: '$factory_shoes_style',
						color_sn: '$color_sn',
						sewing_line: '$sewing_line',
						assembly_line: '$assembly_line',
						defective_category: '$defective_category',
						shoe_source: '$shoe_source',
						storage_location: '$storage_location',
						size_numcode: '$size_numcode'
					},
					qty: { $sum: 1 }
				}
			},
			{
				$group: {
					_id: {
						inbound_date: '$_id.inbound_date',
						brand_name: '$_id.brand_name',
						po: '$_id.po',
						mo_no: '$_id.mo_no',
						cust_shoes_style: '$_id.cust_shoes_style',
						factory_shoes_style: '$_id.factory_shoes_style',
						color_sn: '$_id.color_sn',
						sewing_line: '$_id.sewing_line',
						assembly_line: '$_id.assembly_line',
						defective_category: '$_id.defective_category',
						shoe_source: '$_id.shoe_source',
						storage_location: '$_id.storage_location'
					},
					size_ledger: {
						$push: {
							size_numcode: '$_id.size_numcode',
							qty: '$qty'
						}
					},
					total_qty: {
						$sum: '$qty'
					}
				}
			},
			{
				$lookup: {
					from: 'departments',
					localField: '_id.assembly_line',
					foreignField: '_id',
					as: 'assembly_line_info'
				}
			},
			{
				$lookup: {
					from: 'departments',
					localField: '_id.sewing_line',
					foreignField: '_id',
					as: 'sewing_line_info'
				}
			},
			{
				$addFields: {
					assembly_line_info: { $first: '$assembly_line_info' },
					sewing_line_info: { $first: '$sewing_line_info' }
				}
			},
			{
				$project: {
					_id: 0,
					date: '$_id.inbound_date',
					brand_name: '$_id.brand_name',
					po: '$_id.po',
					mo_no: '$_id.mo_no',
					cust_shoes_style: '$_id.cust_shoes_style',
					factory_shoes_style: '$_id.factory_shoes_style',
					color_sn: '$_id.color_sn',
					defective_category: '$_id.defective_category',
					sewing_line: '$sewing_line_info',
					assembly_line: '$assembly_line_info',
					shoe_source: '$_id.shoe_source',
					storage_location: '$_id.storage_location',
					size_ledger: 1,
					total_qty: 1
				}
			},
			{
				$sort: {
					date: 1,
					brand_name: 1,
					po: 1,
					mo_no: 1
				}
			}
		])
	}

	async getDailyOutboundReport(date: Date) {
		return await this.defectiveGoodsModel.aggregateWithDeleted<IDailyOutboundDefectiveGoodsReport>([
			{
				$match: {
					$expr: {
						$eq: [{ $dateToString: { date: '$outbound_date', format: '%Y-%m-%d' } }, format(date, 'yyyy-MM-dd')]
					},
					outbound_purpose: { $ne: null }
				}
			},
			{
				$group: {
					_id: {
						outbound_date: '$outbound_date',
						brand_name: '$brand_name',
						po: '$po',
						mo_no: '$mo_no',
						cust_shoes_style: '$cust_shoes_style',
						factory_shoes_style: '$factory_shoes_style',
						color_sn: '$color_sn',
						sewing_line: '$sewing_line',
						assembly_line: '$assembly_line',
						defective_category: '$defective_category',
						size_numcode: '$size_numcode',
						outbound_purpose: '$outbound_purpose'
					},
					qty: { $sum: 1 }
				}
			},
			{
				$group: {
					_id: {
						outbound_date: '$_id.outbound_date',
						brand_name: '$_id.brand_name',
						po: '$_id.po',
						mo_no: '$_id.mo_no',
						cust_shoes_style: '$_id.cust_shoes_style',
						factory_shoes_style: '$_id.factory_shoes_style',
						color_sn: '$_id.color_sn',
						defective_category: '$_id.defective_category',
						outbound_purpose: '$_id.outbound_purpose'
					},
					size_ledger: {
						$push: {
							size_numcode: '$_id.size_numcode',
							qty: '$qty'
						}
					}
				}
			},
			{
				$project: {
					_id: 0,
					date: '$_id.outbound_date',
					brand_name: '$_id.brand_name',
					po: '$_id.po',
					mo_no: '$_id.mo_no',
					cust_shoes_style: '$_id.cust_shoes_style',
					factory_shoes_style: '$_id.factory_shoes_style',
					color_sn: '$_id.color_sn',
					defective_category: '$_id.defective_category',
					size_ledger: 1
				}
			},
			{
				$sort: {
					outbound_date: 1,
					brand_name: 1,
					po: 1,
					mo_no: 1
				}
			}
		])
	}

	async getInventoryReport() {
		return await this.defectiveGoodsModel.aggregate([
			{
				$match: {
					inbound_date: { $ne: null },
					storage_location: { $ne: null },
					outbound_date: null,
					outbound_purpose: null
				}
			},
			{
				$group: {
					_id: {
						brand_name: '$brand_name',
						po: '$po',
						mo_no: '$mo_no',
						cust_shoes_style: '$cust_shoes_style',
						factory_shoes_style: '$factory_shoes_style',
						color_sn: '$color_sn',
						sewing_line: '$sewing_line',
						assembly_line: '$assembly_line',
						defective_category: '$defective_category',
						shoe_source: '$shoe_source',
						storage_location: '$storage_location',
						size_numcode: '$size_numcode'
					},
					qty: { $sum: 1 }
				}
			},
			{
				$group: {
					_id: {
						brand_name: '$_id.brand_name',
						po: '$_id.po',
						mo_no: '$_id.mo_no',
						cust_shoes_style: '$_id.cust_shoes_style',
						factory_shoes_style: '$_id.factory_shoes_style',
						color_sn: '$_id.color_sn',
						sewing_line: '$_id.sewing_line',
						assembly_line: '$_id.assembly_line',
						defective_category: '$_id.defective_category',
						shoe_source: '$_id.shoe_source',
						storage_location: '$_id.storage_location'
					},
					size_ledger: {
						$push: {
							size_numcode: '$_id.size_numcode',
							qty: '$qty'
						}
					},
					total_qty: {
						$sum: '$qty'
					}
				}
			},
			{
				$lookup: {
					from: 'departments',
					localField: '_id.assembly_line',
					foreignField: '_id',
					as: 'assembly_line_info'
				}
			},
			{
				$lookup: {
					from: 'departments',
					localField: '_id.sewing_line',
					foreignField: '_id',
					as: 'sewing_line_info'
				}
			},
			{
				$addFields: {
					assembly_line_info: { $first: '$assembly_line_info' },
					sewing_line_info: { $first: '$sewing_line_info' }
				}
			},
			{
				$project: {
					_id: 0,
					brand_name: '$_id.brand_name',
					po: '$_id.po',
					mo_no: '$_id.mo_no',
					cust_shoes_style: '$_id.cust_shoes_style',
					factory_shoes_style: '$_id.factory_shoes_style',
					color_sn: '$_id.color_sn',
					defective_category: '$_id.defective_category',
					sewing_line: '$sewing_line_info',
					assembly_line: '$assembly_line_info',
					shoe_source: '$_id.shoe_source',
					storage_location: '$_id.storage_location',
					size_ledger: 1,
					total_qty: 1
				}
			},
			{
				$sort: {
					date: 1,
					brand_name: 1,
					po: 1,
					mo_no: 1
				}
			}
		])
	}
}
