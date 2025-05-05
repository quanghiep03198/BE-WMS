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
	 * @description Safely parse value to JSON
	 * @param value
	 * @returns
	 */
	public static parse<T>(value: any): T | null | any {
		if (!this.isValid(value)) return value
		return JSON.parse(value) as T
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
