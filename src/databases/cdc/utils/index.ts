import { CdcChangeGroup, CdcOperation } from '../types'

export function buildCaptureInstanceName(schema: string, sourceName: string): string {
	return `${schema}_${sourceName}`
}

export function buildTableLabel(schema: string, sourceName: string): string {
	return `${schema}.${sourceName}` // chỉ dùng để log/hiển thị, không dùng để tính toán
}

// Explicit, greppable key format — easy to find in Redis CLI:
// KEYS cdc:checkpoint:DATA_SOURCE_DATA_LAKE:*
export function getCdcCheckpointKey(dataSourceToken: string, schema: string, sourceName: string): string {
	return `cdc:checkpoint:${dataSourceToken}:${schema}.${sourceName}`
}

export function getCdcEchoKey(dataSourceToken: string, schema: string, sourceName: string, originId: string): string {
	return `cdc:echo:${dataSourceToken}:${schema}.${sourceName}:${originId}`
}

interface RawCdcRecord<TRow = any> {
	operation: CdcOperation
	row: TRow
	lsn: Buffer
	commandId: Buffer
}

function toIdString(value: Buffer | string): string {
	return Buffer.isBuffer(value) ? value.toString('hex') : String(value)
}

export function groupCdcChanges<TRow>(records: RawCdcRecord<TRow>[]): CdcChangeGroup<TRow>[] {
	const groups = new Map<string, CdcChangeGroup<TRow>>()

	for (const rec of records) {
		if (rec.commandId == null) {
			// Phòng vệ: nếu vô tình còn dùng net_changes ở đâu đó, không throw chết cả batch,
			// mỗi row không có commandId sẽ tự thành 1 group riêng dựa theo LSN của chính nó.
			const key = `__no_command_id__:${rec.lsn.toString('hex')}:${rec.operation}`
			addToGroup(groups, key, rec)
			continue
		}

		const key = `${toIdString(rec.commandId)}:${rec.operation}`
		addToGroup(groups, key, rec)
	}

	return Array.from(groups.values())
}

function addToGroup<TRow>(groups: Map<string, CdcChangeGroup<TRow>>, key: string, rec: RawCdcRecord<TRow>): void {
	let group = groups.get(key)
	if (!group) {
		group = { operation: rec.operation, data: [], lsn: rec.lsn.toString('hex') }
		groups.set(key, group)
	}
	group.data.push(rec.row)
}
