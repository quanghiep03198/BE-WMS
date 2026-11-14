import { groupDailyPoProgress } from '../daily-po-progress'

describe('groupDailyPoProgress', () => {
	it('allocates asynchronous transaction IDs using each scan date', async () => {
		const scans = [
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 },
			{ po: 'PO2', date: '2026-11-10', time: '10:25', mo_no: '14001', size: '08', quantity: 1 },
			{ po: 'PO3', date: '2026-11-11', time: '10:25', mo_no: '14001', size: '08', quantity: 1 }
		]
		const counters = new Map<string, number>()
		const documents = await groupDailyPoProgress(scans, async (date: string) => {
			const sequence = (counters.get(date) ?? 0) + 1
			counters.set(date, sequence)
			return `XF-${date}-${sequence}`
		})
		expect(documents.map((document) => Object.keys(document.transaction_history))).toEqual([
			['XF-2026-11-10-1'],
			['XF-2026-11-10-2'],
			['XF-2026-11-11-1']
		])
	})

	it('propagates ID allocation failures', async () => {
		const scan = { po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 }
		await expect(
			groupDailyPoProgress([scan], async () => {
				throw new Error('counter unavailable')
			})
		).rejects.toThrow('counter unavailable')
	})

	it('groups outbound scans by PO, day and minute and retains transaction ids on rerun', async () => {
		const scans = [
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 },
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 2 },
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14002', size: '09', quantity: 1 },
			{ po: 'PO1', date: '2026-11-10', time: '10:25', mo_no: '14001', size: '08', quantity: 1 }
		]
		const ids = ['123456', '654321']
		const first = await groupDailyPoProgress(scans, () => {
			const id = ids.shift()
			if (!id) throw new Error('No more test transaction ids')
			return id
		})
		expect(first).toEqual([
			{
				po: 'PO1',
				date: '2026-11-10',
				shipping_progress: { '14001': { '08': 4 }, '14002': { '09': 1 } },
				transaction_history: {
					'123456': { time: '10:24', packing: { '14001': { '08': 3 }, '14002': { '09': 1 } }, voided: false },
					'654321': { time: '10:25', packing: { '14001': { '08': 1 } }, voided: false }
				}
			}
		])
		expect(await groupDailyPoProgress(scans, () => '111111', first)).toEqual(first)
	})

	it('rejects invalid quantities and duplicate generated transaction ids', async () => {
		const row = { po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 }
		await expect(groupDailyPoProgress([{ ...row, quantity: NaN }], () => '123456')).rejects.toThrow()
		await expect(groupDailyPoProgress([row, { ...row, time: '10:25' }], () => '123456')).rejects.toThrow()
	})

	it('retries when a newly generated id is reserved for a previously imported minute', async () => {
		const row = { po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 }
		const existing = [
			{
				po: 'PO1',
				date: '2026-11-10',
				shipping_progress: {},
				transaction_history: { '123456': { time: '10:25', packing: {}, voided: false } }
			}
		]
		const ids = ['123456', '654321']
		const result = await groupDailyPoProgress(
			[row],
			() => {
				const id = ids.shift()
				if (!id) throw new Error('No more test transaction ids')
				return id
			},
			existing
		)
		expect(result[0].transaction_history['654321'].time).toBe('10:24')
	})
})
