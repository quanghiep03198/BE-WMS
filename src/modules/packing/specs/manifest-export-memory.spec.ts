import type { WriteStream } from 'node:fs'
import { Writable } from 'node:stream'
import { ManifestExportWriter } from '../manifest/manifest-export-writer'
import type { ManifestRow } from '../manifest/manifest.repository'

const benchmark = process.env.RUN_MANIFEST_MEMORY_TESTS === '1' ? it : it.skip

describe('manifest export bounded memory', () => {
	benchmark(
		'exports 100,000 wide rows to a slow destination within a 192 MiB RSS increase',
		async () => {
			const sink = new Writable({
				highWaterMark: 4096,
				write(_chunk, _encoding, callback) {
					setTimeout(callback, 1)
				}
			})
			const writer = new ManifestExportWriter(sink as WriteStream)
			const baseline = process.memoryUsage().rss
			let peak = baseline
			const text = '0123456789abcdef'.repeat(32)
			for (let batch = 0; batch < 50; batch++) {
				const rows = Array.from(
					{ length: 2000 },
					(_, index) =>
						({
							cursor_id: batch * 2000 + index,
							cust_shoes_style: 'Style',
							po: text,
							brand_name: text,
							packing_standard: text
						}) as ManifestRow
				)
				await writer.write(rows)
				peak = Math.max(peak, process.memoryUsage().rss)
			}
			await writer.finish()
			peak = Math.max(peak, process.memoryUsage().rss)
			expect(peak - baseline).toBeLessThan(192 * 1024 * 1024)
		},
		120000
	)
})
