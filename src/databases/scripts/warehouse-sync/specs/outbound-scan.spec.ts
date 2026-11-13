import { mapOutboundScan } from '../outbound-scan'

describe('mapOutboundScan', () => {
	it('converts negative outbound quantities to a positive shipped amount', () => {
		expect(
			mapOutboundScan({
				po: ' PO1 ',
				mo_no: '14001',
				size: '08',
				date: '2026-11-10',
				time: '10:24',
				quantity: -2
			})
		).toEqual({ po: 'PO1', mo_no: '14001', size: '08', date: '2026-11-10', time: '10:24', quantity: 2 })
	})

	it('rejects invalid quantities and missing references instead of inventing data', () => {
		const row = { po: 'PO1', mo_no: '14001', size: '08', date: '2026-11-10', time: '10:24', quantity: -1 }
		expect(() => mapOutboundScan({ ...row, po: null })).toThrow()
		expect(() => mapOutboundScan({ ...row, quantity: null })).toThrow()
		expect(() => mapOutboundScan({ ...row, quantity: 0 })).toThrow()
		expect(() => mapOutboundScan({ ...row, quantity: 1 })).toThrow()
	})
})
