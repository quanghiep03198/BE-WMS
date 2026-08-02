export interface IChangeStream {
	on: (eventName: string, listener: () => void) => void
	removeListener: (eventName: string, listener: () => void) => void
	close: () => Promise<void> | void
}
