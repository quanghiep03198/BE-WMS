import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	DefectiveGoods,
	DefectiveGoodsModel
} from '@modules/defective-goods/infrastructure/persistence/mongodb/schemas/defective-goods.schema'
import { DefectiveGoodsEntity } from '@modules/defective-goods/infrastructure/persistence/mssql/entities/defective-goods.entity'
import { Department, DepartmentModel } from '@modules/department/schemas/department.schema'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bullmq'
import { Types } from 'mongoose'
import { Repository } from 'typeorm'
import { DEFECTIVE_GOODS_SYNC_QUEUE } from '..'

@Processor(DEFECTIVE_GOODS_SYNC_QUEUE, { concurrency: 5 })
export class SyncDefectiveGoodsConsumer extends WorkerHost {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION) private readonly model: DefectiveGoodsModel,
		@InjectModel(Department.name, DATA_WAREHOUSE_CONNECTION) private readonly departments: DepartmentModel,
		@InjectRepository(DefectiveGoodsEntity, DATA_SOURCE_DATA_LAKE)
		private readonly mssql: Repository<DefectiveGoodsEntity>
	) {
		super()
	}

	async process({
		data
	}: Job<{ documentIds: string[]; audit: { createdBy?: string; updatedBy?: string } }>): Promise<void> {
		for (const documentId of data.documentIds) {
			if (!Types.ObjectId.isValid(documentId)) continue
			const _id = new Types.ObjectId(documentId)
			const syncId = _id.toString()
			const raw = (await this.model.findOneWithDeleted({ _id })) as
				(DefectiveGoods & { _id: Types.ObjectId; deleted?: boolean }) | null
			let row = await this.mssql.findOneBy({ sync_id: syncId })
			if (!raw) continue
			if (raw.deleted || raw.deleted_at) {
				if (row)
					await this.mssql.update(
						{ sync_id: syncId },
						{
							ri_cancel: true,
							is_active: false,
							outbound_date: raw.outbound_date,
							outbound_purpose: raw.outbound_purpose,
							defective_category: raw.defective_category,
							po: raw.po,
							user_code_updated: data.audit.updatedBy
						}
					)
				continue
			}
			const [assemblyLine, sewingLine] = await Promise.all([
				this.getDepartmentName(raw.assembly_line),
				this.getDepartmentName(raw.sewing_line)
			])
			const values = {
				sync_id: syncId,
				epc: raw.epc,
				brand_name: raw.brand_name,
				mo_no: raw.mo_no,
				po: raw.po,
				factory_shoes_style: raw.factory_shoes_style,
				cust_shoes_style: raw.cust_shoes_style,
				color_sn: raw.color_sn,
				size_code: raw.size_numcode,
				defective_category: raw.defective_category,
				defective_location: raw.defective_location,
				defective_description: raw.defective_description,
				shoe_source: raw.shoe_source,
				storage_location: raw.storage_location,
				ri_cancel: false,
				is_active: true,
				ri_type: raw.combination_strategy,
				inbound_date: raw.inbound_date,
				outbound_date: raw.outbound_date,
				outbound_purpose: raw.outbound_purpose,
				unit: raw.unit,
				...(assemblyLine !== undefined && { assembly_line: assemblyLine }),
				...(sewingLine !== undefined && { sewing_line: sewingLine }),
				...(data.audit.updatedBy && { user_code_updated: data.audit.updatedBy })
			}
			if (!row) row = this.mssql.create({ ...values, user_code_created: data.audit.createdBy })
			else Object.assign(row, values)
			await this.mssql.save(row)
		}
	}

	private async getDepartmentName(id?: Types.ObjectId): Promise<string | null | undefined> {
		if (!id) return null
		const department = await this.departments.findById(id).select({ 'name.cn': 1 }).lean().exec()
		return department?.name?.cn
	}
}
