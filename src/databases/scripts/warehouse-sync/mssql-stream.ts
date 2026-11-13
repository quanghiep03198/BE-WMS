import type { Readable } from 'node:stream'

export interface MssqlStreamRequest {
	input(name: string, value: string): unknown
	toReadableStream(): Readable
	query(sql: string): Promise<unknown>
	cancel(): boolean
}

export async function* streamMssqlRows(
	request: MssqlStreamRequest,
	sql: string,
	parameters: Record<string, string> = {}
): AsyncGenerator<unknown> {
	for (const [name, value] of Object.entries(parameters)) request.input(name, value)
	const stream = request.toReadableStream()
	const completion = request.query(sql).then(
		() => ({ ok: true as const }),
		(error: unknown) => {
			const failure = error instanceof Error ? error : new Error(String(error))
			stream.destroy(failure)
			return { ok: false as const, error: failure }
		}
	)
	let finished = false
	try {
		for await (const row of stream) yield row
		const result = await completion
		if (result.ok === false) throw result.error
		finished = true
	} finally {
		if (!finished) {
			request.cancel()
			stream.destroy()
			await completion
		}
	}
}
