import { CdcHandler } from '@databases/cdc/decorators'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION, DATABASE_SCHEMA, RecordStatus } from '@databases/constants'
import { CombinationStrategy } from '@modules/defective-goods/domain/constants'
import { Department, DepartmentModel } from '@modules/department/schemas/department.schema'
import { decodeDescription } from '@modules/files/description-codec'
import { FilesService } from '@modules/files/files.service'
import { HtmlSanitizerService } from '@modules/files/html-sanitizer.service'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { Connection, Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { createHash } from 'node:crypto'
import { DefectiveGoods, DefectiveGoodsModel } from '../persistence/mongodb/schemas/defective-goods.schema'

export const DEFECTIVE_GOODS_TABLE = 'dv_defective_goods'

type DefectiveGoodsCdcRow = {
	keyid: number
	sync_id?: string | null
	epc: string
	brand_name: string | null
	mo_no: string | null
	po: string | null
	factory_shoes_style: string
	cust_shoes_style: string
	color_sn: string
	size_code: string
	defective_category: string
	defective_location: string
	defective_description: string
	shoe_source: string
	storage_location: string | null
	sewing_line: string | null
	assembly_line: string | null
	ri_cancel: boolean | number | string
	ri_type: CombinationStrategy
	inbound_date: Date | null
	outbound_date: Date | null
	outbound_purpose: string | null
	unit: 'prs' | 'pcs'
	user_code_created: string | null
	user_code_updated: string | null
	isactive: string
}

@CdcHandler({
	schema: DATABASE_SCHEMA,
	sourceName: 'dv_defective_goods',
	dataSourceToken: DATA_SOURCE_DATA_LAKE,
	pollIntervalMs: 1000,
	lockTtlMs: 30_000,
	originMarkerColumn: 'sync_id'
})
export class DefectiveGoodsCdcHandler implements ICdcHandler<DefectiveGoodsCdcRow> {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION) private readonly model: DefectiveGoodsModel,
		@InjectModel(Department.name, DATA_WAREHOUSE_CONNECTION) private readonly departments: DepartmentModel,
		@InjectConnection(DATA_WAREHOUSE_CONNECTION) private readonly connection: Connection,
		private readonly files: FilesService,
		private readonly sanitizer: HtmlSanitizerService,
		@InjectPinoLogger(DefectiveGoodsCdcHandler.name) private readonly logger: PinoLogger
	) {}

	async handle({ changes }: CdcChangeContext<DefectiveGoodsCdcRow>): Promise<void> {
		const departmentIds = await this.loadDepartmentIds(changes)

		let processed = 0

		for (const change of changes) {
			for (const row of change.data) {
				if (!row.sync_id || !Types.ObjectId.isValid(row.sync_id)) continue
				const _id = new Types.ObjectId(row.sync_id)

				const isCancelled =
					row.ri_cancel === true ||
					Number.parseInt(String(row.ri_cancel)) === 1 ||
					row.isactive === RecordStatus.INACTIVE

				if (change.operation === 'delete' || (change.operation === 'update' && isCancelled)) {
					// Tương đương model.delete({ _id }) của mongoose-delete. Phải khớp tên field mà plugin đang ghi.
					await this.model.collection.updateOne({ _id }, { $set: { deleted: true, deleted_at: new Date() } })
					processed++
					continue
				}
				if (isCancelled) continue

				const session = await this.connection.startSession()
				try {
					await session.withTransaction(
						async () => {
							const existing = await this.model.collection.findOne({ _id }, { session })
							const decoded = await decodeDescription(row.defective_description)
							const legacy = decoded !== row.defective_description || /data:image\//i.test(decoded)
							const document = this.toDocument(row, departmentIds)
							const sourceHash = createHash('sha256').update(row.defective_description).digest('hex')
							if (existing?.description_legacy_hash === sourceHash) {
								delete document.defective_description
							} else if (legacy && existing?.description_image_ids !== undefined) {
								throw new Error(`CDC contains an unmigrated description for ${_id}`)
							} else if (!legacy) {
								const { html, imageIds } = this.sanitizer.sanitize(decoded)
								await this.files.syncImageRefs(
									`defective-goods:${_id}`,
									existing?.description_image_ids ?? [],
									imageIds,
									session
								)
								Object.assign(document, { defective_description: html, description_image_ids: imageIds })
							}
							await this.model.collection.updateOne({ _id }, { $set: document }, { upsert: true, session })
						},
						{ readPreference: 'primary' }
					)
				} finally {
					await session.endSession()
				}
				processed++
			}
		}

		this.logger.info(
			`Processed ${changes.reduce((total, group) => total + group.data.length, 0)} defective goods CDC rows (${processed} write ops)`
		)
	}

	/** Tra cứu phòng ban một lần cho cả lượt, tên đã loại trùng. */
	private async loadDepartmentIds(
		changes: CdcChangeContext<DefectiveGoodsCdcRow>['changes']
	): Promise<Map<string, Types.ObjectId>> {
		const names = new Set<string>()
		for (const { data } of changes) {
			for (const { assembly_line, sewing_line } of data) {
				if (assembly_line) names.add(assembly_line)
				if (sewing_line) names.add(sewing_line)
			}
		}
		if (names.size === 0) return new Map()

		const departments = await this.departments
			.find({ 'name.cn': { $in: [...names] } })
			.select({ _id: 1, 'name.cn': 1 })
			.lean()
			.exec()

		return new Map(departments.map((department) => [department.name.cn, department._id]))
	}

	private toDocument(row: DefectiveGoodsCdcRow, departmentIds: Map<string, Types.ObjectId>) {
		return {
			epc: row.epc,
			brand_name: row.brand_name,
			mo_no: row.mo_no,
			po: row.po,
			factory_shoes_style: row.factory_shoes_style,
			cust_shoes_style: row.cust_shoes_style,
			color_sn: row.color_sn,
			size_numcode: row.size_code,
			defective_category: row.defective_category,
			defective_location: row.defective_location,
			defective_description: row.defective_description,
			shoe_source: row.shoe_source,
			storage_location: row.storage_location,
			...this.departmentField('assembly_line', row.assembly_line, departmentIds),
			...this.departmentField('sewing_line', row.sewing_line, departmentIds),
			combination_strategy: row.ri_type,
			inbound_at: row.inbound_date,
			outbound_at: row.outbound_date,
			outbound_purpose: row.outbound_purpose,
			unit: row.unit,
			deleted: false,
			deleted_at: null
		}
	}

	/** null => xóa liên kết; tìm thấy phòng ban => gán; không tìm thấy => giữ nguyên giá trị cũ. */
	private departmentField(
		field: 'assembly_line' | 'sewing_line',
		name: string | null,
		departmentIds: Map<string, Types.ObjectId>
	): Record<string, Types.ObjectId | null> {
		if (name === null) return { [field]: null }
		const id = departmentIds.get(name)
		return id ? { [field]: id } : {}
	}
}
