import { isNil } from 'lodash'
import { isPrimitive } from './common.util'

/**
 * JSON strictify handler
 * @class
 */
export class SuperJson {
	/**
	 * @description Check if string is valid JSON
	 * @param value
	 * @returns
	 */
	public static isValid(value: string | null) {
		try {
			if (isNil(value)) return false
			return !!JSON.parse(value)
		} catch {
			return false
		}
	}

	/**
	 * @description Safely parse value to JSON with nested parsing support
	 * @param value
	 * @returns
	 */
	public static parse<T>(value: any): T {
		// If value is not a valid JSON string, return as is
		if (!this.isValid(value)) return value

		// Parse the JSON string
		const parsedValue = JSON.parse(value) as T

		// Recursively parse nested JSON values
		const parseNested = (val: any): any => {
			// Handle arrays
			if (Array.isArray(val)) {
				return val.map((item) => parseNested(item))
			}

			// Handle objects
			if (val && typeof val === 'object' && val !== null) {
				const result: any = {}
				for (const [key, nestedVal] of Object.entries(val)) {
					result[key] = parseNested(nestedVal)
				}
				return result
			}

			// Handle strings that might be JSON
			if (typeof val === 'string' && this.isValid(val)) {
				const parsed = JSON.parse(val)
				return parseNested(parsed) // Recursively parse the parsed value
			}

			// Return primitive values as is
			return val
		}

		return parseNested(parsedValue) as T
	}
	/**
	 * @description Safely stringify value
	 * @param value
	 * @returns
	 */
	public static stringify(value: any): string {
		return isPrimitive(value) ? value : JSON.stringify(value)
	}
}
