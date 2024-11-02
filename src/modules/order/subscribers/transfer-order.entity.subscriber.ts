import { FactoryCodeRef } from '@/common/constants/factory-code-ref'
import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { TransferOrderEntity } from './../entities/transfer-order.entity'

@EventSubscriber()
export class TransferOrderEntitySubscriber implements EntitySubscriberInterface<TransferOrderEntity> {
	constructor(@InjectDataSource(DATASOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return TransferOrderEntity
	}

	async beforeInsert(event: InsertEvent<TransferOrderEntity>) {
		const factoryCode = event.entity.cofactory_code
		const factoryCodeRef = FactoryCodeRef[factoryCode]
		const count = await event.manager
			.getRepository(TransferOrderEntity)
			.count({ where: { cofactory_code: factoryCode } })
		const createdDateTime = format(new Date(), 'yyMM')
		event.entity.transfer_order_code = `TN${factoryCodeRef}${createdDateTime}${count + 1}`
	}
}
