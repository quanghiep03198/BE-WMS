# Đồng bộ kho

CLI Bun này đồng bộ dữ liệu nguồn liên quan đến kho từ MSSQL vào MongoDB,
sau đó tạo báo cáo Excel từ dữ liệu MongoDB.

## Cấu trúc

- `commands/` chứa các bước đồng bộ, truy vấn và tạo báo cáo.
- `helpers/` chứa các hàm hỗ trợ import, reset và stream SQL có thể tái sử dụng.
- `libs/` chứa các client cơ sở dữ liệu và dịch vụ dùng chung cho migration.
- `specs/` chứa các bài kiểm thử đơn vị và tích hợp của migration.
- `utils/` chứa chức năng phân tích tham số CLI và ghi log.
- `run.ts` là điểm khởi chạy CLI.

## Kiểm thử

Đặt các file kiểm thử đơn vị và tích hợp của đồng bộ kho trong thư mục `specs`.
Chạy từ thư mục gốc của repository:

```sh
pnpm test:migrations
```

Kiểm thử tích hợp MongoDB yêu cầu `WAREHOUSE_SYNC_TEST_MONGO_URI`; nếu không
có biến này, các kiểm thử đó sẽ được bỏ qua.

## Chạy

Từ thư mục gốc của repository:

```powershell
Copy-Item migrations\.env.example migrations\.env
# Cấu hình migrations\.env trước khi chạy.
bun --no-env-file run migrations\run.ts
```

Script yêu cầu `migrations/.env` và chỉ đọc cấu hình từ file này, không đọc
file `.env` ở thư mục gốc hoặc các biến môi trường được kế thừa. Điền cấu hình
MSSQL, MongoDB, `APP_TENANCY` và số serial của hai thiết bị. Tùy chọn CLI
ghi đè giá trị trong file. Dùng `--no-env-file` để Bun không tự tải các file
`.env` khác trước khi script khởi chạy. Dùng `--help` để xem hướng dẫn mà không
kết nối cơ sở dữ liệu:

```sh
bun --no-env-file run migrations/run.ts --help
```

## Tùy chọn và giá trị mặc định

| Tùy chọn                        | Giá trị mặc định / hành vi                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `--db-host <host>`              | Biến môi trường `DB_HOST`                                                                 |
| `--mongo-db-name <name>`        | Biến môi trường `MONGO_DB_NAME`                                                           |
| `--factory-code <code>`         | Biến môi trường `APP_TENANCY`                                                             |
| `--device-sn-101 <serial>`      | `DEVICE_SN_101` trong `migrations/.env`                                                   |
| `--device-sn-103 <serial>`      | `DEVICE_SN_103` trong `migrations/.env`                                                   |
| `--include-backups`             | Bao gồm dữ liệu quét backup hằng ngày; mặc định không bật                                |
| `--concurrency <n>`             | Số worker EPC; mặc định 4                                                                |
| `--batch-size <1000-5000>`      | Kích thước batch ghi EPC; mặc định 1.000                                                 |
| `--chunk-size <rows>`           | Kích thước chunk của worker EPC; mặc định 10.000, tối thiểu bằng kích thước batch        |
| `--write-mode <upsert\|insert>` | Chế độ ghi EPC; mặc định `upsert`                                                        |
| `--no-cutoff`                   | Bỏ mốc thời gian lọc dữ liệu quét cho đơn hàng, lệnh sản xuất và tiến độ PO hằng ngày    |
| `--creator-username <username>` | `quanghiep`                                                                               |
| `--output-filename <file>`      | `.tmp/warehouse-sync-<timestamp>.xlsx`                                                     |
| `--log-filename <file>`         | `logs/data-migration.log`                                                                 |
| `--step <collection>`           | Chỉ chạy bước tương ứng với collection được chỉ định                                     |
| `--from-step <collection>`      | Chạy từ bước tương ứng với collection được chỉ định đến bước tạo báo cáo                 |
| `--help`                        | In hướng dẫn và thoát mà không kết nối cơ sở dữ liệu                                    |

Không thể kết hợp `--step` và `--from-step`. Nếu không có một trong hai tùy
chọn, tất cả các bước được chạy theo thứ tự:

