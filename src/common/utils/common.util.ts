export const isPrimitive = (value: any): boolean => {
	return (typeof value !== 'object' && typeof value !== 'function') || value === null
}

export const stringToBoolean = (value: string): boolean => {
	return /^true$/i.test(value)
}
