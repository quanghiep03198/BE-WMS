import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { ConflictException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, InsertEvent } from 'typeorm'
import { DefectiveGoodEntity } from '../entities/defective-goods.entity'

export class DefectiveGoodsEntitySubscriber implements EntitySubscriberInterface {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return DefectiveGoodEntity
	}

	async beforeInsert(event: InsertEvent<DefectiveGoodEntity>) {
		const existedRecord = await event.manager
			.getRepository(DefectiveGoodEntity)
			.exists({ where: { epc: event.entity.epc } })
		if (existedRecord) throw new ConflictException(`Defective good with EPC ${event.entity.epc} already exists.`)
	}
}
