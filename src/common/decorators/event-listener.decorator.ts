import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'

type EventName = Parameters<typeof OnEvent>[0]
type EventListenerOptions = Parameters<typeof OnEvent>[1]

export const EventListener = (event: EventName, options?: EventListenerOptions): ClassDecorator => {
	return (target) => {
		Injectable()(target)

		const descriptor = Object.getOwnPropertyDescriptor(target.prototype, 'handle')
		if (!descriptor || typeof descriptor.value !== 'function') {
			throw new TypeError(`${target.name} must define a handle method`)
		}

		OnEvent(event, options)(target.prototype, 'handle', descriptor)
	}
}
