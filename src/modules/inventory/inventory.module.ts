import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { InboundInventoryEntity } from './entities/inbound-inventory.entity'
import { InventoryReportEntity } from './entities/inventory-report.entity'
import { OutboundEstimationEntity } from './entities/outbound-inventory.entity'
import { ProductInventoryReportEntity } from './entities/product-inventory-report.entity'
import { ProductSizeInventoryEntity } from './entities/product-size-inventory.entity'
import { InventoryController } from './inventory.controller'
import { InventoryAuditService } from './services/inventory-report.service'
import { ProductionInventoryService } from './services/product-inventory.service'

@Module({
	imports: [
		TenancyModule,
		TypeOrmModule.forFeature(
			[
				InventoryReportEntity,
				ProductInventoryReportEntity,
				ProductSizeInventoryEntity,
				InboundInventoryEntity,
				OutboundEstimationEntity
			],
			DATA_SOURCE_DATA_LAKE
		)
	],
	controllers: [InventoryController],
	providers: [InventoryAuditService, ProductionInventoryService]
})
export class InventoryModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes({ path: '/inventory/*', method: RequestMethod.ALL })
	}
}
