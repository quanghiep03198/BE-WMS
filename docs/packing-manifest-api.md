# Packing manifest API v2

Các endpoint danh sách, tạo job và trạng thái yêu cầu header `X-Api-Version: 2`;
danh sách và tạo job còn yêu cầu `X-User-Factory: <mã nhà máy>`. Download có thể
gọi không cần header phiên bản để trình duyệt tải trực tiếp bằng cookie. Tất cả
endpoint yêu cầu đăng nhập và một trong các quyền manager, FG warehouse staff
hoặc industrial engineering staff. Với endpoint trạng thái và download, chỉ chủ
sở hữu job được truy cập. URL thực tế có prefix `/api`.

## Danh sách

`GET /api/packing-manifest?page=1&pageSize=20&sortBy=po&sortOrder=ASC`

Kết quả: `{ "items": [...], "total": 0, "page": 1, "pageSize": 20 }`.
`page` mặc định 1; mỗi trang luôn có tối đa 20 bản ghi. `pageSize` tùy chọn
được kiểm tra là số nguyên từ 1 đến 100 để tương thích client cũ, nhưng giá trị
được dùng và trả về luôn là 20. `sortBy` là một trong
các field dưới đây; `sortOrder` là `ASC` hoặc `DESC`, mặc định `ASC`. Không truyền
`sortBy` sẽ sắp xếp theo khóa nội bộ của nhóm. Tham số không được hỗ trợ bị từ chối.

| Field                  | Kiểu giá trị     | Filter                                         |
| ---------------------- | ---------------- | ---------------------------------------------- |
| `po`                   | string hoặc null | `po` chứa chuỗi                                |
| `brand_name`           | string hoặc null | `brand_name` chứa chuỗi                        |
| `factory_shoes_style`  | string hoặc null | `factory_shoes_style` chứa chuỗi               |
| `cust_shoes_style`     | string           | `cust_shoes_style` chứa chuỗi                  |
| `color_sn`             | string hoặc null | `color_sn` chứa chuỗi                          |
| `packing_standard`     | string hoặc null | `packing_standard` chứa chuỗi                  |
| `factory_code_produce` | string           | `factory_code_produce` chứa chuỗi              |
| `standard_weight`      | number hoặc null | `standard_weightFrom`, `standard_weightTo`     |
| `actual_avg_weight`    | number hoặc null | `actual_avg_weightFrom`, `actual_avg_weightTo` |
| `target_box_qty`       | number           | `target_box_qtyFrom`, `target_box_qtyTo`       |
| `target_item_qty`      | number hoặc null | `target_item_qtyFrom`, `target_item_qtyTo`     |
| `weighed_box_qty`      | number           | `weighed_box_qtyFrom`, `weighed_box_qtyTo`     |
| `unweighed_box_qty`    | number           | `unweighed_box_qtyFrom`, `unweighed_box_qtyTo` |

Tất cả field trong bảng có thể dùng làm `sortBy`. Khoảng số bao gồm cả hai đầu.
Không có field ngày, enum hoặc boolean. Filter chuỗi dùng SQL Server `LIKE`,
escape ký tự wildcard và áp dụng collation của cơ sở dữ liệu.
`cust_shoes_style` là `CONCAT(shoestyle_codecust, '/', shoestyle_namecust)`.
Mỗi dòng còn trả `original_size_data` là kích thước gốc, dùng làm khóa khi sửa
trọng lượng qua API cũ; trường này không hỗ trợ filter hoặc sort.

## Export

1. `POST /api/packing-manifest/exports`: body JSON chứa các filter và `sortBy`,
   `sortOrder` như trên, không chứa `page` hoặc `pageSize`. Kết quả `{ "jobId": "<uuid>" }`.
   Mỗi user được có một job pending/processing; request cùng factory và filter
   và ngôn ngữ trả lại job đó; factory, filter hoặc ngôn ngữ khác trả 409.
2. `GET /api/packing-manifest/exports/:jobId`: trả `{ "status": "pending" |
"processing" | "done" | "failed" | "expired", "processedRows": 0,
"totalRows": 0, "expiresAt"?: "...", "error"?: "..." }`. Job không còn
   trong Redis hoặc file không còn được báo `expired`; job thuộc user khác trả 404.
3. `GET /api/packing-manifest/exports/:jobId/download`: stream file XLSX; job
   không tồn tại hoặc thuộc user khác trả 404; file hết hạn trả 410; job chưa hoàn
   thành trả 409. `Content-Disposition` cung cấp cả tên ASCII và UTF-8.

