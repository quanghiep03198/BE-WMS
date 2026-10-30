import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	DefectiveGoods,
	DefectiveGoodsDocument,
	DefectiveGoodsModel
} from '@modules/defective-goods/infrastructure/persistence/mongodb/schemas/defective-goods.schema'
import { DefectiveGoodsEntity } from '@modules/defective-goods/infrastructure/persistence/mssql/entities/defective-goods.entity'
import { Department, DepartmentModel } from '@modules/department/schemas/department.schema'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bullmq'
import { LeanDocument, Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Repository } from 'typeorm'
import { DEFECTIVE_GOODS_SYNC_QUEUE } from '..'

@Processor(DEFECTIVE_GOODS_SYNC_QUEUE, { concurrency: 5 })
export class SyncDefectiveGoodsConsumer extends WorkerHost {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION) private readonly model: DefectiveGoodsModel,
		@InjectModel(Department.name, DATA_WAREHOUSE_CONNECTION) private readonly departments: DepartmentModel,
		@InjectRepository(DefectiveGoodsEntity, DATA_SOURCE_DATA_LAKE)
		private readonly mssql: Repository<DefectiveGoodsEntity>,
		@InjectPinoLogger(SyncDefectiveGoodsConsumer.name) private readonly logger: PinoLogger
	) {
		super()
	}

	async process({
		data
	}: Job<{ documentIds: string[]; audit: { createdBy?: string; updatedBy?: string } }>): Promise<void> {
		const raws = await this.model
			.find({ _id: { $in: data.documentIds.map((id) => new Types.ObjectId(id)) } })
			.lean<LeanDocument<DefectiveGoodsDocument>[]>({ virtuals: true, autopopulate: true })

		await this.mssql.query(
			/* SQL */ `
			WITH CTE AS (
				SELECT 
					JSON_VALUE(value, '$._id') AS sync_id, 
					JSON_VALUE(value, '$.epc') AS epc, 
					JSON_VALUE(value, '$.combination_strategy') AS ri_type,
					JSON_VALUE(value, '$.unit') AS unit,
					JSON_VALUE(value, '$.mo_no') AS mo_no,
					JSON_VALUE(value, '$.po') AS po,
					JSON_VALUE(value, '$.brand_name') AS brand_name,
					JSON_VALUE(value, '$.factory_shoes_style') AS factory_shoes_style,
					JSON_VALUE(value, '$.cust_shoes_style') AS cust_shoes_style,
					JSON_VALUE(value, '$.color_sn') AS color_sn,
					JSON_VALUE(value, '$.size_numcode') AS size_code,
					JSON_VALUE(value, '$.defective_category') AS defective_category,
					JSON_VALUE(value, '$.defective_location') AS defective_location,
					JSON_VALUE(value, '$.defective_description') AS defective_description,
					JSON_VALUE(value, '$.shoe_source') AS shoe_source,
					JSON_VALUE(value, '$.assembly_line.name.cn') AS assembly_line,
					JSON_VALUE(value, '$.sewing_line.name.cn') AS sewing_line,
					JSON_VALUE(value, '$.inbound_date') AS inbound_date,
					JSON_VALUE(value, '$.storage_location') AS storage_location,
					JSON_VALUE(value, '$.outbound_date') AS outbound_date,
					JSON_VALUE(value, '$.outbound_purpose') AS outbound_purpose,
					IIF(JSON_VALUE(value, '$.deleted') = 'true', 1, 0) AS ri_cancel,
					IIF(JSON_VALUE(value, '$.deleted') = 'false', 'N', 'Y') AS isactive,
					JSON_VALUE(value, '$.created_by.username') AS user_code_created,
					JSON_VALUE(value, '$.created_by.display_name') AS user_name_created,
					JSON_VALUE(value, '$.updated_by.username') AS user_code_updated,
					JSON_VALUE(value, '$.updated_by.display_name') AS user_name_updated
				FROM OPENJSON(@0)
			)
			MERGE INTO DV_DATA_LAKE.dbo.dv_defective_goods AS target
			USING (SELECT * FROM CTE) AS source
			ON target.sync_id = source.sync_id
			WHEN MATCHED THEN
				UPDATE SET
					target.unit = source.unit,
					target.ri_type = source.ri_type,
					target.brand_name = source.brand_name,
					target.mo_no = source.mo_no,
					target.po = source.po,
					target.factory_shoes_style = source.factory_shoes_style,
					target.cust_shoes_style = source.cust_shoes_style,
					target.color_sn = source.color_sn,
					target.size_code = source.size_code,
					target.defective_category = source.defective_category,
					target.defective_location = source.defective_location,
					target.defective_description = source.defective_description,
					target.shoe_source = source.shoe_source,
					target.storage_location = source.storage_location,
					target.assembly_line = source.assembly_line,
					target.sewing_line = source.sewing_line,
					target.ri_cancel = source.ri_cancel,
					target.isactive = source.isactive,
					target.user_code_created = source.user_code_created,
					target.user_name_created = source.user_name_created,
					target.user_code_updated = source.user_code_updated,
					target.user_name_updated = source.user_name_updated
			WHEN NOT MATCHED THEN
				INSERT (
					sync_id,
					epc, 
					unit,
					ri_type,
					mo_no,
					po,
					brand_name,
					factory_shoes_style,
					cust_shoes_style,
					color_sn,
					size_code,
					defective_category,
					defective_location,
					defective_description,
					shoe_source,
					assembly_line,
					sewing_line,
					inbound_date,
					storage_location,
					outbound_date,
					outbound_purpose,
					ri_cancel,
					isactive,
					user_code_created,
					user_name_created,
					user_code_updated,
					user_name_updated
				)
				VALUES (
					source.sync_id,
					source.epc, 
					source.unit,
					source.ri_type,
					source.mo_no,
					source.po,
					source.brand_name,
					source.factory_shoes_style,
					source.cust_shoes_style,
					source.color_sn,
					source.size_code,
					source.defective_category,
					source.defective_location,
					source.defective_description,
					source.shoe_source,
					source.assembly_line,
					source.sewing_line,
					source.inbound_date,
					source.storage_location,
					source.outbound_date,
					source.outbound_purpose,
					source.ri_cancel,
					source.isactive,
					source.user_code_created,
					source.user_name_created,
					source.user_code_updated,
					source.user_name_updated
				);
			`,
			[JSON.stringify(raws)]
		)

		this.logger.info({ raws }, 'Fetched defective goods raws')
	}
}
