import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { FILES_CLEANUP_QUEUE, FilesCleanupProcessor, FilesCleanupScheduler } from './files-cleanup.service'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'
import { HtmlSanitizerService } from './html-sanitizer.service'
import { StoredFile, StoredFileSchema } from './stored-file.schema'

@Module({
	imports: [
		BullModule.registerQueue({ name: FILES_CLEANUP_QUEUE }),
		MongooseModule.forFeature([{ name: StoredFile.name, schema: StoredFileSchema }], DATA_WAREHOUSE_CONNECTION)
	],
	controllers: [FilesController],
	providers: [FilesService, HtmlSanitizerService, FilesCleanupScheduler, FilesCleanupProcessor],
	exports: [FilesService, HtmlSanitizerService]
})
export class FilesModule {}
