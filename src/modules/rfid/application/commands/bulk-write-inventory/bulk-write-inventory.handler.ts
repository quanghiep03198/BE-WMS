import { ElectronicProductCode } from '@/modules/rfid/domain/entities/epc.entity'
import { IRFIDRepository } from '@/modules/rfid/domain/repositories/rfid.repository.interface'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryCommandHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(private readonly rfidRepository: IRFIDRepository) {}

	public async execute({ request }: BulkWriteInventoryCommand) {
		const { data, sn } = request.payload

		const epcs = ElectronicProductCode.createFactory(data.tagList!)

		const scannedEpcs = await this.rfidRepository.getEPCInformation(epcs)

		if (scannedEpcs.length === 0) return

		await this.rfidRepository.bulkWriteInventoryEPCs({
			action: request.action,
			payload: {
				eProductCodes: scannedEpcs,
				deviceSerialNumber: sn
			}
		})
	}
}
