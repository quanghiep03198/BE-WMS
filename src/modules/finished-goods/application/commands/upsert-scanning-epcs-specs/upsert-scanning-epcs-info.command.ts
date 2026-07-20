import { Command } from '@nestjs/cqrs'

export class UpsertScanningEpcsInfoCommand extends Command<void> {
	constructor(
		public readonly deviceSerialNumber: string,
		public readonly sourceMo: string,
		public readonly targetMo: string,
		public readonly subMo: string,
		public readonly sizeNumber: string,
		public readonly quantity: number
	) {
		super()
	}
}
