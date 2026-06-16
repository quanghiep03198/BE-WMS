import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'

import { ElectronicProductCode } from '@/modules/rfid/domain/entities/epc.entity'
import { RFIDRepository } from '@/modules/rfid/infrastructure/repositories/rfid.repository'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryCommandHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(private readonly rfidRepository: RFIDRepository) {}

	public async execute({ request }: BulkWriteInventoryCommand) {
		const { data, sn } = request.payload as {
			sn: string
			data: { tagList: Array<{ epc: string }> }
		}

		const epcs = ElectronicProductCode.createFactory(data.tagList)

		const scannedEpcs = await this.rfidRepository.getEpcInformation(epcs)

		if (scannedEpcs.length === 0) return

		await this.rfidRepository.bulkWriteInventoryEpcs({
			action: request.action,
			payload: {
				eProductCodes: scannedEpcs,
				deviceSerialNumber: sn
			}
		})
	}
}
