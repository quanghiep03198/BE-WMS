export const PROBE_INTERVAL_MS = 5_000
export const PROBE_TIMEOUT_MS = 5_000
export const REQUIRED_HEALTHY_PROBES = 3
export const MIN_OPEN_MS = 30_000
export const MAX_MIN_OPEN_MS = 600_000
export const FLAP_WINDOW_MS = 600_000
export const MSSQL_CIRCUIT_OPEN_GAUGE = 'mssql_circuit_open'
export const MSSQL_CIRCUIT_OPENED_COUNTER = 'mssql_circuit_opened_total'
export const MSSQL_PROBE_SQL =
	"SELECT CASE WHEN DATABASEPROPERTYEX(DB_NAME(), 'Status') = 'ONLINE' AND DATABASEPROPERTYEX(DB_NAME(), 'Updateability') = 'READ_WRITE' THEN 1 ELSE 0 END AS ok"
