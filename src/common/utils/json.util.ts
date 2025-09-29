import { isNil } from 'lodash'
import { isPrimitive } from './common.util'

/**
 * Simple and focused JSON handler - Only 4 core methods
 * @class SuperJson
 */
export class SuperJson {
	/**
	 * 1. Check if value is valid JSON
	 * @param value - Value to check
	 * @returns true if valid JSON string or already an object
	 */
	public static isValid(value: any): boolean {
		if (isNil(value)) return false

		// If already object/array, consider as valid
		if (typeof value !== 'string') {
			return typeof value === 'object'
		}

		// Check for problematic strings
		if (value === '[object Object]' || value === '[object Array]') {
			return false
		}

		try {
			JSON.parse(value)
			return true
		} catch {
			return false
		}
	}

	/**
	 * 2. Check if value contains nested JSON strings
	 * @param value - Value to check for nested JSON
	 * @returns true if contains nested JSON strings
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

	/**
	 * 3. Parse all nested JSON strings to JavaScript objects
	 * @param value - Value to parse (recursively handles nested JSON)
	 * @param maxDepth - Maximum recursion depth (default: unlimited)
	 * @returns Value with all JSON strings converted to objects
	 */
	public static parse<T = any>(value: any, maxDepth: number = -1): T {
		return this.recursiveParse(value, 0, maxDepth) as T
	}

	/**
	 * 4. Stringify all nested objects/arrays (except primitives)
	 * @param value - Value to stringify
	 * @param space - Indentation spaces (optional)
	 * @param maxDepth - Maximum recursion depth (default: unlimited)
	 * @returns JSON string representation of the entire value
	 */
	public static stringify(value: any, maxDepth: number = -1, space?: number): string {
		// Stringify the entire value from root level
		try {
			return JSON.stringify(this.recursiveStringify(value, 0, maxDepth, space), null, space)
		} catch {
			return String(value)
		}
	}

	// Private helper methods

	/**
	 * Recursively parse JSON strings in nested structures
	 */
	private static recursiveParse(value: any, currentDepth: number, maxDepth: number): any {
		// Check depth limit (maxDepth = -1 means unlimited)
		if (maxDepth !== -1 && currentDepth >= maxDepth) {
			return value // Stop recursion, return as-is
		}

		// Handle null, undefined, primitives
		if (isNil(value) || (isPrimitive(value) && typeof value !== 'string')) {
			return value
		}

		// Handle JSON strings
		if (typeof value === 'string') {
			if (this.isValid(value)) {
				try {
					const parsed = JSON.parse(value)
					return this.recursiveParse(parsed, currentDepth + 1, maxDepth) // Recursive parse
				} catch {
					return value
				}
			}
			return value
		}

		// Handle arrays
		if (Array.isArray(value)) {
			return value.map((item) => this.recursiveParse(item, currentDepth + 1, maxDepth))
		}

		// Handle objects
		if (value && typeof value === 'object' && value.constructor === Object) {
			const result: Record<string, any> = {}
			for (const [key, val] of Object.entries(value)) {
				result[key] = this.recursiveParse(val, currentDepth + 1, maxDepth)
			}
			return result
		}

		return value
	}

	/**
	 * Recursively stringify objects/arrays (keep primitives as-is)
	 */
	private static recursiveStringify(value: any, currentDepth: number = 0, maxDepth: number = -1, space?: number): any {
		// Check depth limit (maxDepth = -1 means unlimited)
		if (maxDepth !== -1 && currentDepth >= maxDepth) {
			// At max depth, return primitive representation
			if (isNil(value) || isPrimitive(value)) {
				return value
			}
			return value // Convert complex objects to string
		}

		// Handle null, undefined, primitives - keep as-is
		if (isNil(value) || isPrimitive(value)) {
			return value
		}

		// Handle arrays - stringify nested objects/arrays
		if (Array.isArray(value)) {
			return value.map((item) => {
				if (item && (typeof item === 'object' || Array.isArray(item))) {
					try {
						return JSON.stringify(this.recursiveStringify(item, currentDepth + 1, maxDepth, space), null, space)
					} catch {
						return String(item)
					}
				}
				return item // Keep primitives
			})
		}

		// Handle objects - stringify nested objects/arrays
		if (value && typeof value === 'object') {
			// Handle special objects
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
					if (val && (typeof val === 'object' || Array.isArray(val))) {
						try {
							result[key] = JSON.stringify(this.recursiveStringify(val, currentDepth + 1, maxDepth, space))
						} catch {
							result[key] = String(val)
						}
					} else {
						result[key] = val // Keep primitives
					}
				}
				return result
			}

			// For other objects, try to convert
			try {
				return JSON.parse(JSON.stringify(value))
			} catch {
				return String(value)
			}
		}

		return JSON.stringify(value)
	}
}

console.log(
	SuperJson.isValid(
		'[{"device_sn":"d56f07f5","station_no":"CUS_VA1_WH101","device_ant":"4","is_active":"Y","ip_address":"10.30.82.120","ip_port":"8270"}]'
	)
)
