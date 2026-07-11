export interface IListener<D, R> {
	handle(data: D): R
}
