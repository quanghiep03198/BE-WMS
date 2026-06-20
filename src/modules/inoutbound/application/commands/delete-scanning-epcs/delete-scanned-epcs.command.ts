import { Command } from '@nestjs/cqrs'

export class DeleteScanningEpcsCommand extends Command<string[]> {
	constructor(public readonly scanningEpcs: string[]) {
		super()
	}
}
