export class SizeNumber {
	constructor(private readonly size: string | number) {}

	public getValue(options?: Partial<{ normalize: boolean }>): string {
		const value = typeof this.size === 'number' ? this.size.toString() : this.size
		if (options?.normalize) return this.normalize()
		return value
	}

	public normalize(format: 'padleft' | 'float' = 'float'): string {
		const normalizedValue = Number.parseFloat(String(this.size).replaceAll(/[^0-9.\-]/g, '')).toString()
		if (format === 'float') return normalizedValue
		else return Number.parseFloat(normalizedValue) < 10 ? `0${normalizedValue}` : normalizedValue
	}

	public isEqual(otherSize: SizeNumber): boolean {
		return this.normalize() === otherSize.normalize()
	}
}
