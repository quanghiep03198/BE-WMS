import { isNil } from 'lodash'
import { isPrimitive } from './common.util'

/**
 * Enhanced JSON handler for deep nested parsing and stringifying
 * @class
 */
export class SuperJson {
	/**
	 * @description Check if string is valid JSON
	 * @param value
	 * @returns
	 */
	public static isValid(value: any): boolean {
		if (isNil(value) || typeof value !== 'string') return false
		try {
			JSON.parse(value)
			return true
		} catch {
			return false
		}
	}

	/**
	 * @description Safely parse value to JSON with deep nested parsing support
	 * @param value - The value to parse (can be string, array, or object)
	 * @returns Parsed value with all nested JSON strings converted to objects
	 */
	public static parse<T = any>(value: any): T {
		return this.deepParse(value) as T
	}

	/**
	 * @description Recursively parse deep nested JSON values
	 * @param value - Any value to parse
	 * @returns Parsed value with nested JSON handling
	 */
	private static deepParse(value: any): any {
		// Handle null, undefined, or primitive non-string values
		if (isNil(value) || (isPrimitive(value) && typeof value !== 'string')) {
			return value
		}

		// Handle JSON strings
		if (typeof value === 'string') {
			if (this.isValid(value)) {
				try {
					const parsed = JSON.parse(value)
					return this.deepParse(parsed) // Recursively parse the result
				} catch {
					return value // Return original string if parsing fails
				}
			}
			return value // Return non-JSON strings as is
		}

		// Handle arrays
		if (Array.isArray(value)) {
			return value.map((item) => this.deepParse(item))
		}

		// Handle objects (but not Date, RegExp, etc.)
		if (value && typeof value === 'object' && value.constructor === Object) {
			const result: Record<string, any> = {}
			for (const [key, val] of Object.entries(value)) {
				result[key] = this.deepParse(val)
			}
			return result
		}

		// Return other object types (Date, RegExp, etc.) as is
		return value
	}

	/**
	 * @description Safely stringify value with deep nested stringifying support
	 * @param value - The value to stringify
	 * @param space - Number of spaces for indentation (optional)
	 * @returns JSON string with nested objects properly stringified
	 */
	public static stringify(value: any, space?: number): string {
		if (isPrimitive(value) && typeof value !== 'object') {
			return String(value)
		}

		try {
			return JSON.stringify(this.deepStringifyPreprocess(value), null, space)
		} catch (error) {
			console.warn('SuperJson.stringify failed:', error)
			return String(value)
		}
	}

	/**
	 * @description Preprocess value before stringifying to handle nested objects
	 * @param value - Value to preprocess
	 * @returns Preprocessed value ready for JSON.stringify
	 */
	private static deepStringifyPreprocess(value: any): any {
		// Handle null, undefined, or primitive values
		if (isNil(value) || isPrimitive(value)) {
			return value
		}

		// Handle arrays
		if (Array.isArray(value)) {
			return value.map((item) => this.deepStringifyPreprocess(item))
		}

		// Handle objects
		if (value && typeof value === 'object') {
			// Handle special object types (Date, RegExp, etc.)
			if (value instanceof Date) {
				return value.toISOString()
			}

			if (value instanceof RegExp) {
				return value.toString()
			}

			// Handle plain objects
			if (value.constructor === Object) {
				const result: Record<string, any> = {}
				for (const [key, val] of Object.entries(value)) {
					result[key] = this.deepStringifyPreprocess(val)
				}
				return result
			}

			// For other objects, try to convert to plain object
			try {
				return JSON.parse(JSON.stringify(value))
			} catch {
				return String(value)
			}
		}

		return value
	}

	/**
	 * @description Parse with error handling and fallback
	 * @param value - Value to parse
	 * @param fallback - Fallback value if parsing fails
	 * @returns Parsed value or fallback
	 */
	public static safeParse<T = any>(value: any, fallback?: T): T {
		try {
			return this.parse<T>(value)
		} catch (error) {
			console.warn('SuperJson.safeParse failed:', error)
			return fallback !== undefined ? fallback : (value as T)
		}
	}

	/**
	 * @description Check if a value contains nested JSON strings
	 * @param value - Value to check
	 * @returns True if value contains nested JSON
	 */
	public static hasNestedJson(value: any): boolean {
		if (typeof value === 'string') {
			return this.isValid(value)
		}

		if (Array.isArray(value)) {
			return value.some((item) => this.hasNestedJson(item))
		}

		if (value && typeof value === 'object' && value.constructor === Object) {
			return Object.values(value).some((val) => this.hasNestedJson(val))
		}

		return false
	}
}
