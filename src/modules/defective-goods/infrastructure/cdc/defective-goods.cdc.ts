import { CdcHandler } from '@databases/cdc/decorators'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION, DATABASE_SCHEMA, RecordStatus } from '@databases/constants'
import { Department, DepartmentModel } from '@modules/department/schemas/department.schema'
import { InjectModel } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
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
	ri_type: 'uhf' | 'usb' | 'manually'
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
	sourceName: DEFECTIVE_GOODS_TABLE,
	dataSourceToken: DATA_SOURCE_DATA_LAKE,
	pollIntervalMs: 1000,
	originMarkerColumn: 'sync_id'
})
export class DefectiveGoodsCdcHandler implements ICdcHandler<DefectiveGoodsCdcRow> {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION) private readonly model: DefectiveGoodsModel,
		@InjectModel(Department.name, DATA_WAREHOUSE_CONNECTION) private readonly departments: DepartmentModel,
		@InjectPinoLogger(DefectiveGoodsCdcHandler.name) private readonly logger: PinoLogger
	) {}

	async handle({ changes }: CdcChangeContext<DefectiveGoodsCdcRow>): Promise<void> {
		const departmentNames = changes
			.flatMap(({ data }) => data.flatMap(({ assembly_line, sewing_line }) => [assembly_line, sewing_line]))
			.filter((name): name is string => Boolean(name))
		const departments = await this.departments
			.find({ 'name.cn': { $in: departmentNames } })
			.select({ _id: 1, 'name.cn': 1 })
			.lean()
			.exec()
		const departmentIds = new Map(departments.map((department) => [department.name.cn, department._id]))

		for (const change of changes) {
			for (const row of change.data) {
				if (!row.sync_id || !Types.ObjectId.isValid(row.sync_id)) continue
				const _id = new Types.ObjectId(row.sync_id)
				const isCancelled =
					row.ri_cancel === true ||
					row.ri_cancel === 1 ||
					row.ri_cancel === '1' ||
					row.isactive === RecordStatus.INACTIVE
				if (change.operation === 'delete' || (change.operation === 'update' && isCancelled)) {
					await this.model.deleteOne({ _id }).exec()
					await this.model.collection.updateOne({ _id }, { $set: { deleted_at: new Date() } })
					continue
				}
				if (isCancelled) continue
				await this.model.collection.updateOne(
					{ _id },
					{
						$set: {
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
							...(row.assembly_line === null
								? { assembly_line: null }
								: departmentIds.has(row.assembly_line) && {
										assembly_line: departmentIds.get(row.assembly_line)
									}),
							...(row.sewing_line === null
								? { sewing_line: null }
								: departmentIds.has(row.sewing_line) && { sewing_line: departmentIds.get(row.sewing_line) }),
							combination_strategy: row.ri_type,
							inbound_date: row.inbound_date,
							outbound_date: row.outbound_date,
							outbound_purpose: row.outbound_purpose,
							unit: row.unit,
							deleted: false,
							deleted_at: null
						}
					},
					{ upsert: true }
				)
			}
		}
		this.logger.debug(
			`Processed ${changes.reduce((total, group) => total + group.data.length, 0)} defective goods CDC rows`
		)
	}
}
