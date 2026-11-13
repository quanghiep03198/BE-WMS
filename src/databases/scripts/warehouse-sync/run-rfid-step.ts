import { type mongo } from 'mongoose'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

const RFID_SQL = `
	SELECT device_sn, device_name AS station_no, Vietnamese AS name_vi, English AS name_en,
		SimplifiedChinese AS name_cn, ip_address AS tcp_ip, ip_port AS tcp_port,
		CASE WHEN device_ant IS NULL OR device_ant = '0' THEN 'handhold' ELSE 'antenna' END AS device_type
	FROM DV_DATA_LAKE.dbo.dv_rfidreader
	WHERE device_name LIKE 'CUS_%_WH%' AND cofactory_code = @factory
	ORDER BY id ASC;
`

function text(row: object, key: string): string {
	if (!(key in row) || typeof row[key] !== 'string' || !row[key].trim()) {
		throw new Error(`Invalid RFID ${key}`)
	}
	return row[key].trim()
}

export async function runRfidStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	factoryCode: string
): Promise<{ devices: number }> {
	if (!factoryCode.trim()) throw new Error('Factory code is required')
	const collection = database.collection('rfid_devices')
	await collection.createIndex({ device_sn: 1 }, { unique: true })
	const seen = new Set<string>()
	let devices = 0
	let skippedDuplicates = 0
	let skippedNames = 0
	for await (const row of streamMssqlRows(pool.request(), RFID_SQL, { factory: factoryCode })) {
		if (!row || typeof row !== 'object') throw new Error('Invalid MSSQL RFID row')
		const deviceSn = text(row, 'device_sn')
		if (seen.has(deviceSn)) {
			skippedDuplicates++
			continue
		}
		seen.add(deviceSn)
		if (!('tcp_port' in row) || (typeof row.tcp_port !== 'string' && typeof row.tcp_port !== 'number')) {
			throw new Error(`Invalid RFID tcp_port for ${deviceSn}`)
		}
		const port = String(row.tcp_port).trim()
		if (!port) throw new Error(`Invalid RFID tcp_port for ${deviceSn}`)
		const type = text(row, 'device_type')
		if (type !== 'antenna' && type !== 'handhold') throw new Error(`Invalid RFID device type for ${deviceSn}`)
		const localizedNames: Record<string, string> = {}
		for (const language of ['vi', 'en', 'cn'] as const) {
			const key = `name_${language}`
			if (!(key in row)) throw new Error(`Missing RFID ${key} for ${deviceSn}`)
			const value: unknown = row[key]
			if (value === null || (typeof value === 'string' && !value.trim())) {
				skippedNames++
				continue
			}
			if (typeof value !== 'string') throw new Error(`Invalid RFID ${key} for ${deviceSn}`)
			localizedNames[`device_name.${language}`] = value.trim()
		}
		const now = new Date()
		const result = await collection.updateOne(
			{ device_sn: deviceSn },
			{
				$set: {
					station_no: text(row, 'station_no'),
					...localizedNames,
					tcp_ip: text(row, 'tcp_ip'),
					tcp_port: port,
					device_type: type,
					updated_at: now
				},
				$setOnInsert: {
					created_at: now,
					deleted: false,
					...(Object.keys(localizedNames).length ? {} : { device_name: {} })
				}
			},
			{ upsert: true }
		)
		if (!result.acknowledged) throw new Error(`Unacknowledged RFID device write: ${deviceSn}`)
		devices++
	}
	if (skippedDuplicates) console.warn(`Skipped ${skippedDuplicates} duplicate RFID device rows`)
	if (skippedNames) console.warn(`Skipped ${skippedNames} empty RFID localized names`)
	return { devices }
}
