import { format } from 'date-fns'
import { padStart } from 'lodash'
import { DISPATCH_ORDER_MAX_SEQUENCE, DISPATCH_ORDER_SEQUENCE_LENGTH } from '../constants'
import { DispatchOrderSequenceExhaustedException } from '../exceptions'
import type { TruckloadDeliveryDispatchOrder } from '../types'

/**
 * Dispatch order code: `{FACTORY}-EXP-{yyyyMMdd}-{seq}`.
 * The sequence is the smallest unused number of the day (first gap, otherwise max + 1).
 */
export class DispatchOrderCode {
	private constructor(public readonly value: TruckloadDeliveryDispatchOrder) {}

	static prefixOf(factoryAgencyCode: string, date: Date): string {
		return `${factoryAgencyCode}-EXP-${format(date, 'yyyyMMdd')}-`
	}

	static next(factoryAgencyCode: string, date: Date, takenCodes: string[]): DispatchOrderCode {
		const prefix = DispatchOrderCode.prefixOf(factoryAgencyCode, date)
		const taken = new Set(
			takenCodes
				.filter((code) => code.startsWith(prefix))
				.map((code) => Number.parseInt(code.slice(prefix.length), 10))
		)

		let sequence = 1
		while (taken.has(sequence)) sequence++

		if (sequence > DISPATCH_ORDER_MAX_SEQUENCE) throw new DispatchOrderSequenceExhaustedException(prefix)

		return new DispatchOrderCode(
			`${prefix}${padStart(String(sequence), DISPATCH_ORDER_SEQUENCE_LENGTH, '0')}` as TruckloadDeliveryDispatchOrder
		)
	}

	toString(): string {
		return this.value
	}
}
