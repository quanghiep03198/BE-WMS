import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { I18nService } from 'nestjs-i18n'
import { ExportStorageService } from './export-storage.service'
import { ManifestExportWriter } from './manifest-export-writer'
import { MANIFEST_EXPORT_QUEUE, ManifestExportData, ManifestExportResult } from './manifest-export.service'
import { ManifestRepository, ManifestRow } from './manifest.repository'

@Processor(MANIFEST_EXPORT_QUEUE, { concurrency: 1 })
export class ManifestExportWorker extends WorkerHost {
	constructor(
		private readonly repository: ManifestRepository,
		private readonly storage: ExportStorageService,
		private readonly i18n: I18nService
	) {
		super()
	}

	async process(job: Job<ManifestExportData, ManifestExportResult>): Promise<ManifestExportResult> {
		if (!job.id) throw new Error('Export job has no ID')
		const { factoryCode, filter } = job.data
		await this.storage.delete(job.id)
		const output = this.storage.getWriteStream(job.id)
		let writer: ManifestExportWriter | undefined
		try {
			const lang = job.data.language ?? 'en'
			const keys = [
				'erp.fields.po',
				'erp.fields.brand_name',
				'erp.fields.shoestyle_codefactory',
				'erp.fields.cust_shoes_style',
				'erp.fields.color_sn',
				'erp.fields.size',
				'packing.fields.standard_weight',
				'packing.fields.actual_avg_weight',
				'packing.fields.target_box_qty',
				'packing.fields.target_item_qty',
				'packing.fields.weighed_box_qty',
				'packing.fields.unweighed_box_qty'
			] as const
			writer = new ManifestExportWriter(output, {
				headers: keys.map((key) => this.i18n.t(key, { lang })),
				summary: this.i18n.t('common.fields.summary', { lang })
			})
			const totalRows = await this.repository.count(factoryCode, filter)
			let processedRows = 0
			let after: ManifestRow | undefined
			await job.updateProgress({ processedRows, totalRows })
			for (;;) {
				const rows = await this.repository.batch(factoryCode, filter, after)
				if (!rows.length) break
				await writer.write(rows)
				processedRows += rows.length
				await job.updateProgress({ processedRows, totalRows })
				after = rows[rows.length - 1]
			}
			await writer.finish()
			await this.storage.finalize(job.id)
			return { expiresAt: new Date(Date.now() + this.storage.ttlSeconds * 1000).toISOString() }
		} catch (error) {
			if (writer) writer.abort()
			else output.destroy()
			if (!output.closed) await new Promise<void>((resolve) => output.once('close', resolve))
			try {
				await this.storage.delete(job.id, true)
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					'Export failed and its temporary file could not be removed',
					{ cause: cleanupError }
				)
			}
			throw error
		}
	}
}
