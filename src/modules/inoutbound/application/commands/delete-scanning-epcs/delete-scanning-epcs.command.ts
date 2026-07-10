import { Command } from '@nestjs/cqrs'

export class DeleteScanningEpcsCommand extends Command<void> {
	constructor(
		public readonly pendingDeleteEpcs: Array<string>,
		public readonly rescannable: boolean
	) {
		super()
	}
}
