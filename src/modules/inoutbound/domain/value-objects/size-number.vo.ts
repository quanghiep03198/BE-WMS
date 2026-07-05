export class SizeNumber {
	constructor(private readonly size: string | number) {}

	public getValue(options?: Partial<{ normalize: boolean }>): string {
		const value = typeof this.size === 'number' ? this.size.toString() : this.size
		if (options?.normalize) return this.normalize()
		return value
	}

	public normalize(): string {
		return Number.parseFloat(String(this.size).replaceAll(/[^0-9.\-]/g, '')).toString()
	}

	public isEqual(otherSize: SizeNumber): boolean {
		return this.normalize() === otherSize.normalize()
	}
}