1. `users`
2. `warehouses` (cũng đồng bộ `storage_locations`; có thể chọn bước bằng một trong hai tên)
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
15. `excel_report` (tạo báo cáo Excel; không phải collection MongoDB)

Ví dụ, thêm `--step storage_locations` để chỉ chạy bước kho và vị trí lưu trữ,
hoặc `--from-step mo_inventory_audit` để chạy tiếp từ kiểm kê đến báo cáo.
Các tùy chọn bắt buộc vẫn phải được cung cấp. Các bước bị bỏ qua không tự
chạy: hãy đảm bảo dữ liệu cần thiết của chúng đã có trong MongoDB. Khi chạy
tiếp, mốc thời gian lọc được tính lại theo ngày hiện tại.

Phải đặt `DB_HOST`, `MONGO_DB_NAME` và `APP_TENANCY`, trừ khi đã cung cấp
các tùy chọn CLI tương ứng. Giá trị trên dòng lệnh ghi đè các biến môi trường
đó. Dấu thời gian mặc định trong tên file đầu ra được tạo từ thời gian UTC
hiện tại. Đảm bảo thư mục `.tmp` tồn tại khi dùng đường dẫn workbook và log
mặc định.

Đơn hàng, lệnh sản xuất và tiến độ PO hằng ngày dùng cùng một mốc lọc loại
trừ: 0 giờ theo giờ Việt Nam vào ngày bắt đầu đồng bộ. Dữ liệu quét từ thời
điểm đó trở đi bị loại khỏi các bước này. Thêm `--no-cutoff` để bao gồm dữ
liệu quét của mọi ngày, kể cả ngày trong tương lai, trong ba bước trên. Các
bộ lọc khác vẫn được áp dụng và phải chạy lại các bước được chọn riêng để cập
nhật dữ liệu của chúng. Không có mốc lọc chung, thay đổi dữ liệu nguồn giữa
các bước có thể khiến kết quả không nhất quán.

Tiến độ PO hằng ngày bỏ qua các lượt quét xuất kho có PO null hoặc trống và
báo số lượng đã bỏ qua; các trường quét không hợp lệ khác vẫn làm bước thất
bại. ID giao dịch PO và MO hằng ngày mới dùng collection sequence MongoDB
dùng chung của ứng dụng: ID xuất kho bắt đầu bằng `XF`, ID nhập kho bắt đầu
bằng `SI`, theo sau là ngày nguồn và số thứ tự tăng theo từng loại, từng
ngày. ID giao dịch đã khớp được giữ lại khi chạy lại, kể cả định dạng ID cũ.
Bước đồng bộ sổ cái MO hằng ngày thay tham chiếu giao dịch bằng ObjectId.
Xóa dữ liệu sổ cái không đặt lại sequence dùng chung, và thao tác ghi thất
bại có thể để lại khoảng trống trong sequence.

Lệnh sản xuất và sổ cái tồn kho MO hằng ngày chỉ bao gồm các dòng có hai ký tự
đầu của MO là chữ số và có giá trị ít nhất `14`; không cần tùy chọn tiền tố.
Nếu không có lệnh sản xuất nào thỏa ngưỡng và các bộ lọc nhà máy, nguồn dữ
liệu, bước lệnh sản xuất sẽ đưa ra cảnh báo.

Đồng bộ đơn hàng đọc danh sách PO UGG hiện tại từ `dvview_invoub` trước khi
ghi đơn hàng. Đơn UGG không có trong danh sách và tất cả đơn không phải UGG
được đánh dấu đã giao đủ bằng cách đặt `shipped_out_qty` của mỗi size bằng
`order_qty`. Đơn UGG có trong danh sách giữ số lượng theo size dựa trên RFID.
Danh sách trống đánh dấu tất cả đơn được đồng bộ là hoàn tất; tra cứu thất
bại hoặc không hợp lệ sẽ dừng bước trước khi ghi PO. Tra cứu không lọc theo
mốc thời gian và dùng SQL Server `NOLOCK`, nên đây là dữ liệu hiện tại có
thể chưa được commit, không phải snapshot tại mốc lọc.

