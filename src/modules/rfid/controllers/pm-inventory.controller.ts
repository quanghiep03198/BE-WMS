import { AuthGuard } from '@/common/decorators/auth.decorator'
import { BadRequestException, Controller, Headers, Query, Sse } from '@nestjs/common'
import { from, interval, switchMap } from 'rxjs'
import { ProducingProcess } from '../constants'
import { PMInventoryService } from '../services/pm-inventory.service'

@Controller('rfid/pm-inventory')
export class PMInventoryController {
	constructor(private readonly pmInventoryService: PMInventoryService) {}

	@Sse()
	@AuthGuard()
	async fetchProducingEpc(
		@Headers('X-User-Company') factoryCode: string,
		@Headers('X-Polling-Duration') pollingDuration: number,
		@Query('process') producingProcess: ProducingProcess
	) {
		const FALLBACK_POLLING_DURATION = 500
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		if (!producingProcess) throw new BadRequestException('Producing process is required')

		const duration = pollingDuration ?? FALLBACK_POLLING_DURATION

		return interval(duration).pipe(
			switchMap(() => from(this.pmInventoryService.fetchLastestDataByProcess(factoryCode, producingProcess)))
		)
	}
}
