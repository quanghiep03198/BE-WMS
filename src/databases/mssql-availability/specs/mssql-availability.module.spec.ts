import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { REDIS_CLIENT } from '@redis/constants'
import { MssqlAvailabilityModule } from '../mssql-availability.module'
import { MssqlCircuitService } from '../mssql-circuit.service'
import { MssqlQueueGuard } from '../mssql-queue-guard.service'

@Global()
@Module({
	providers: [{ provide: REDIS_CLIENT, useValue: { smembers: jest.fn().mockResolvedValue([]) } }],
	exports: [REDIS_CLIENT]
})
class TestRedisModule {}

describe('MssqlAvailabilityModule', () => {
	it('resolves the guard and circuit with Nest dependency injection', async () => {
		const module = await Test.createTestingModule({ imports: [TestRedisModule, MssqlAvailabilityModule] }).compile()
		try {
			expect(module.get(MssqlQueueGuard)).toBeInstanceOf(MssqlQueueGuard)
			expect(module.get(MssqlCircuitService)).toBeInstanceOf(MssqlCircuitService)
		} finally {
			await module.close()
		}
	})
})
