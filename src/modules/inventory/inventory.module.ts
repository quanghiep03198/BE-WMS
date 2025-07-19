import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EventGateway } from '@/events/event.gateway'
import { BullModule } from '@nestjs/bullmq'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { SYNC_INVENTORY_AUDIT_QUEUE } from './constants'
import { InboundInventoryEntity } from './entities/inbound-inventory.view.entity'
import { InventoryReportEntity } from './entities/inventory-report.entity'
import { OutboundEstimationEntity } from './entities/outbound-inventory.view.entity'
import { ProductInventoryReportEntity } from './entities/product-inventory.view.entity'
import { SizeInventoryEntity } from './entities/size-inventory.view.entity'
import { InventoryController } from './inventory.controller'
import { InventoryAuditDataSyncConsumer } from './queues/inventory-audit.consumer'
import { InventoryAuditService } from './services/inventory-audit.service'
import { ProductionInventoryService } from './services/product-inventory.service'

@Module({
	imports: [
		TenancyModule,
		BullModule.registerQueue({
			name: SYNC_INVENTORY_AUDIT_QUEUE,
			defaultJobOptions: { removeOnComplete: true, removeOnFail: true }
		}),
		TypeOrmModule.forFeature(
			[
				InventoryReportEntity,
				ProductInventoryReportEntity,
				SizeInventoryEntity,
				InboundInventoryEntity,
				OutboundEstimationEntity
			],
			DATA_SOURCE_DATA_LAKE
		)
	],
	controllers: [InventoryController],
	providers: [InventoryAuditService, ProductionInventoryService, EventGateway, InventoryAuditDataSyncConsumer],
	exports: [BullModule, InventoryAuditDataSyncConsumer]
})
export class InventoryModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes({ path: '/inventory/*', method: RequestMethod.ALL })
	}
}
