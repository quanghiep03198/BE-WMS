import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from './../tenancy/tenancy.module'
import { InventoryReportEntity } from './entities/inventory-report.entity'
import { ReportController } from './report.controller'
import { InboundReportService } from './services/inbound-report.service'
import { InventoryReportService } from './services/inventory-report.service'
import { OutboundReportService } from './services/outbound-report.service'
import { PackingWeightReportService } from './services/packing-weight-report.service'

@Module({
	imports: [TenancyModule, TypeOrmModule.forFeature([InventoryReportEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [ReportController],
	providers: [InboundReportService, OutboundReportService, InventoryReportService, PackingWeightReportService]
})
export class ReportModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes({ path: '/report*', method: RequestMethod.ALL })
	}
}
