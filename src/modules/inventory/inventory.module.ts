import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OrderModule } from '../order/order.module'
import { InventoryAuditCommandHandlers } from './application/commands'
import { INVENTORY_AUDIT_REPOSITORY } from './application/ports/inventory-audit.port.interface'
import { InventoryAuditQueryHandlers } from './application/queries'
import { InventoryAuditRepository } from './infrastructure/persistence/mongodb/repositories/inventory-audit.repository'
import {
	MO_INVENTORY_AUDIT_COLLECTION_NAME,
	MoInventoryAudit,
	MoInventoryAuditModel,
	MoInventoryAuditSchema
} from './infrastructure/persistence/mongodb/schemas/inventory-audit.schema'
import { InboundInventoryEntity } from './infrastructure/persistence/mssql/entities/inbound-inventory.view.entity'
import { InventoryAuditEntity } from './infrastructure/persistence/mssql/entities/inventory-report.entity'
import { OutboundEstimationEntity } from './infrastructure/persistence/mssql/entities/outbound-inventory.view.entity'
import { ProductInventoryReportEntity } from './infrastructure/persistence/mssql/entities/product-inventory.view.entity'
import { SizeInventoryEntity } from './infrastructure/persistence/mssql/entities/size-inventory.view.entity'
import { ProductionInventoryService } from './infrastructure/persistence/mssql/services/product-inventory.service'
import { InventoryController } from './presentation/controllers/inventory.controller'

@Module({
	imports: [
		OrderModule,
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
	providers: [
		ProductionInventoryService,
		{ provide: INVENTORY_AUDIT_REPOSITORY, useClass: InventoryAuditRepository },
		...InventoryAuditQueryHandlers,
		...InventoryAuditCommandHandlers
	],
	exports: [INVENTORY_AUDIT_REPOSITORY]
})
export class InventoryModule implements OnModuleInit {
	constructor(
		@InjectModel(MoInventoryAudit.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryAuditModel: MoInventoryAuditModel
	) {}

	async onModuleInit() {
		await this.moInventoryAuditModel.syncIndexes()
	}
}
