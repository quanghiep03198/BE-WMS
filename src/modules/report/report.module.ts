import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from './../tenancy/tenancy.module'
import { ReportController } from './report.controller'
import { InboundReportService } from './services/inbound-report.service'
import { OutboundReportService } from './services/outbound-report.service'
import { PackingWeightReportService } from './services/packing-weight-report.service'

@Module({
	imports: [TenancyModule],
	controllers: [ReportController],
	providers: [InboundReportService, OutboundReportService, PackingWeightReportService]
})
export class ReportModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes({ path: '/report*', method: RequestMethod.ALL })
	}
}
