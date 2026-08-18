// cdc/cdc-handler.decorator.ts
import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'

export const CDC_HANDLER_METADATA = Symbol('CDC_HANDLER_METADATA')

export interface CdcHandlerOptions {
	/**
	 * @description Schema name of the source table to watch for CDC events. This is used to identify the table in the database.
	 * @requires
	 */
	schema: string
	/**
	 * @description Name of the source table to watch for CDC events. This is used to identify the table in the database.
	 * @requires
	 */
	sourceName: string
	/**
	 * @description Name of the data source token to use for connecting to the database. This is used to identify the database connection in the application.
	 * @requires
	 */
	dataSourceToken: string
	/**
	 * @description Polling interval in milliseconds for checking for new CDC events. This is used to control how frequently the application checks for new events.
	 */
	pollIntervalMs: number

	lockTtlMs?: number

	originMarkerColumn?: string // MỚI — chỉ khai nếu bảng này có Saga ghi ngược lại
}

export function CdcHandler(options: CdcHandlerOptions): ClassDecorator {
	return applyDecorators(
		Injectable(), // luôn là provider — đỡ phải khai riêng
		SetMetadata(CDC_HANDLER_METADATA, options)
	)
}
