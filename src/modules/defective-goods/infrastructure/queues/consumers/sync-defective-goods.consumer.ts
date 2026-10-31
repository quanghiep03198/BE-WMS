import { CdcEchoRegistryService } from '@databases/cdc/services/cdc-echo-registery.service'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { SyncDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/sync-defective-goods/sync-defective-goods.command'
import {
	DefectiveGoods,
	DefectiveGoodsDocument,
	DefectiveGoodsModel
} from '@modules/defective-goods/infrastructure/persistence/mongodb/schemas/defective-goods.schema'
import { DefectiveGoodsEntity } from '@modules/defective-goods/infrastructure/persistence/mssql/entities/defective-goods.entity'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bullmq'
import { LeanDocument, Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Repository } from 'typeorm'
import { DEFECTIVE_GOODS_SYNC_QUEUE } from '..'
import syncDefectiveGoodsSql from '../../persistence/mssql/sql/sync-defective-goods.sql'

/** Phải khớp với sourceName của DefectiveGoodsCdcHandler (DEFECTIVE_GOODS_TABLE). */
const CDC_SOURCE_NAME = 'dv_defective_goods'

/** Số document tối đa cho mỗi lần đọc Mongo và MERGE. */
const SYNC_BATCH_SIZE = 1000

@Processor(DEFECTIVE_GOODS_SYNC_QUEUE, { concurrency: 3 })
export class SyncDefectiveGoodsConsumer extends WorkerHost {
	constructor(
		@InjectPinoLogger(SyncDefectiveGoodsConsumer.name) private readonly logger: PinoLogger,
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION) private readonly model: DefectiveGoodsModel,

		@InjectRepository(DefectiveGoodsEntity, DATA_SOURCE_DATA_LAKE)
		private readonly mssql: Repository<DefectiveGoodsEntity>,
		private readonly echoRegistry: CdcEchoRegistryService
	) {
		super()
	}

	async process({ data }: Job<SyncDefectiveGoodsCommand>): Promise<void> {
		const startedAt = Date.now()
		let synced = 0

		for (let i = 0; i < data.syncIds.length; i += SYNC_BATCH_SIZE) {
			const ids = data.syncIds.slice(i, i + SYNC_BATCH_SIZE)

			const raws = await this.model
				.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
				.lean<LeanDocument<DefectiveGoodsDocument>[]>({ virtuals: true, autopopulate: true })

			if (raws.length === 0) continue

			// Đăng ký marker echo TRƯỚC khi ghi MSSQL, để CDC (poll mỗi giây) không đọc thấy dòng trước khi marker tồn tại.
			// await this.echoRegistry.registerOrigins(
			// 	DATA_SOURCE_DATA_LAKE,
			// 	DATABASE_SCHEMA,
			// 	CDC_SOURCE_NAME,
			// 	raws.map((raw) => String(raw._id))
			// )

			await this.mssql.query(syncDefectiveGoodsSql, [JSON.stringify(raws)])
			synced += raws.length

			this.logger.info(
				{ requested: data.syncIds.length, synced, durationMs: Date.now() - startedAt },
				'Synced defective goods to MSSQL'
			)
		}
	}
}