Giao dịch tồn kho MO hằng ngày đối chiếu `dept_code` với `departments.code`
và `storage` với `storage_locations.storage_num`, rồi lưu ObjectId tương ứng.
Mã thiếu hoặc không khớp dùng ObjectId nhỏ nhất trong collection tương ứng;
collection tham chiếu trống làm bước thất bại. Mã kho được đối chiếu không
phân biệt chữ hoa, chữ thường; mã trùng dùng ObjectId khớp nhỏ nhất. Các giao
dịch khác nhau có thể được gán cùng tham chiếu khi thiếu mã; ID của chúng
được tái sử dụng theo thứ tự nguồn, nên xóa một giao dịch có thể làm thay đổi
ID của các giao dịch còn lại.

Với username nguồn trùng nhau sau khi loại khoảng trắng đầu cuối, đồng bộ
người dùng giữ dòng `ts_user` đang hoạt động có `keyid` nhỏ nhất. Nếu dòng
đó join với nhiều bản ghi nhân viên, email và tên hiển thị được dùng để chọn
kết quả xác định. Số dòng nguồn bị bỏ qua được báo trên console. Tài khoản
MongoDB hiện có được cập nhật theo username; tài khoản đích trùng không bị xóa.

Tên thiết bị RFID sử dụng `Vietnamese`, `English` và `SimplifiedChinese` từ
`dv_rfidreader`. Các serial trùng sau khi loại khoảng trắng giữ lại dòng có
`id` nguồn nhỏ nhất; số dòng bị bỏ qua được báo trên console. Tên bản địa hóa
null hoặc trống được bỏ qua và không ghi đè tên hiện có; số lượng cũng được
báo trên console. Các giá trị không hợp lệ khác vẫn làm bước thất bại.

Vị trí lưu trữ được upsert theo kho và tên đã chuẩn hóa. Nếu nhiều dòng nguồn
có cùng cặp này, dòng có `storage_num` nhỏ nhất được sử dụng. Đồng bộ tạo
index duy nhất `(warehouse, name)` và xóa index duy nhất cũ trên `name` mà
không xóa document. Các workflow khác chỉ đối chiếu hoặc sửa vị trí theo tên
phải được cập nhật trước khi có thể dùng tên trùng an toàn; cụ thể, đối chiếu
kiểm kê và cập nhật/xóa vị trí MSSQL chưa giới hạn theo kho.

Dữ liệu quét EPC thành phẩm được lấy mà không join với bảng RFID match hoặc
bảng mã kho của MSSQL. Dữ liệu quét thô được upsert vào
`finished_goods_epcs_staging` theo EPC, sau đó aggregation theo batch tra cứu
`finished_goods_epcs_match` theo EPC và merge bản ghi hoàn chỉnh vào
`finished_goods_epcs`. Collection staging bị xóa sau khi đồng bộ thành công;
nếu thất bại, collection được giữ lại để chẩn đoán hoặc chạy lại. Dữ liệu quét
không có EPC match sẽ không được merge và được tính trong cảnh báo, nhưng bản
ghi staging tương ứng vẫn bị xóa khi đồng bộ thành công. Chạy lại bước sau khi
đồng bộ EPC match để merge các bản ghi đó.

Aggregation yêu cầu MongoDB 4.2 trở lên để dùng `$merge` và index duy nhất
trên `finished_goods_epcs.epc`. Bước này tạo index nếu cần; phải xử lý EPC
trùng ở đích trước. Bước này lấy khóa theo từng database vì các phiên dùng
chung collection staging.

Aggregation đối chiếu `storage` với `storage_locations.storage_num` và
`dept_code` với `departments.code`, lần lượt lưu ObjectId MongoDB vào
`storage_location` và `assembly_line`. Nếu mã nguồn thiếu hoặc không khớp,
document có ObjectId nhỏ nhất trong collection tương ứng được dùng thay thế
và số lần dùng giá trị thay thế được báo. Collection trống làm bước thất bại
khi EPC cần tham chiếu. Mã trùng được báo và chọn ObjectId nhỏ nhất.

