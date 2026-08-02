/**
 * EPC (Electronic Product Code) Generator
 *
 * Cấu trúc EPC 96-bit (24 hex characters):
 * - Header (8 bits): Loại EPC
 * - Filter (3 bits): Bộ lọc
 * - Partition (3 bits): Phân vùng
 * - Company Prefix: Mã công ty
 * - Item Reference: Mã sản phẩm
 * - Serial Number: Số serial unique
 */

export interface EPCGeneratorOptions {
	/** Prefix cố định của EPC (default: E28) */
	prefix?: string
	/** Độ dài tổng của EPC (default: 24 hex chars = 96 bits) */
	totalLength?: number
	/** Chữ hoa hay thường (default: true = uppercase) */
	uppercase?: boolean
}

/**
 * Tạo mã EPC unique dựa trên timestamp + random
 */
export function generateEPC(options: EPCGeneratorOptions = {}): string {
	const { prefix = 'E28', totalLength = 24, uppercase = true } = options
	const suffixLength = totalLength - prefix.length

	// Tạo suffix từ nhiều nguồn random để đảm bảo unique

	const timestamp = Date.now().toString(16) // Timestamp hex
	const random = crypto.getRandomValues(new Uint8Array(Math.ceil(suffixLength / 2)))
	const randomHex = Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('')

	// Kết hợp timestamp và random
	const suffix = (timestamp + randomHex).slice(0, suffixLength)

	const epc = `${prefix}${suffix}`

	return uppercase ? epc.toUpperCase() : epc.toLowerCase()
}

/**
 * Tạo nhiều mã EPC unique
 * Sử dụng Set để đảm bảo không trùng
 */
export function generateMultipleEPCs(count: number, options: EPCGeneratorOptions = {}): string[] {
	const epcs = new Set<string>()
	const maxAttempts = count * 10 // Giới hạn số lần thử để tránh infinite loop

	let attempts = 0
	while (epcs.size < count && attempts < maxAttempts) {
		epcs.add(generateEPC(options))
		attempts++
	}

	if (epcs.size < count) {
		console.warn(`Chỉ tạo được ${epcs.size}/${count} EPC unique sau ${maxAttempts} lần thử`)
	}

	return Array.from(epcs)
}

/**
 * Generator class với counter để đảm bảo 100% unique trong session
 */
export class EPCGenerator {
	private prefix: string
	private totalLength: number
	private counter: bigint
	private generatedSet: Set<string>

	constructor(options: EPCGeneratorOptions = {}) {
		this.prefix = options.prefix ?? 'E28'
		this.totalLength = options.totalLength ?? 24
		this.counter = BigInt(Date.now())
		this.generatedSet = new Set()
	}

	/**
	 * Generate EPC với counter tăng dần - đảm bảo 100% unique
	 */
	generate(): string {
		const suffixLength = this.totalLength - this.prefix.length

		// Tăng counter
		this.counter++

		// Kết hợp counter với random
		const counterHex = this.counter.toString(16).padStart(suffixLength, '0')
		const suffix = counterHex.slice(-suffixLength)

		const epc = `${this.prefix}${suffix}`.toUpperCase()

		// Double check unique
		if (this.generatedSet.has(epc)) {
			return this.generateRandom()
		}

		this.generatedSet.add(epc)
		return epc
	}

	/**
	 * Fallback random generation
	 */
	private generateRandom(): string {
		const suffixLength = this.totalLength - this.prefix.length
		let epc: string
		let attempts = 0

		do {
			const random = crypto.getRandomValues(new Uint8Array(Math.ceil(suffixLength / 2)))
			const suffix = Array.from(random, (b) => b.toString(16).padStart(2, '0'))
				.join('')
				.slice(0, suffixLength)
			epc = `${this.prefix}${suffix}`.toUpperCase()
			attempts++
		} while (this.generatedSet.has(epc) && attempts < 1000)

		this.generatedSet.add(epc)
		return epc
	}

	/**
	 * Generate nhiều EPC cùng lúc
	 */
	generateBatch(count: number): string[] {
		return Array.from({ length: count }, () => this.generate())
	}

	/**
	 * Kiểm tra EPC đã được generate chưa
	 */
	isGenerated(epc: string): boolean {
		return this.generatedSet.has(epc)
	}

	/**
	 * Reset generator
	 */
	reset(): void {
		this.counter = BigInt(Date.now())
		this.generatedSet.clear()
	}

	/**
	 * Số lượng EPC đã generate
	 */
	get count(): number {
		return this.generatedSet.size
	}
}

/**
 * Validate EPC format
 */
export function isValidEPC(epc: string): boolean {
	// EPC 96-bit = 24 hex characters
	const epcRegex = /^[0-9A-Fa-f]{24}$/
	return epcRegex.test(epc)
}

/**
 * Parse EPC thành các phần
 */
export function parseEPC(epc: string): { prefix: string; suffix: string } | null {
	if (!isValidEPC(epc)) return null

	return {
		prefix: epc.slice(0, 20),
		suffix: epc.slice(20)
	}
}

// ==========================================
// Usage Examples:
// ==========================================

// 1. Simple generation:
// const epc = generateEPC()
// => "E28068940000502B3A06A1B2"

// 2. Multiple EPCs:
// const epcs = generateMultipleEPCs(10)
// => ["E28068940000502B3A06A1B2", "E28068940000502B3A06C3D4", ...]

// 3. Using class (recommended for guaranteed uniqueness):
// const generator = new EPCGenerator()
// const epc1 = generator.generate()
// const epc2 = generator.generate()
// const batch = generator.generateBatch(100)
