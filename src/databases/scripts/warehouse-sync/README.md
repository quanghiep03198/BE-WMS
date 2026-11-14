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
bun run src/databases/scripts/warehouse-sync/run.ts --inbound-device-sn INBOUND_DEVICE_SERIAL --outbound-device-sn OUTBOUND_DEVICE_SERIAL
```

Replace both serial placeholders with the actual inbound and outbound RFID
device serials. Both serial options are required; they have no
environment-variable fallback. Use `--help` to display the command usage
without connecting to either database:

```sh
bun run src/databases/scripts/warehouse-sync/run.ts --help
```

## Options and defaults

| Option | Default / behavior |
| --- | --- |
| `--db-host <host>` | `DB_HOST` environment variable |
| `--mongo-db-name <name>` | `MONGO_DB_NAME` environment variable |
| `--factory-code <code>` | `APP_TENANCY` environment variable |
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
New daily PO and MO transaction IDs use the application's shared MongoDB
sequence collection: stock-out IDs start with `XF` and stock-in IDs with `SI`,
followed by the source date and a per-type, per-day increasing sequence.
Existing matching transaction IDs are retained on reruns, including older ID
formats; this sync does not replace them or migrate their references. Deleting
ledger data does not reset the shared sequences, and failed writes may leave
gaps in the sequence.
Manufacturing orders and the daily MO inventory ledger include only rows whose
first two MO characters are numeric and at least `14`; no prefix option is
needed. If no manufacturing orders match the threshold, factory and source
filters, the manufacturing-order stage reports a warning.
Daily MO inventory transactions use `UNKNOWN` for a null assembly line.
Null assembly lines and an actual source line named `UNKNOWN` share a group.

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

Finished-goods EPC scans are fetched without joining the MSSQL RFID match or
warehouse code tables. Raw scans are upserted into
`finished_goods_epcs_staging`, keyed by EPC, before a batch aggregation looks
up `finished_goods_epcs_match` by EPC and merges complete records into
`finished_goods_epcs`. The raw staging records are retained for subsequent
runs. A scan without an EPC match remains in staging, is not merged, and is
counted in a warning; rerun the step after synchronizing EPC matches.
The aggregation requires MongoDB 4.2 or later for `$merge` and a unique
`finished_goods_epcs.epc` index. The step creates the index if needed; duplicate
destination EPCs must be resolved first. Do not run multiple instances of this
step concurrently because they share the staging collection.
The aggregation resolves `storage` against `storage_locations.storage_num`
and `dept_code` against `departments.code`, storing their MongoDB ObjectIds in
`storage_location` and `assembly_line` respectively.
If a source code is missing or unmatched, the lowest-ObjectId document from
the corresponding collection is used and the fallback count is reported. An
empty collection fails the step when an EPC needs a reference. Duplicate
codes are reported and resolve to the lowest ObjectId.
The EPC stage filters scans by the `mo_no` on the scan itself, to orders already present in
`manufacturing_orders` with a numeric two-digit prefix of `14` or higher. It
passes the eligible MO list as JSON and joins it with `OPENJSON` before scan
ranking. This requires SQL Server 2016 or later and database compatibility
level 130 or later. If no eligible MO exists, the MSSQL scan is skipped. On
success, the stage logs `elapsedMs`, `epcs`,
`batches`, `epcsPerSecond`, and cumulative Mongo bulk-write wait
(`mongoBulkWriteMs` measures staging writes only); the latter can overlap with
SQL stream time. `epcs` counts merged records, and `batches` counts staged
batches, including batches with missing matches.

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

For defective goods, assembly and sewing lines match department `name.cn`
without filtering by group. An exact match takes precedence; otherwise, the
longest department name contained in the SQL line name is used. A name ending
in a digit cannot match the prefix of a longer number. If multiple names match,
or departments share the same name, a warning is emitted; ties use the lowest
ObjectId. Null or blank source lines do not overwrite existing references;
unmatched nonblank names fail the step.

The defective-goods import reads SQL Server `keyid` without selecting
`sync_id`, and stores it in MongoDB as `source_keyid` with a unique partial
index. New records get new MongoDB ObjectIds; repeat runs reuse those IDs.
Existing MongoDB documents without `source_keyid` cannot be matched
automatically, and may cause duplicate EPC errors. The import does not write
to SQL Server or populate `sync_id`. Before using CDC or Mongo-to-SQL sync,
populate SQL `sync_id` from the corresponding MongoDB `_id`; otherwise CDC
skips those rows and the reverse sync may insert duplicates.

Defective-goods descriptions are decoded from legacy gzip/base64 or plain HTML,
sanitized, and embedded PNG, JPEG, WebP and GIF images are uploaded to the
`images` GridFS bucket. `created_by` and `updated_by` resolve their respective
SQL usernames against MongoDB users; absent or unmatched users become null,
with a warning for unmatched usernames. When the creator is missing, embedded
images use the user specified by `--creator-username` as their owner; the step
fails if that fallback user is also missing. Images are limited to 5 MB each.
Invalid images stop the step. File references and the
document are updated in a MongoDB transaction, requiring a replica set.
Unchanged source descriptions reuse existing images and preserve later edits;
unattached uploads from interrupted runs are handled by the file cleanup job.

Truckload delivery signatures are uploaded to the `dispatch_order_signatures`
GridFS bucket before the delivery is written. Empty signatures become null;
unchanged signatures uploaded by the scripts are reused on subsequent runs.
Invalid base64 or an upload failure stops the step. Older GridFS files are not
automatically deleted.

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
