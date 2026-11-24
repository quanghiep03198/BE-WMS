import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { formatReportDate } from '@modules/defective-goods/application/helpers/format-report-date'
import {
	IDailyInboundDefectiveGoodsReport,
	IDailyOutboundDefectiveGoodsReport,
	IDefectiveGoodsReportDepartment,
	IDefectiveGoodsReportRepository
} from '@modules/defective-goods/application/ports/defective-goods-report.repository.port'
import {
	DefectiveGoodsStockedInEvent,
	DefectiveGoodsStockedOutEvent
} from '@modules/defective-goods/domain/events/defective-goods.events'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ClientSession, Types } from 'mongoose'
import { createHash } from 'node:crypto'
import {
	DefectiveGoodsDailyReport,
	DefectiveGoodsDailyReportModel
} from '../schemas/defective-goods-daily-report.schema'
import { DefectiveGoods, DefectiveGoodsModel } from '../schemas/defective-goods.schema'
import { departmentId, ReportFields, reportFields, reportKey, StoredReport } from './defective-goods-report.helpers'
import { defectiveGoodsDailyReportPipeline } from './defective-goods-report.pipeline'

@Injectable()
export class DefectiveGoodsReportRepository implements IDefectiveGoodsReportRepository {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsModel: DefectiveGoodsModel,
		@InjectModel(DefectiveGoodsDailyReport.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsDailyReportModel: DefectiveGoodsDailyReportModel
	) {}

	async getDailyInboundReport(date: Date) {
		const reports = await this.defectiveGoodsDailyReportModel
			.find({ date: formatReportDate(date), type: 'inbound' satisfies StockFlow }, { report_key: 0 })
			.lean<StoredReport<IDailyInboundDefectiveGoodsReport>[]>({ virtuals: true })
		return await this.resolveReportDepartments(reports)
	}

	async getDailyOutboundReport(date: Date) {
		const reports = await this.defectiveGoodsDailyReportModel
			.find({ date: formatReportDate(date), type: 'outbound' satisfies StockFlow }, { report_key: 0 })
			.lean<StoredReport<IDailyOutboundDefectiveGoodsReport>[]>({ virtuals: true })
		return await this.resolveReportDepartments(reports)
	}

	private async resolveReportDepartments<T extends { sewing_line?: unknown; assembly_line?: unknown }>(reports: T[]) {
		const ids = new Map<string, Types.ObjectId>()
		for (const report of reports) {
			for (const line of [report.sewing_line, report.assembly_line]) {
				const id = departmentId(line)
				if (id) ids.set(id.toHexString(), id)
			}
		}
		const departments = ids.size
			? await this.defectiveGoodsDailyReportModel.db
					.collection('departments')
					.find<IDefectiveGoodsReportDepartment>({ _id: { $in: Array.from(ids.values()) } })
					.toArray()
			: []
		const byId = new Map(departments.map((department) => [String(department._id), department]))
		return reports.map((report) => {
			const sewing = departmentId(report.sewing_line)
			const assembly = departmentId(report.assembly_line)
			return {
				...report,
				sewing_line: sewing ? (byId.get(sewing.toHexString()) ?? null) : null,
				assembly_line: assembly ? (byId.get(assembly.toHexString()) ?? null) : null
			}
		})
	}

