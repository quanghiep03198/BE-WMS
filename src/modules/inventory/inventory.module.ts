import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BullModule } from '@nestjs/bullmq'
import { MiddlewareConsumer, Module, NestModule, OnModuleInit, RequestMethod } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OrderModule } from '../order/order.module'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { SYNC_INVENTORY_AUDIT_QUEUE } from './constants'
import { InboundInventoryEntity } from './entities/inbound-inventory.view.entity'
import { InventoryAuditEntity } from './entities/inventory-report.entity'
import { OutboundEstimationEntity } from './entities/outbound-inventory.view.entity'
import { ProductInventoryReportEntity } from './entities/product-inventory.view.entity'
import { SizeInventoryEntity } from './entities/size-inventory.view.entity'
import { InventoryGateway } from './gateways/inventory.gateway'
import { InventoryController } from './inventory.controller'
import { InventoryAuditDataSyncConsumer } from './queues/inventory-audit.consumer'
import {
	MO_INVENTORY_AUDIT_COLLECTION_NAME,
	MoInventoryAudit,
	MoInventoryAuditModel,
	MoInventoryAuditSchema
} from './schemas/inventory-audit.schema'
import { InventoryAuditService } from './services/inventory-audit.service'
import { ProductionInventoryService } from './services/product-inventory.service'

@Module({
	imports: [
		TenancyModule,
		OrderModule,
		BullModule.registerQueue({
			name: SYNC_INVENTORY_AUDIT_QUEUE,
			defaultJobOptions: { removeOnComplete: true, removeOnFail: true }
		}),
		TypeOrmModule.forFeature(
			[
				InventoryAuditEntity,
				ProductInventoryReportEntity,
				SizeInventoryEntity,
				InboundInventoryEntity,
				OutboundEstimationEntity
			],
			DATA_SOURCE_DATA_LAKE
		),
		MongooseModule.forFeature(
			[
				{
					name: MoInventoryAudit.name,
					collection: MO_INVENTORY_AUDIT_COLLECTION_NAME,
					schema: MoInventoryAuditSchema
				}
			],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	controllers: [InventoryController],
	providers: [InventoryGateway, InventoryAuditService, ProductionInventoryService, InventoryAuditDataSyncConsumer],
	exports: [BullModule, InventoryAuditService, InventoryAuditDataSyncConsumer]
})
export class InventoryModule implements NestModule, OnModuleInit {
	constructor(
		@InjectModel(MoInventoryAudit.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryAuditModel: MoInventoryAuditModel
	) {}

	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.forRoutes(
				{ path: '/inventory/summary', method: RequestMethod.GET },
				{ path: '/inventory/summary/export', method: RequestMethod.GET },
				{ path: '/inventory/production-features', method: RequestMethod.GET }
			)
	}

	async onModuleInit() {
		await this.moInventoryAuditModel.syncIndexes()
	}
}
