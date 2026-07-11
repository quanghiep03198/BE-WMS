import { Command } from '@nestjs/cqrs'

export class RestoreDeletedEpcsCommand extends Command<void> {
	constructor(public readonly epcs: string[]) {
		super()
	}
}
