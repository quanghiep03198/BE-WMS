import { Command } from '@nestjs/cqrs'

export class DeleteScanningEpcsCommand extends Command<string[]> {
	constructor(scanningEpcs: string[]) {
		super()
	}
}
