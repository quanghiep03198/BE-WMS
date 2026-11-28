import { Global, Module } from '@nestjs/common'
import { makeCounterProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus'
import { MSSQL_CIRCUIT_OPENED_COUNTER, MSSQL_CIRCUIT_OPEN_GAUGE } from './constants'
import { MssqlCircuitService } from './mssql-circuit.service'
import { MssqlQueueGuard } from './mssql-queue-guard.service'

@Global()
@Module({
	providers: [
		MssqlCircuitService,
		MssqlQueueGuard,
		makeGaugeProvider({
			name: MSSQL_CIRCUIT_OPEN_GAUGE,
			help: 'Whether the MSSQL circuit is open',
			labelNames: ['data_source']
		}),
		makeCounterProvider({
			name: MSSQL_CIRCUIT_OPENED_COUNTER,
			help: 'Number of times the MSSQL circuit opened',
			labelNames: ['data_source']
		})
	],
	exports: [MssqlCircuitService, MssqlQueueGuard]
})
export class MssqlAvailabilityModule {}
