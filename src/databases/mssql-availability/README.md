# Tạm dừng queue khi MSSQL gián đoạn

Các consumer ghi MSSQL dùng `MssqlQueueGuard`. Lỗi kết nối đáng ngờ được kiểm tra bằng probe tới đúng data source; khi probe thất bại, hoặc SQL Server trả lỗi database không khả dụng, circuit mở và queue gặp lỗi được pause global. Job đang chạy được trả về waiting bằng lock token mà không tăng `attemptsMade`. Các queue khác chỉ bị pause khi chính chúng gặp sự cố; các job đang active không bị hủy.

Sau tối thiểu 30 giây mở mạch, service probe mỗi 5 giây; ba lần liên tiếp thành công thì resume. Nếu mạch mở lại trong vòng 10 phút, thời gian mở tối thiểu tăng gấp đôi, tối đa 10 phút. Probe chỉ đọc trạng thái `ONLINE` và `READ_WRITE`, không chứng minh bảng đích, quyền ghi hay transaction log đã sẵn sàng. Timeout của circuit không hủy query đang chạy: TypeORM/MSSQL vẫn phải giải phóng query và kết nối theo timeout của driver; cần theo dõi pool khi server treo.

| Loại lỗi | Xử lý |
| --- | --- |
| MSSQL/database không khả dụng đã xác định | Pause queue và giữ job |
| Mất kết nối, timeout hoặc lỗi transaction đáng ngờ | Probe; chỉ pause nếu probe thất bại |
| Lỗi lập trình, SQL hoặc tham số xác định | `UnrecoverableError`, job failed ngay |
| Deadlock, xung đột snapshot, lỗi chưa xác định | Giữ retry/backoff hiện tại |

Danh sách mã lỗi trong `mssql-error.classifier.ts` là allowlist; bổ sung mã mới sau khi kiểm tra lỗi thực tế và thêm test. `2601`, `2627`, `547` không được mặc định xem là lỗi vĩnh viễn.

## Vận hành

Redis cấu hình cho circuit phải là cùng server và database với BullMQ. Các thao tác pause/resume và cập nhật trạng thái dùng Lua nguyên tử theo cấu trúc key của BullMQ 5; kiểm thử lại khi nâng BullMQ. Cơ chế này yêu cầu Redis standalone, không hỗ trợ Redis Cluster với key ở nhiều hash slot.

| Key | Nội dung |
| --- | --- |
| `mssql:circuit:open` | Các data source đang mở mạch |
| `mssql:circuit:<data-source>` | Thời điểm, lý do, thời gian chờ và generation |
| `mssql:circuit:<data-source>:queues` | Queue do circuit pause |
| `mssql:circuit:<data-source>:last` | Thời gian chờ lần trước, TTL 10 phút |

Kiểm tra ví dụ: `SMEMBERS mssql:circuit:open`, `HGETALL mssql:circuit:DATA_LAKE` và `SMEMBERS mssql:circuit:DATA_LAKE:queues`. Queue đã pause thủ công trước sự cố không bị tự resume. Queue do circuit pause sẽ được tự resume, kể cả khi có thao tác pause thủ công trong thời gian đó. Nếu không resolve hoặc resume được một queue, circuit giữ trạng thái và ghi log để tiếp tục thử, không xóa dấu vết.

Metric: `mssql_circuit_open{data_source}` và `mssql_circuit_opened_total{data_source}`. Ví dụ cảnh báo: `max(mssql_circuit_open) == 1` trong 2 phút; `increase(bullmq_jobs_total{status="failed"}[5m]) > 0`. Metric circuit mang trạng thái theo từng instance; dùng `max` khi tổng hợp.

## Phạm vi

Áp dụng cho `COMMIT_STOCK_BALANCES_QUEUE`, `COMMIT_STOCK_OUT_QUEUE`, `COMMIT_EXCHANGE_MO_QUEUE`, `COMMIT_UPSERT_EPC_MATCH_QUEUE`, `ROLLBACK_STOCK_TX_QUEUE`, `DEFECTIVE_GOODS_SYNC_QUEUE` và `SYNC_DISPATCH_ORDER_QUEUE`, cùng data source `DATA_LAKE`. Queue import EPC và export manifest chỉ đọc MSSQL, còn queue Deckers phụ thuộc thêm API ngoài nên không được gate. Queue bulk-write EPC và cleanup chỉ xử lý MongoDB.

Thêm queue mới bằng cách inject `MssqlQueueGuard` vào consumer, chuyển toàn bộ xử lý vào `guard.run(dataSourceToken, job, token, work)`, và đăng ký queue như bình thường. Không bọc các queue phụ thuộc nhiều database bằng một data source nếu chưa phân biệt được lỗi thuộc nguồn nào.

## Giới hạn đồng bộ

BullMQ bảo đảm xử lý ít nhất một lần, không bảo đảm đúng một lần hoặc thứ tự giữa các queue. Nếu MSSQL commit nhưng mất phản hồi, job có thể chạy lại. Các thao tác đổi MO và upsert EPC giữ `mo_no_actual` khi replay cùng giá trị; các `MERGE`, `DELETE` và reconcile khác cần được xem xét theo khóa nghiệp vụ, timestamp và thứ tự dữ liệu, không mặc định idempotent dưới mọi cạnh tranh. Đặc biệt, replay snapshot cũ có thể ghi đè trạng thái mới hơn.

Pause không sửa việc event bị mất trước khi enqueue: một số handler chỉ log lỗi `queue.add`, và saga defective-goods buffer trong bộ nhớ. Transactional outbox, bảo đảm thứ tự và đối soát là công việc riêng. Cần cấu hình Redis persistence và theo dõi backlog/failed job theo yêu cầu vận hành.

Test Redis integration chỉ chạy với Redis local riêng: đặt `RUN_MSSQL_CIRCUIT_REDIS_TESTS=1` và `MSSQL_CIRCUIT_TEST_REDIS_PORT` rồi chạy `pnpm exec jest --runInBand --runTestsByPath src/databases/mssql-availability/specs/mssql-circuit.redis.spec.ts`. Test không kết nối MSSQL.
