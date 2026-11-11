export interface OutboundScan {
	po: string
	date: string
	time: string
	mo_no: string
	size: string
	quantity: number
}

interface Transaction {
	time: string
	packing: Record<string, Record<string, number>>
	voided: boolean
}

export interface DailyPoProgress {
	po: string
	date: string
	shipping_progress: Record<string, Record<string, number>>
	transaction_history: Record<string, Transaction>
}

function addQuantity(packing: Record<string, Record<string, number>>, mo: string, size: string, quantity: number) {
	if (!Object.hasOwn(packing, mo)) Object.defineProperty(packing, mo, { value: {}, enumerable: true })
	const sizes = packing[mo]
	Object.defineProperty(sizes, size, {
		value: (Object.hasOwn(sizes, size) ? sizes[size] : 0) + quantity,
		enumerable: true,
		configurable: true,
		writable: true
	})
}

export function groupDailyPoProgress(
	scans: Iterable<OutboundScan>,
	generateId: () => string,
	existing: Iterable<DailyPoProgress> = []
): DailyPoProgress[] {
	const oldIds = new Map<string, Map<string, string>>()
	const reservedIds = new Map<string, Set<string>>()
	for (const document of existing) {
		const key = JSON.stringify([document.po, document.date])
		if (oldIds.has(key)) throw new Error(`Duplicate existing PO/day: ${key}`)
		const times = new Map<string, string>()
		for (const [id, transaction] of Object.entries(document.transaction_history)) {
			if (times.has(transaction.time)) throw new Error(`Duplicate transaction minute: ${key} ${transaction.time}`)
			times.set(transaction.time, id)
		}
		oldIds.set(key, times)
		reservedIds.set(key, new Set(times.values()))
	}

	const documents = new Map<string, DailyPoProgress>()
	const idsByMinute = new Map<string, Map<string, string>>()
	for (const scan of scans) {
		if (
			!scan.po ||
			!scan.mo_no ||
			!scan.size ||
			!/^\d{4}-\d{2}-\d{2}$/.test(scan.date) ||
			!/^([01]\d|2[0-3]):[0-5]\d$/.test(scan.time) ||
			!Number.isFinite(scan.quantity) ||
			scan.quantity <= 0
		) {
			throw new Error('Invalid outbound scan')
		}
		const key = JSON.stringify([scan.po, scan.date])
		let document = documents.get(key)
		if (!document) {
			document = { po: scan.po, date: scan.date, shipping_progress: {}, transaction_history: {} }
			documents.set(key, document)
			idsByMinute.set(key, new Map())
		}
		const minutes = idsByMinute.get(key)
		if (!minutes) throw new Error(`Missing transaction state: ${key}`)
		let id = minutes.get(scan.time)
		if (!id) {
			const previousId = oldIds.get(key)?.get(scan.time)
			id = previousId ?? generateId()
			if (!previousId && reservedIds.get(key)?.has(id)) throw new Error(`Reserved transaction id: ${id}`)
			if (!id || Object.hasOwn(document.transaction_history, id)) throw new Error(`Duplicate transaction id: ${id}`)
			Object.defineProperty(document.transaction_history, id, {
				value: { time: scan.time, packing: {}, voided: false },
				enumerable: true
			})
			minutes.set(scan.time, id)
		}
		addQuantity(document.shipping_progress, scan.mo_no, scan.size, scan.quantity)
		addQuantity(document.transaction_history[id].packing, scan.mo_no, scan.size, scan.quantity)
	}
	return [...documents.values()]
}
