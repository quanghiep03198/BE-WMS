export interface IThirdPartyApiHelper {
	getSyncProcess(register: string): Promise<true | null>
	startSyncProcess(register: string): Promise<void>
	exitSyncProcess(register: string): Promise<void>
}
