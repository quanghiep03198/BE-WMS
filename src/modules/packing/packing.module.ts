import { DATA_SOURCE_DATA_LAKE_CENTRAL } from '@databases/constants'
import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PackingEntity } from './entities/packing.entity'
import { ExportStorageService } from './manifest/export-storage.service'
import { MANIFEST_EXPORT_QUEUE, ManifestExportService } from './manifest/manifest-export.service'
import { ManifestExportWorker } from './manifest/manifest-export.worker'
import { ManifestController } from './manifest/manifest.controller'
import { ManifestRepository } from './manifest/manifest.repository'
import { ManifestService } from './manifest/manifest.service'
import { PackingController } from './packing.controller'
import { PackingService } from './packing.service'
import { PackingEntitySubscriber } from './subscribers/packing.entity.subscriber'

@Module({
	imports: [
		TypeOrmModule.forFeature([PackingEntity], DATA_SOURCE_DATA_LAKE_CENTRAL),
		BullModule.registerQueue({ name: MANIFEST_EXPORT_QUEUE })
	],
	controllers: [PackingController, ManifestController],
	providers: [
		PackingService,
		PackingEntitySubscriber,
		ManifestRepository,
		ManifestService,
		ExportStorageService,
		ManifestExportService,
		ManifestExportWorker
	]
})
export class PackingModule {}
