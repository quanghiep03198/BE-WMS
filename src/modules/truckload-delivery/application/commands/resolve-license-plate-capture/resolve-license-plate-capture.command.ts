/** Looks up camera snapshots that were recorded before the capture window of the dispatch order became known. */
export class ResolveLicensePlateCaptureCommand {
	constructor(public readonly dispatchOrder: string) {}
}
