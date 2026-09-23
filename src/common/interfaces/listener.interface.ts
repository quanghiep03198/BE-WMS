export interface IEventListener<D, R> {
	handle(data: D): R
}
