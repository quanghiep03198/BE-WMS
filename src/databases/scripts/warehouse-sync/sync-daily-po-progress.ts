import { groupDailyPoProgress, type DailyPoProgress, type OutboundScan } from './daily-po-progress'

interface DailyPoProgressStore {
	find(po: string, date: string): Promise<DailyPoProgress | undefined>
	save(document: DailyPoProgress): Promise<void>
}

export async function syncDailyPoProgress(
	scans: Iterable<OutboundScan> | AsyncIterable<OutboundScan>,
	store: DailyPoProgressStore,
	generateId: () => string
): Promise<{ scans: number; documents: number; quantity: number }> {
	let pending: OutboundScan[] = []
	let currentKey: string | undefined
	const completed = new Set<string>()
	const summary = { scans: 0, documents: 0, quantity: 0 }

	async function flush() {
		if (!pending.length || currentKey === undefined) return
		const { po, date } = pending[0]
		const existing = await store.find(po, date)
		const [document] = groupDailyPoProgress(pending, generateId, existing ? [existing] : [])
		if (!document) throw new Error(`Failed to group outbound scans for ${po} ${date}`)
		await store.save(document)
		completed.add(currentKey)
		summary.documents++
		pending = []
	}

	for await (const scan of scans) {
		const key = JSON.stringify([scan.po, scan.date])
		if (currentKey !== key) {
			await flush()
			if (completed.has(key)) throw new Error(`Noncontiguous PO/day group: ${key}`)
			currentKey = key
		}
		pending.push(scan)
		summary.scans++
		summary.quantity += scan.quantity
	}
	await flush()
	return summary
}
