import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '@modules/inoutbound/application/ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '@modules/inoutbound/application/ports/io-mssql.repository.port'
import { ElectronicProductCode } from '@modules/inoutbound/domain/value-objects/epc.vo'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(
		@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository,
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository
	) {}

	public async execute({ command }: BulkWriteInventoryCommand) {
		const { data, sn } = command.payload

		const epcs = ElectronicProductCode.createFactory(data.tagList.map((tag) => ({ sku: tag.epc, attributes: null })))

		const scannedEpcs = await this.ioMssqlRepository.getEpcsInformation(epcs)

		if (scannedEpcs.length === 0) return

		await this.ioMongoRepository.bulkWriteInventoryEpcs({
			action: command.action,
			payload: {
				epcs: scannedEpcs,
				deviceSerialNumber: sn
			}
		})
	}
}
