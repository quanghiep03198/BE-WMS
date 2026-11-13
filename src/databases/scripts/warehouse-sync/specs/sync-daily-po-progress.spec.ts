import { type DailyPoProgress, type OutboundScan } from '../daily-po-progress'
import { syncDailyPoProgress } from '../sync-daily-po-progress'

describe('syncDailyPoProgress', () => {
	it('writes one document per contiguous PO/day and preserves minute ids on rerun', async () => {
		const scans: OutboundScan[] = [
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 },
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 2 },
			{ po: 'PO2', date: '2026-11-11', time: '11:30', mo_no: '14002', size: '09', quantity: 1 }
		]
		const documents = new Map<string, DailyPoProgress>()
		const key = (po: string, date: string) => `${po}:${date}`
		const store = {
			find: async (po: string, date: string) => documents.get(key(po, date)),
			save: async (document: DailyPoProgress) => {
				documents.set(key(document.po, document.date), document)
			}
		}
		let nextId = 0
		const generateId = () => String(++nextId).padStart(6, '0')
		const first = await syncDailyPoProgress(scans, store, generateId)
		expect(first).toEqual({ scans: 3, documents: 2, quantity: 4 })
		expect(documents.get('PO1:2026-11-10')?.transaction_history['000001'].packing).toEqual({
			'14001': { '08': 3 }
		})
		const snapshot = structuredClone([...documents])
		await syncDailyPoProgress(scans, store, generateId)
		expect([...documents]).toEqual(snapshot)
	})

	it('rejects repeated noncontiguous PO/day groups rather than overwriting prior rows', async () => {
		const row: OutboundScan = {
			po: 'PO1',
			date: '2026-11-10',
			time: '10:24',
			mo_no: '14001',
			size: '08',
			quantity: 1
		}
		const documents: DailyPoProgress[] = []
		const store = {
			find: async () => undefined,
			save: async (document: DailyPoProgress) => {
				documents.push(document)
			}
		}
		await expect(syncDailyPoProgress([row, { ...row, po: 'PO2' }, row], store, () => '123456')).rejects.toThrow(
			/noncontiguous/i
		)
		expect(documents).toHaveLength(2)
	})
})