Export dùng filter giống danh sách nhưng **không giữ `sortBy`/`sortOrder`**.
Nó đọc theo keyset, bắt đầu bằng `cust_shoes_style` rồi khóa nhóm, để gom các dòng
cùng customer style vào sheet. Một style lớn được chia tiếp mỗi 5.000 dòng dữ
liệu; mỗi sheet có header và dòng tổng kết. Tên sheet được làm sạch và đánh số
khi trùng. Các giá trị chuỗi bắt đầu bằng `=`, `+`, `-`, `@` được thêm dấu nháy.
Nhãn Excel theo ngôn ngữ FE gửi trong header `X-Language`: `vi`, `en` hoặc
`cn`. Header này có ưu tiên cao nhất; giá trị không hợp lệ trả 422. Nếu không
có header, ứng dụng dùng resolver i18n hiện có (`lng`, `Accept-Language`, sau
đó ngôn ngữ fallback được cấu hình, mặc định `en`). Các giá trị dữ liệu không
được dịch; tên sheet dựa trên customer style, và sheet rỗng có tên `Empty`.

Danh sách và export là nhiều truy vấn riêng, tiếp tục kế thừa `NOLOCK` của SQL
cũ, không phải snapshot. Nếu dữ liệu thay đổi trong lúc chạy, số dòng export và
`totalRows` có thể khác nhau. Muốn bảo đảm một snapshot nhất quán cần cấu hình
và thiết kế transaction riêng trên SQL Server.

## Vận hành

- `EXPORT_DIR`: đường dẫn tuyệt đối đến thư mục dành riêng cho export, nằm ngoài
  mọi thư mục static/public. Nếu không đặt, dùng thư mục `i-wms-packing-manifests`
  trong thư mục tạm của hệ điều hành. API và worker phải dùng cùng máy hoặc
  cùng shared volume.
- `EXPORT_TTL_SECONDS`: số giây, mặc định `86400`. Cleanup chạy khi module khởi
  tạo và mỗi 30 phút; dọn cả `.xlsx.tmp` cũ. Job hoàn tất/thất bại có cấu hình
  BullMQ `removeOnComplete`/`removeOnFail` theo cùng TTL; BullMQ áp dụng dọn
  job theo age một cách lazy khi xử lý job tiếp theo.
- Queue giới hạn toàn cục một worker đồng thời; retry ba lần, exponential backoff.
  ExcelJS không có API backpressure cho `row.commit()`: worker chờ sự kiện ZIP
  nội bộ sau mỗi sheet tối đa 5.000 dòng trước khi tạo sheet kế tiếp. Cần kiểm
  thử lại sau khi nâng cấp ExcelJS.
- Kiểm thử Redis local: `$env:RUN_MANIFEST_REDIS_TESTS='1'; pnpm exec jest
src/modules/packing/manifest/manifest-export.redis.spec.ts --runInBand`.
  Kiểm thử bộ nhớ với đầu ghi chậm: `$env:RUN_MANIFEST_MEMORY_TESTS='1'; pnpm
exec jest src/modules/packing/manifest/manifest-export-memory.spec.ts --runInBand`.
- Kiểm thử SQL Server local với bảng tạm và 2.006 nhóm:
  `$env:RUN_MANIFEST_SQL_TESTS='1'; pnpm exec jest
src/modules/packing/manifest/manifest.repository.sql.spec.ts --runInBand`.
  Test kết nối `127.0.0.1:1433`, dùng `DB_USERNAME`/`DB_PASSWORD` trong `.env`
  và rollback transaction sau khi chạy.
- Đã kiểm tra SQL chỉ đọc trên profile TENANT 21 với `VA1` (`GL1`): 23.219
  nhóm; phép đối chiếu ranh giới keyset sau 2.000 dòng không có dòng lệch.
  Đây không phải kiểm thử toàn bộ luồng HTTP/Redis/worker trên dữ liệu thật.
- Trước khi phát hành, kiểm thử end-to-end trên `DV_DATA_LAKE` thật bằng dataset cố định:
  so sánh `total` của list với số dòng dữ liệu trong toàn bộ sheet export, thử
  filter/sort, các nhóm có cùng `keyid` nhỏ nhất, giá trị null và các ký tự LIKE.
  SQL Server local được kiểm tra không có `DV_DATA_LAKE`, nên bước end-to-end
  này chưa được thực hiện ở môi trường phát triển hiện tại.

## Rollback

`GET /api/packing/manifest` và `GET /api/packing/manifest/export` vẫn phục vụ
request không có header version hoặc có `X-Api-Version: 1`. Chúng giữ nguyên
response và cách xử lý đồng bộ cũ, bao gồm nguy cơ timeout và sử dụng nhiều RAM.
FE chuyển sang v2 sau khi hoàn tất kiểm thử tích hợp với SQL Server.
