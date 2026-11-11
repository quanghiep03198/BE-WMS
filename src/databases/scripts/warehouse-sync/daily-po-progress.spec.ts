import { groupDailyPoProgress } from './daily-po-progress'

describe('groupDailyPoProgress', () => {
	it('groups outbound scans by PO, day and minute and retains transaction ids on rerun', () => {
		const scans = [
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 },
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 2 },
			{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14002', size: '09', quantity: 1 },
			{ po: 'PO1', date: '2026-11-10', time: '10:25', mo_no: '14001', size: '08', quantity: 1 }
		]
		const ids = ['123456', '654321']
		const first = groupDailyPoProgress(scans, () => {
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
		expect(groupDailyPoProgress(scans, () => '111111', first)).toEqual(first)
	})

	it('rejects invalid quantities and duplicate generated transaction ids', () => {
		const row = { po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 }
		expect(() => groupDailyPoProgress([{ ...row, quantity: NaN }], () => '123456')).toThrow()
		expect(() => groupDailyPoProgress([row, { ...row, time: '10:25' }], () => '123456')).toThrow()
	})

	it('rejects a new id that is reserved for a previously imported minute', () => {
		const row = { po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 }
		const existing = [
			{
				po: 'PO1',
				date: '2026-11-10',
				shipping_progress: {},
				transaction_history: { '123456': { time: '10:25', packing: {}, voided: false } }
			}
		]
		expect(() => groupDailyPoProgress([row], () => '123456', existing)).toThrow()
	})
})