Bước EPC lọc dữ liệu quét theo `mo_no` trên chính lượt quét, chỉ lấy các đơn
đã có trong `manufacturing_orders` với tiền tố hai chữ số từ `14` trở lên.
Danh sách MO hợp lệ được truyền dưới dạng JSON và join bằng `OPENJSON` trước
khi xếp hạng dữ liệu quét. Điều này yêu cầu SQL Server 2016 trở lên và mức
tương thích database từ 130 trở lên. Nếu không có MO hợp lệ, bước quét MSSQL
được bỏ qua. Khi thành công, bước ghi log `elapsedMs`, `epcs`, `batches`,
`epcsPerSecond` và tổng thời gian chờ ghi Mongo bulk (`mongoBulkWriteMs` chỉ
đo ghi staging); thời gian này có thể chồng lấp với thời gian stream SQL.
`epcs` đếm các bản ghi đã merge, còn `batches` đếm các batch staging, bao gồm
cả batch có bản ghi thiếu match.

### Xử lý lỗi khóa đồng bộ EPC thành phẩm

```text
finished goods EPCs: Finished goods EPC sync is already running or has a stale lock
```

Lỗi này xảy ra khi document có `_id: "finished_goods_epcs"` đã tồn tại trong
`warehouse_sync_locks` của database MongoDB đích. Có thể một phiên EPC khác
đang chạy, hoặc khóa còn sót sau khi tiến trình bị dừng đột ngột hay không
thể giải phóng khóa. `started_at` chỉ cho biết thời điểm tạo khóa, không chứng
minh khóa đã hết hạn; khóa không tự hết hạn.

1. Xác định đúng MongoDB server và database đích trong `migrations/.env` và
   các tùy chọn CLI ghi đè, đặc biệt `--mongo-db-name` của warehouse runner
   hoặc `--mongo-db` của lệnh EPC độc lập. Kết nối `mongosh` tới đúng server
   bằng phương thức xác thực phù hợp; không đưa thông tin xác thực vào README
   hoặc lịch sử lệnh.
2. Kiểm tra document khóa trong database đích bằng `mongosh` (thay
   `<ten_database_dich>` bằng tên thực tế):

   ```javascript
   const targetDb = db.getSiblingDB("<ten_database_dich>")
   const lock = targetDb.getCollection("warehouse_sync_locks").findOne({ _id: "finished_goods_epcs" })
   printjson(lock)
   ```

3. Kiểm tra các phiên đồng bộ EPC và các writer liên quan trên **mọi máy**
   hoặc job có thể dùng database này. Nếu có phiên đang chạy, chờ phiên đó
   hoàn tất hoặc dừng an toàn rồi kiểm tra lại. `owner` là ID ngẫu nhiên của
   lần chạy, không phải PID; không thể xác định tiến trình chỉ từ trường này.
   Các phiên cũ hoặc writer không tuân theo khóa cũng phải được dừng. Không
   xóa khóa nếu chưa chắc chắn không còn phiên nào đang sử dụng dữ liệu chung,
   và ngăn phiên mới bắt đầu trong lúc xử lý.
4. Chỉ khi đã xác nhận khóa bị bỏ lại và không có phiên nào đang chạy, trong
   cùng phiên `mongosh`, xóa đúng document vừa kiểm tra bằng cả `_id` và
   `owner`:

   ```javascript
   if (!lock || typeof lock.owner !== "string") {
     throw new Error("Không tìm thấy khóa hợp lệ; kiểm tra lại database và document")
   }
   const result = targetDb.getCollection("warehouse_sync_locks").deleteOne({
     _id: "finished_goods_epcs",
     owner: lock.owner
   })
   printjson(result)
   ```

   Kiểm tra `deletedCount` bằng `1`. Nếu bằng `0`, khóa đã thay đổi hoặc không
   còn tồn tại: kiểm tra lại, không xóa bằng bộ lọc rộng hơn. Không xóa toàn
   bộ collection khóa hoặc collection staging; staging có thể cần cho chẩn
   đoán và được giữ lại khi đồng bộ thất bại.
5. Chạy lại bước EPC với chế độ `upsert` mặc định sau khi đảm bảo dữ liệu
   tiên quyết đã có:

   ```powershell
   bun --no-env-file run migrations\run.ts --step finished_goods_epcs
   ```

   Nếu trước đó dùng các tùy chọn CLI ghi đè database hoặc cấu hình, cung cấp
   lại các tùy chọn tương ứng. Dùng `--from-step finished_goods_epcs` thay cho
   `--step` nếu cũng cần chạy lại các bước sau và báo cáo. Chế độ `insert`
   yêu cầu collection đích rỗng, không dùng để chạy lại sau khi đã ghi một
   phần dữ liệu. Kiểm tra log và trạng thái thoát của lệnh.

