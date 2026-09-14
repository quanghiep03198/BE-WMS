import { BULLMQ_JOBS_COUNTER, BULLMQ_JOBS_GAUGE } from '@configs/bullmq.config'
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DiscoveryModule } from '@nestjs/core'
import { getToken, makeCounterProvider, makeGaugeProvider, PrometheusModule } from '@willsoto/nestjs-prometheus'
import { BullmqGaugeDiscoveryService } from './bull-gauge-discovery.service'

@Global()
@Module({
	imports: [
		DiscoveryModule,
		PrometheusModule.registerAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					global: true,
					path: '/metrics',
					defaultMetrics: {
						enabled: configService.get<boolean>('ENABLE_PROMETHEUS_METRICS_LOGGER')
					}
				}
			}
		})
	],
	providers: [
		BullmqGaugeDiscoveryService,
		makeGaugeProvider({
			name: BULLMQ_JOBS_GAUGE,
			help: 'Current job counts by state',
			labelNames: ['queue', 'state']
		}),
		makeCounterProvider({
			name: BULLMQ_JOBS_COUNTER,
			help: 'Total jobs processed by outcome',
			labelNames: ['queue', 'status']
		})
	],
	exports: [getToken(BULLMQ_JOBS_GAUGE), getToken(BULLMQ_JOBS_COUNTER)]
})
export class MetricsModule {}
