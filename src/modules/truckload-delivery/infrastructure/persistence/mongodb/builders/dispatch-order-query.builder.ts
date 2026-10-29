import { SortDirection } from '@common/constants'
import { BadRequestException } from '@nestjs/common'
import { endOfDay, isValid, startOfDay } from 'date-fns'
import { escapeRegExp } from 'lodash'
import type { FilterQuery } from 'mongoose'
import { UnflatedFilterQueryDTO } from '../../../../application/dto/truckload-delivery.dto'
import { TruckloadDelivery } from '../schemas/truckload-delivery.schema'

/** API column name -> MongoDB field. */
const FIELD_MAP: Record<string, string> = {
	created_at: 'created_at',
	container_sealing_time: 'container_sealing_time',
	factory_entrance_time: 'factory_entrance_time',
	factory_departure_time: 'factory_departure_time',
	actual_departure_time: 'license_plate_capture_time',
	license_plate: 'license_plate',
	container_number: 'container_number',
	seal_number: 'seal_number',
	approval_status: 'approval_status',
	po: 'packing.po'
}

const SORT_FIELD_MAP: Record<string, string> = {
	created: 'created_at',
	container_sealing_time: 'container_sealing_time',
	factory_entrance_time: 'factory_entrance_time',
	factory_departure_time: 'factory_departure_time',
	actual_departure_time: 'license_plate_capture_time',
	license_plate: 'license_plate',
	container_number: 'container_number',
	seal_number: 'seal_number',
	total_outbound_qty: 'total_outbound_qty'
}

const DATE_FIELDS = new Set([
	'created_at',
	'container_sealing_time',
	'factory_entrance_time',
	'factory_departure_time',
	'license_plate_capture_time'
])

// * Stored upper-cased by the domain model
const UPPERCASE_FIELDS = new Set(['license_plate', 'container_number', 'seal_number'])

const DEFAULT_SORT: Record<string, 1 | -1> = { created_at: -1, container_sealing_time: -1 }

/** Converts a SQL `LIKE` pattern (`%` and `_` wildcards) to a case-insensitive regular expression. */
const likeToRegExp = (pattern: string): RegExp =>
	new RegExp(`^${escapeRegExp(pattern).replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')

export function buildDispatchOrderFilter(where: UnflatedFilterQueryDTO['where'] = {}): FilterQuery<TruckloadDelivery> {
	const filter: Record<string, unknown> = {}

	for (const [column, expression] of Object.entries(where)) {
		const field = FIELD_MAP[column]
		const separatorIndex = expression?.indexOf(':') ?? -1
		if (!field || separatorIndex < 0) continue

		const operator = expression.slice(0, separatorIndex).trim().toLowerCase()
		const value = expression.slice(separatorIndex + 1).trim()

		if (DATE_FIELDS.has(field)) {
			const dateRange = buildDateRange(operator, value)
			if (dateRange) filter[field] = dateRange
			continue
		}

		const normalized = UPPERCASE_FIELDS.has(field) ? value.toUpperCase() : value
		switch (operator) {
			case '=':
			case 'eq':
				filter[field] = normalized
				break
			case '!=':
			case '<>':
			case 'ne':
				filter[field] = { $ne: normalized }
				break
			case 'like':
				filter[field] = likeToRegExp(value)
				break
			default:
				throw new BadRequestException(`Unsupported operator "${operator}" for "${column}"`)
		}
	}

	return filter
}

function buildDateRange(operator: string, value: string): { $gte: Date; $lte: Date } | null {
	if (operator === 'between') {
		const [from, to] = value.split(',').map((item) => new Date(item.trim()))
		if (!isValid(from) || !isValid(to)) return null
		return { $gte: startOfDay(from), $lte: endOfDay(to) }
	}

	if (operator === '=' || operator === 'eq') {
		const date = new Date(value)
		return isValid(date) ? { $gte: startOfDay(date), $lte: endOfDay(date) } : null
	}

	return null
}

export function buildDispatchOrderSort(sort: UnflatedFilterQueryDTO['sort']): Record<string, 1 | -1> {
	const criteria = Object.entries(sort ?? {}).flatMap(([column, direction]) => {
		const field = SORT_FIELD_MAP[column]
		return field ? [[field, direction === SortDirection.ASC ? 1 : -1] as const] : []
	})

	// * `dispatch_order` keeps pagination stable when the sorted values tie
	return { ...(criteria.length > 0 ? Object.fromEntries(criteria) : DEFAULT_SORT), dispatch_order: -1 }
}