### Đồng bộ EPC độc lập và benchmark

Lệnh chỉ đồng bộ EPC không chạy warehouse runner chung. Lệnh đọc
`migrations/.env`, gồm `DB_HOST`, `MONGO_DB_NAME`, `DB_USERNAME`,
`DB_PASSWORD`, `DB_PORT` (mặc định 1433), `DB_CONNECTION_TIMEOUT` (mili
giây; mặc định 30000), `DB_TRUST_SERVER_CERTIFICATE` (mặc định `true`) và
`MONGO_URI`. Tùy chọn CLI có thể ghi đè host và tên database. Database SQL là
`DV_DATA_LAKE`; dùng tài khoản SQL chỉ đọc.

`MONGO_URI` phải trỏ đến một server MongoDB duy nhất trên `localhost` hoặc
`127.0.0.1`. Script bắt buộc kết nối trực tiếp và từ chối URI từ xa hoặc
nhiều host. Với bước EPC, đặt `DEVICE_SN_101` và `DEVICE_SN_103` trong
`migrations/.env`, hoặc ghi đè bằng tùy chọn CLI tương ứng. Không commit thông
tin xác thực.

```powershell
bun --no-env-file run migrations/epc-sync.ts --help
bun --no-env-file run migrations/epc-sync.ts
bun --no-env-file run migrations/epc-sync.ts --concurrency 4 --batch-size 1000 --chunk-size 10000
```

Mặc định lệnh chạy bước match rồi đến EPC. Dùng `--stage match` hoặc
`--stage epc` để chọn một bước. Database đích phải có sẵn các lệnh sản xuất,
vị trí lưu trữ và phòng ban cần thiết; bước EPC còn yêu cầu EPC match. Các
database hệ thống bị từ chối. Database MongoDB được chỉ định bằng `--mongo-db`
sẽ bị thay đổi.

Chế độ ghi mặc định là `upsert`, hỗ trợ chạy lại toàn bộ. Chỉ dùng
`--write-mode insert` cho đích rỗng được sử dụng độc quyền; chế độ này kiểm
tra đích rỗng trước khi ghi và dùng insert không theo thứ tự. Sau khi lần nạp
đầu bị gián đoạn, chạy lại bằng `upsert`. Đây không phải đồng bộ tăng dần hay
checkpoint để tiếp tục bền vững. Không chạy đồng thời các phiên đồng bộ vào
cùng đích. Bước EPC từ chối phiên EPC khác có tuân theo khóa bằng document
`warehouse_sync_locks` với `_id: "finished_goods_epcs"`. Xem phần xử lý lỗi
khóa ở trên trước khi xóa document này.

Mỗi worker xử lý một chunk theo các batch. CLI mặc định dùng bốn worker,
1.000 dòng mỗi batch và 10.000 dòng mỗi chunk; chunk phải ít nhất bằng batch,
batch phải từ 1.000 đến 5.000. Stream chờ đến khi worker có chỗ trống. EPC
trùng được theo dõi trong staging theo từng lần chạy; bước match dùng
collection `finished_goods_epcs_match_seen_<id>` có tên duy nhất để bộ nhớ
không tăng theo toàn bộ số EPC. Collection theo dõi match bị xóa khi thành
công và được giữ lại để chẩn đoán khi thất bại; nó cần dung lượng đĩa tỷ lệ
với số EPC nguồn. Cả hai bước ghi log số dòng, thời gian và lỗi theo từng
chunk; số dòng lỗi không xác định được ghi là `null`, không phải 0.

Warehouse runner dùng cùng các giá trị mặc định và tùy chọn điều chỉnh này cho
cả hai bước EPC. Tùy chọn `--write-mode insert` của runner cũng yêu cầu mỗi
collection EPC đích được chọn phải rỗng; dùng `upsert` mặc định khi chạy lại
sau lần nạp một phần.

Để benchmark, dùng URI MongoDB cục bộ và database tham chiếu cục bộ đã có:

```powershell
bun --no-env-file run migrations/benchmark-epc-sync.ts --source-mongo-db data_warehouse --mongo-db epc_sync_benchmark_anchor --stage match --batch-size 1000 --chunk-size 1000 --write-mode insert
bun --no-env-file run migrations/benchmark-epc-sync.ts --source-mongo-db data_warehouse --mongo-db epc_sync_benchmark_anchor --stage epc --batch-size 1000 --chunk-size 1000 --write-mode insert --include-backups
```