	async mergeStockEvents(
		events: Array<DefectiveGoodsStockedInEvent | DefectiveGoodsStockedOutEvent>,
		session: ClientSession
	) {
		const groups = new Map<string, { fields: ReportFields; sizes: Map<string, number>; timestamp: Date }>()
		for (const event of events) {
			if (!(event instanceof DefectiveGoodsStockedInEvent) && !(event instanceof DefectiveGoodsStockedOutEvent))
				throw new Error('Unsupported defective goods stock event')
			const data = event.reportData
			const inbound = event instanceof DefectiveGoodsStockedInEvent
			const timestamp = inbound ? data.inbound_at : data.outbound_at
			if (!timestamp) throw new Error('Stock event is missing its transaction date')
			const fields: ReportFields = {
				date: formatReportDate(timestamp),
				type: inbound ? 'inbound' : 'outbound',
				brand_name: data.brand_name,
				po: data.po ?? null,
				mo_no: data.mo_no ?? null,
				cust_shoes_style: data.cust_shoes_style,
				factory_shoes_style: data.factory_shoes_style,
				color_sn: data.color_sn,
				sewing_line: data.sewing_line ?? null,
				assembly_line: data.assembly_line ?? null,
				defective_category: data.defective_category,
				shoe_source: data.shoe_source ?? null,
				...(inbound ? { storage_location: data.storage_location } : { outbound_purpose: data.outbound_purpose })
			}
			const key = reportKey(fields)
			const group = groups.get(key) ?? { fields, sizes: new Map<string, number>(), timestamp }
			group.sizes.set(data.size_numcode, (group.sizes.get(data.size_numcode) ?? 0) + 1)
			groups.set(key, group)
		}

		const rebuilt = new Set<string>()
		const days = new Map<string, { fields: ReportFields; timestamp: Date }>()
		for (const group of groups.values()) days.set(`${group.fields.date}:${group.fields.type}`, group)
		for (const [dayKey, { fields, timestamp }] of days) {
			const lockId = new Types.ObjectId(createHash('sha256').update(dayKey).digest().subarray(0, 12))
			await this.defectiveGoodsDailyReportModel.db
				.collection('defective_goods_report_locks')
				.updateOne({ _id: lockId }, { $inc: { version: 1 } }, { upsert: true, session })
			const filter = { date: fields.date, type: fields.type }
			const legacy = await this.defectiveGoodsDailyReportModel.collection.findOne(
				{ ...filter, report_key: { $exists: false } },
				{ session }
			)
			if (!legacy) continue

			const from = new Date(Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate()))
			const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
			const rows = await this.defectiveGoodsModel
				.aggregateWithDeleted<IDailyInboundDefectiveGoodsReport | IDailyOutboundDefectiveGoodsReport>(
					defectiveGoodsDailyReportPipeline(fields.type, { from, to })
				)
				.session(session)
			if (!rows.length) throw new Error(`Cannot rebuild legacy defective goods report ${dayKey}: no source data`)
			const previous = await this.defectiveGoodsDailyReportModel.collection
				.find<DefectiveGoodsDailyReport & { _id: Types.ObjectId }>(filter, { session })
				.toArray()
			const rebuiltRows = rows.map((row) => {
				const dimensions = reportFields(row, fields.date, fields.type)
				return { row, dimensions, key: reportKey(dimensions) }
			})
			const byKey = new Map(rebuiltRows.map(({ key, row }) => [key, row]))
			if (byKey.size !== rebuiltRows.length)
				throw new Error(`Cannot rebuild legacy defective goods report ${dayKey}: ambiguous report dimensions`)
			for (const saved of previous) {
				const current = byKey.get(reportKey(reportFields(saved, fields.date, fields.type)))
				if (
					!current ||
					!Array.isArray(saved.size_ledger) ||
					saved.size_ledger.some(
						(entry) =>
							typeof entry.size_numcode !== 'string' ||
							!Number.isSafeInteger(entry.qty) ||
							entry.qty < 0 ||
							(current.size_ledger.find((item) => item.size_numcode === entry.size_numcode)?.qty ?? 0) <
								entry.qty
					)
				)
					throw new Error(
						`Cannot rebuild legacy defective goods report ${dayKey}: source data does not cover the previous report`
					)
			}
			await this.defectiveGoodsDailyReportModel.db.collection('defective_goods_daily_report_archive').insertMany(
				previous.map(({ _id, ...report }) => ({ ...report, original_report_id: _id, archived_at: new Date() })),
				{ session }
			)
			await this.defectiveGoodsDailyReportModel.collection.deleteMany(filter, { session })
			const now = new Date()
			await this.defectiveGoodsDailyReportModel.collection.insertMany(
				rebuiltRows.map(({ row, dimensions, key }) => {
					return {
						...dimensions,
						report_key: key,
						size_ledger: row.size_ledger,
						created_at: now,
						updated_at: now
					}
				}),
				{ session }
			)
			rebuilt.add(dayKey)
		}

		const operations = Array.from(groups, ([reportKey, group]) => {
			const incoming = Array.from(group.sizes, ([size_numcode, qty]) => ({ size_numcode, qty }))
			if (rebuilt.has(`${group.fields.date}:${group.fields.type}`)) return null
			return {
				updateOne: {
					filter: { report_key: reportKey },
					update: [
						{
							$set: {
								...Object.fromEntries(
									Object.entries({ ...group.fields, report_key: reportKey }).map(([key, value]) => [
										key,
										{ $literal: value }
									])
								),
								created_at: { $ifNull: ['$created_at', '$$NOW'] },
								updated_at: '$$NOW',
								size_ledger: {
									$map: {
										input: {
											$setUnion: [
												{ $ifNull: ['$size_ledger.size_numcode', []] },
												{ $literal: incoming.map((item) => item.size_numcode) }
											]
										},
										as: 'size',
										in: {
											size_numcode: '$$size',
											qty: {
												$sum: {
													$map: {
														input: {
															$concatArrays: [{ $ifNull: ['$size_ledger', []] }, { $literal: incoming }]
														},
														as: 'item',
														in: { $cond: [{ $eq: ['$$item.size_numcode', '$$size'] }, '$$item.qty', 0] }
													}
												}
											}
										}
									}
								}
							}
						}
					],
					upsert: true
				}
			}
		}).filter((operation) => operation !== null)
		if (operations.length) await this.defectiveGoodsDailyReportModel.collection.bulkWrite(operations, { session })
	}

	async getInventoryReport() {
		return await this.defectiveGoodsModel.aggregate([
			{
				$match: {
					inbound_at: { $ne: null },
					storage_location: { $ne: null },
					outbound_at: null,
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
