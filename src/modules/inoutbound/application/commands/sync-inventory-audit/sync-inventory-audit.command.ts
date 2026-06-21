import { Command } from '@nestjs/cqrs'
import { Job } from 'bullmq'

export class SyncInventoryAuditCommand extends Command<
	Job<
		{
			year: number
			month: number
		},
		any,
		string
	>
> {
	constructor(public readonly yearMonth: { year: number; month: number }) {
		super()
	}
}