Benchmark chọn tối đa tám MO hợp lệ từ database tham chiếu cục bộ, dùng tối
đa tám chunk dữ liệu nguồn và chạy với mức đồng thời 1, 2, 4 và 8 trên các
database cục bộ tạm riêng biệt. Mỗi database bị xóa sau lượt chạy; database
tham chiếu chỉ được đọc. Benchmark EPC sao chép các tham chiếu khớp vào từng
database tạm trước khi đo thời gian. Thời gian đo gồm stream SQL và ghi Mongo,
nhưng không gồm chuẩn bị tham chiếu. Benchmark so sánh fingerprint đầu ra,
báo RSS tiến trình lấy mẫu cao nhất và không ước tính cho 20 triệu dòng nếu
mẫu không đầy đủ hoặc thay đổi giữa các lượt chạy. Mức bão hòa là mức cải
thiện thông lượng dưới 10% so với mức đồng thời trước đó. Ước tính từ mẫu nhỏ
chỉ mang tính tạm thời và không bao gồm chuẩn bị tham chiếu, topology production,
chạy lại khi lỗi và các bước workflow tiếp theo.

Đơn hàng ghi phương thức hoặc điểm đến vận chuyển là `null` nếu nguồn không
có giá trị; giá trị null từ nguồn không ghi đè giá trị hiện có. Phương thức
vận chuyển khác null phải là `AIR` hoặc `OCEAN`. Khi nhiều dòng nguồn cùng PO,
một dòng được chọn trước khi join với size đơn hàng: dòng có nhiều trường vận
chuyển khác null nhất được ưu tiên. Nếu bằng nhau, các trường vận chuyển, số
lượng đơn hàng, thương hiệu, kiểu và màu được dùng để chọn kết quả xác định.
Điều này tránh nhân số lượng đóng gói và đơn hàng do các dòng nguồn trùng.
Nếu nhiều dòng đầu ra vẫn chuẩn hóa về cùng PO, chúng được upsert theo thứ tự
stream: dòng cuối thay thế thông tin đóng gói, tiến độ và dữ liệu khác null
khác, còn trường vận chuyển null không ghi đè giá trị hiện có. Truy vấn SQL
không đảm bảo thứ tự đầu ra, nên dòng đóng gói được chọn cho các bản trùng
có thể khác nhau giữa các lượt chạy.

Tên phòng ban được tạo từ bản dịch `factory.departments` sau khi loại ký tự
tiếng Trung khỏi tên nguồn. Tên nguồn không còn ký tự nào sẽ bị từ chối.

Với hàng lỗi, chuyền lắp ráp và chuyền may được đối chiếu với `name.cn` của
phòng ban mà không lọc theo nhóm. Ưu tiên khớp chính xác; nếu không có, dùng
tên phòng ban dài nhất nằm trong tên chuyền SQL. Tên kết thúc bằng chữ số
không được khớp với tiền tố của một số dài hơn. Nếu nhiều tên khớp hoặc nhiều
phòng ban cùng tên, hệ thống phát cảnh báo; trường hợp bằng nhau dùng ObjectId
nhỏ nhất. Tên chuyền nguồn null hoặc trống không ghi đè tham chiếu hiện có;
tên khác rỗng nhưng không khớp làm bước thất bại.

Import hàng lỗi đọc `keyid` từ SQL Server mà không chọn `sync_id`, rồi lưu
vào MongoDB dưới tên `source_keyid` với partial index duy nhất. Bản ghi mới
nhận ObjectId MongoDB mới; các lượt chạy lại dùng lại ID đó. Document MongoDB
hiện có không có `source_keyid` không thể được tự động đối chiếu và có thể
gây lỗi EPC trùng. Import không ghi vào SQL Server hoặc điền `sync_id`. Trước
khi dùng CDC hoặc đồng bộ Mongo-to-SQL, điền `sync_id` trong SQL từ `_id`
MongoDB tương ứng; nếu không, CDC bỏ qua các dòng đó và đồng bộ ngược có thể
thêm bản ghi trùng.

