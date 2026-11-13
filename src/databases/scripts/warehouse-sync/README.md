# Warehouse synchronization

This Bun CLI synchronizes warehouse-related source data from MSSQL into MongoDB,
then writes an Excel report from the MongoDB data and a reference workbook.

## Run

From the repository root:

```powershell
bun run src/databases/scripts/warehouse-sync/run.ts --mo-prefix 15 --inbound-device-sn INBOUND_DEVICE_SERIAL --outbound-device-sn OUTBOUND_DEVICE_SERIAL
```

Replace `15` with the required two-digit manufacturing-order prefix and replace
both serial placeholders with the actual inbound and outbound RFID device
serials. Both serial options are required; they have no environment-variable
fallback. Use `--help` to display the command usage without connecting to either
database:

```sh
bun run src/databases/scripts/warehouse-sync/run.ts --help
```

## Options and defaults

| Option | Default / behavior |
| --- | --- |
| `--db-host <host>` | `DB_HOST` environment variable |
| `--mongo-db-name <name>` | `MONGO_DB_NAME` environment variable |
| `--factory-code <code>` | `APP_TENANCY` environment variable |
| `--mo-prefix <prefix>` | Required; exactly two digits |
| `--inbound-device-sn <serial>` | Required inbound RFID device serial |
| `--outbound-device-sn <serial>` | Required outbound RFID device serial |
| `--include-backups` | Include daily backup scans; off unless specified |
| `--creator-username <username>` | `1009006` |
| `--reference-workbook <file>` | `.tmp/gl3-inventory.xlsx` |
| `--reference-sheet <name>` | `ngày 12` |
| `--output-filename <file>` | `.tmp/warehouse-sync-<timestamp>.xlsx` |
| `--log-filename <file>` | `.tmp/warehouse-sync.log` |
| `--help` | Print usage and exit without connecting to databases |

`DB_HOST`, `MONGO_DB_NAME`, and `APP_TENANCY` must be set unless their
corresponding command-line options are supplied. Command-line values override
those environment variables. The default output timestamp is generated from
the current UTC time. Ensure the `.tmp` directory exists when using the default
workbook and log paths.

Purchase orders, manufacturing orders, and daily PO progress use the same
exclusive cutoff: midnight in Vietnam on the day the sync starts. Scans from
that time onward are excluded from these stages.
Daily PO progress skips outbound scans whose PO is null or blank and reports
the number skipped; other invalid scan fields still fail the stage.
The `--mo-prefix` option selects the two-digit prefix for both manufacturing
orders and the daily MO inventory ledger; other prefixes are not imported by
these stages. If no manufacturing orders match the prefix, factory and source
filters, the manufacturing-order stage reports a warning.

For duplicate source usernames (after trimming), the user sync keeps the active
`ts_user` row with the smallest `keyid`. If that row joins multiple employee
records, email and display name are used as deterministic tie-breakers. The
number of skipped source rows is reported in the console. Existing MongoDB
accounts are updated by username; duplicate destination accounts are not deleted.

RFID device names use `Vietnamese`, `English`, and `SimplifiedChinese` from
`dv_rfidreader`. Duplicate device serials after trimming retain the row with
the smallest source `id`; skipped rows are reported in the console. Null or
blank localized names are omitted and do not overwrite existing names; their
number is reported in the console. Other invalid values still fail the stage.

Storage locations are upserted by warehouse and normalized name. If source
rows share that pair, the row with the smallest `storage_num` is used. The sync
creates a unique `(warehouse, name)` index and removes the old unique `name`
index without deleting documents. Other workflows that resolve or mutate
locations by name alone must be updated before using duplicate names safely;
in particular, inventory audit matching and MSSQL location update/delete are
not warehouse-scoped.

Purchase orders insert a `null` shipping method or destination when the source
has no value; a null source value does not overwrite an existing value.
Non-null shipping methods must be `AIR` or `OCEAN`.
When source rows share a PO, one row is selected before joining order sizes:
the row with the most non-null shipping fields wins. Ties are resolved
deterministically using shipping fields, order quantity, brand, styles, and
color. This avoids multiplying packing and order quantities by duplicate
source rows. If multiple output rows still normalize to the same PO, they are
upserted in stream order: the last row replaces packing, progress and other
non-null data, while null shipping fields do not overwrite existing values.
The SQL query does not guarantee output order, so which packing wins for such
duplicates may vary between runs.

Department names are generated from the `factory.departments` translations
after removing Chinese characters from the source name. A source name with no
remaining characters is rejected.

## Output workbook

The report uses `ngày 12` in the reference workbook to compare accumulated
manufacturing-order quantities with MongoDB data. It writes these worksheets:

- `accumulated_comparison` — reference and actual accumulated quantities,
  their difference, and comparison status.
- `manufacturing_orders` — manufacturing-order and size quantities, including
  missing quantities.
- `purchase_orders` — purchase-order and size quantities, including missing
  quantities.

The report is written to the output path only after it has been built
successfully. The workflow logs each stage to the configured log file and
stops at the first failed stage.

## Database safety

MSSQL is a read-only source: this workflow issues read queries only and does
not write to MSSQL or call stored procedures. MongoDB is the synchronization
destination and is written by the sync stages; the report stage also reads
MongoDB collections. Review the destination database and configuration before
running the workflow. Do not use `--help` as a substitute for configuring a
safe MongoDB destination for a full run.
