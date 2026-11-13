# Warehouse synchronization

This Bun CLI synchronizes warehouse-related source data from MSSQL into MongoDB,
then writes an Excel report from the MongoDB data and a reference workbook.

## Tests

Keep warehouse sync unit and integration specs in the `specs` directory. Run
them from the repository root with:

```powershell
node node_modules\jest\bin\jest.js --runInBand --testPathPattern=warehouse-sync
```

MongoDB integration tests require `WAREHOUSE_SYNC_TEST_MONGO_URI`; otherwise
they are skipped.

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
| `--step <collection>` | Run only the step for the named collection |
| `--from-step <collection>` | Run from the named collection's step through the report |
| `--help` | Print usage and exit without connecting to databases |

`--step` and `--from-step` cannot be combined. Without either option, all
steps run in this order:

1. `users`
2. `warehouses` (also synchronizes `storage_locations`; either name selects this step)
3. `departments`
4. `product_specifications`
5. `purchase_orders`
6. `manufacturing_orders`
7. `daily_po_shipping_progress`
8. `rfid_devices`
9. `finished_goods_epcs_match`
10. `finished_goods_epcs`
11. `mo_inventory_audit`
12. `daily_mo_inventory_ledger`
13. `truckload_delivery`
14. `defective_goods`
15. `excel_report` (writes the Excel report; not a MongoDB collection)

For example, append `--step storage_locations` to run only the warehouse and
storage location step, or `--from-step mo_inventory_audit` to resume from the
inventory audit through the report. Required options still apply. Skipped
steps are not run automatically: ensure their prerequisite data already
exists in MongoDB. Resuming calculates a new cutoff from the current day.

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

Finished-goods EPC scans resolve `storage` against `storage_locations.storage_num`
and `dept_code` against `departments.code`, storing their MongoDB ObjectIds.
If a source code is missing or unmatched, the lowest-ObjectId document from
the corresponding collection is used and the fallback count is reported. An
empty collection fails the step when an EPC needs a reference. Duplicate
codes are reported and resolve to the lowest ObjectId.

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
successfully. The workflow logs each stage to the configured log file. If a
stage fails and another stage remains, an interactive terminal prompts `y/n`:
`y` skips the failed stage and continues, while `n` stops. Without an
interactive terminal the workflow stops on failure. Continuing may cause
later stages to fail or use incomplete data; the command exits with a nonzero
status even if the remaining stages succeed.

## Database safety

MSSQL is a read-only source: this workflow issues read queries only and does
not write to MSSQL or call stored procedures. MongoDB is the synchronization
destination and is written by the sync stages; the report stage also reads
MongoDB collections. Review the destination database and configuration before
running the workflow. Do not use `--help` as a substitute for configuring a
safe MongoDB destination for a full run.