Mô tả hàng lỗi được giải mã từ gzip/base64 cũ hoặc HTML thuần, được làm sạch,
và hình PNG, JPEG, WebP, GIF nhúng được tải lên bucket GridFS `images`.
`created_by` và `updated_by` đối chiếu username SQL tương ứng với người dùng
MongoDB; người dùng thiếu hoặc không khớp trở thành null, kèm cảnh báo khi
username không khớp. Khi thiếu người tạo, ảnh nhúng dùng người dùng được chỉ
định bởi `--creator-username` làm chủ sở hữu; bước thất bại nếu người dùng
thay thế này cũng không tồn tại. Mỗi ảnh bị giới hạn 5 MB. Ảnh không hợp lệ
làm bước dừng. Tham chiếu file và document được cập nhật trong transaction
MongoDB, yêu cầu replica set. Mô tả nguồn không thay đổi sẽ dùng lại ảnh hiện
có và giữ các chỉnh sửa về sau; job dọn file xử lý các file đã tải lên nhưng
chưa được gắn do lượt chạy bị gián đoạn.

Sau khi import hàng lỗi thành công, bước này dựng lại báo cáo nhập và xuất
hằng ngày trong `defective_goods_daily_report` cho mỗi ngày UTC có trong dữ
liệu được đồng bộ, dùng cùng cách nhóm và bộ lọc với báo cáo ứng dụng, bao
gồm hàng đã xóa mềm. Mỗi ngày và loại được thay thế trong transaction MongoDB,
kể cả xóa báo cáo nếu hàng của ngày đó không còn đủ điều kiện; các ngày khác
không thay đổi. Nếu một ngày biến mất hoàn toàn khỏi dữ liệu đồng bộ, báo cáo
hiện có của ngày đó không bị xóa. Bước giữ một snapshot tạm để bảo vệ báo cáo
lịch sử khỏi TTL xuất kho hàng lỗi trong quá trình import và xóa snapshot khi
bước kết thúc hoặc thất bại. Tiến trình dừng đột ngột có thể để lại collection
`defective_goods_report_staging_<id>`; chỉ xóa sau khi xác nhận phiên đồng bộ
sở hữu nó không còn chạy. Không chạy chồng lấp các phiên đồng bộ hàng lỗi hoặc
job báo cáo hằng ngày đồng thời với bước này: chúng có thể thay thế hoặc thêm
báo cáo cho cùng ngày.

Chữ ký giao hàng theo chuyến xe được tải lên bucket GridFS
`dispatch_order_signatures` trước khi ghi giao hàng. Chữ ký trống trở thành
null; chữ ký không thay đổi đã tải lên bởi script được dùng lại ở các lượt
chạy tiếp theo. Base64 không hợp lệ hoặc lỗi tải lên làm bước dừng. Các file
GridFS cũ không tự động bị xóa.

## Workbook đầu ra

Báo cáo không cần workbook tham chiếu. Báo cáo tạo các worksheet:

- `manufacturing_orders` — số lượng lệnh sản xuất và theo size, bao gồm số
  lượng còn thiếu.
- `purchase_orders` — số lượng đơn hàng và theo size, bao gồm số lượng còn thiếu.

Báo cáo chỉ được ghi vào đường dẫn đầu ra sau khi tạo thành công. Workflow ghi
log từng bước vào file log đã cấu hình. Nếu một bước thất bại và vẫn còn bước
khác, terminal tương tác sẽ hỏi `y/n`: `y` bỏ qua bước thất bại và tiếp tục,
còn `n` dừng lại. Nếu không có terminal tương tác, workflow dừng khi thất bại.
Tiếp tục có thể khiến các bước sau thất bại hoặc dùng dữ liệu không đầy đủ;
lệnh thoát với trạng thái khác 0 ngay cả khi các bước còn lại thành công.

## An toàn cơ sở dữ liệu

MSSQL là nguồn chỉ đọc: workflow này chỉ chạy truy vấn đọc, không ghi vào MSSQL
hoặc gọi stored procedure. MongoDB là đích đồng bộ và được các bước đồng bộ
ghi dữ liệu; bước báo cáo cũng đọc các collection MongoDB. Kiểm tra database
đích và cấu hình trước khi chạy workflow. Không coi `--help` là bước thay thế
cho việc cấu hình đích MongoDB an toàn khi chạy toàn bộ.
