export class ManufacturingOrder {
	constructor(public readonly value: string) {}

	public standardize(): string {
		return this.value.trim().replaceAll(/[^a-zA-Z0-9]/g, '')
	}
}
