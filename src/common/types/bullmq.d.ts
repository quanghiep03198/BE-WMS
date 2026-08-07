import type { QueueEventsListener } from 'bullmq'

export module 'bullmq' {
	type CompletedEvent = QueueEventsListener['completed']
	type ErrorEvent = QueueEventsListener['error']
	type CompletedEventArgs = FirstParameter<CompletedEvent>
	type ErrorEventArgs = FirstParameter<ErrorEvent>
}
