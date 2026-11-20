# Kế hoạch triển khai chống race condition cho stock flow và rollback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giữ nguyên nghiệp vụ của `stock-in`, `stock-out`, `recall-from-stock` và `rollback-stock-tx`, đồng thời bảo đảm các lệnh chạy đồng thời không làm sai lệch số lượng MO/PO.

**Architecture:** Giữ command handler ở tầng application để điều phối và giữ domain model làm lớp kiểm tra nghiệp vụ đầu tiên. Bổ sung điều kiện cập nhật số lượng nguyên tử trên MongoDB, bên trong transaction hiện có, để snapshot cũ ở application không thể làm vượt giới hạn MO/PO. Dùng cập nhật EPC có điều kiện để các request chồng lấn không ghi nhận cùng một EPC nhiều lần. Với rollback, trạng thái transaction trong MongoDB là nguồn dữ liệu có thẩm quyền; rollback lặp là no-op, còn transaction chỉ còn một phần hiệu lực sẽ bị từ chối toàn bộ.

**Tech Stack:** NestJS CQRS, TypeScript, Mongoose/MongoDB transactions, Jest, pnpm.

**Spec:** Yêu cầu do người dùng cung cấp trong phiên này; không có tài liệu thiết kế riêng.

## Global Constraints

- Giữ nguyên nghiệp vụ hiện tại; không đổi kết quả thành công hoặc cách ánh xạ business error sang HTTP hiện có.
- Phải bao phủ `stock-in`, `stock-out`, `recall-from-stock` và `rollback-stock-tx`.
- Kiểm tra giới hạn theo số liệu mới nhất đã lưu, không chỉ dựa vào số liệu đọc trước transaction ghi.
- Thực hiện guard và các cập nhật EPC/số liệu liên quan trong cùng MongoDB transaction.
- Không thêm dependency runtime mới.

## Review Focus

- Hai lệnh nhập cùng MO/size chạy đồng thời: tổng nhập không vượt phần còn lại theo `order_qty`; kiểm thử ở Task 2.
- Hai lệnh xuất cùng PO/size, kể cả EPC thuộc các MO khác nhau: tổng xuất không vượt `order_qty` của PO; kiểm thử ở Task 2.
- Hai lệnh recall cùng tranh chấp tồn kho của MO/size: tổng recall không vượt tồn kho đã lưu; kiểm thử ở Task 2.
- Cùng EPC được gửi lặp hoặc rollback cạnh tranh với stock flow mới: không cập nhật hai lần, không ghi đè trạng thái mới và không làm counter âm; kiểm thử ở Tasks 2 và 3.
- Rollback từ lịch sử stale/đã void/một phần không còn nguyên vẹn: đã void thì no-op, thiếu một phần thì từ chối toàn bộ; MO/PO hoặc size không hợp lệ cũng bị từ chối mà không tạo/cập nhật dở dang; kiểm thử ở Tasks 1–3.

---

## Đánh giá hiện trạng

- Command handler đọc tiến độ và kiểm tra domain transaction trước khi gọi repository mở MongoDB transaction. Các bước kiểm tra domain hữu ích nhưng không thể là cơ chế bảo đảm chống race condition.
- Các phương thức persistence tăng bộ đếm MO/PO mà không có điều kiện giới hạn dựa trên số liệu đang lưu. MongoDB transaction không làm cho bước kiểm tra trước transaction trở thành dữ liệu có thẩm quyền.
- Phần kiểm tra PO trong stock-out chỉ chọn nhóm MO đầu tiên cho mỗi size, trong khi số EPC có thể đến từ nhiều MO cùng xuất vào một PO/size. Vì vậy tổng số lượng kiểm tra có thể bị thiếu.
- Ranh giới DDD đã có một phần: handler chủ yếu điều phối và domain model giữ một số invariant. Tuy nhiên, persistence chưa bảo vệ invariant khi ghi. Kế hoạch giữ ranh giới này và thêm guard ở database để các lệnh đồng thời an toàn.
- Redis không thuộc MongoDB transaction, nên không dùng Redis làm nguồn quyết định rollback có hợp lệ hay không. MongoDB transaction history là nguồn trạng thái có thẩm quyền; chỉ cập nhật Redis projection sau khi MongoDB commit. Transactional outbox vẫn là hướng nâng cấp riêng để bảo đảm đồng bộ liên kho dữ liệu tốt hơn.
- Luồng rollback hiện đọc lịch sử từ Redis nhưng không dùng `voided` trong lịch sử MongoDB làm chốt chống lặp. Nếu chỉ một phần EPC còn `last_tx` bằng transaction ID, code vẫn có thể áp dụng toàn bộ delta gốc; do đó số lượng bị trừ nhiều hơn phần trạng thái thực sự còn nguyên.
- Màn hình lịch có thể hiển thị transaction cũ do TanStack Query cache. Backend phải kiểm tra trạng thái transaction và EPC/ledger hiện tại, không tin cờ hiển thị hoặc dữ liệu lịch sử đã cache.

### Task 1: Sửa cách tính tổng số lượng trong domain

**Files:**
- Sửa: `src/modules/finished-goods/domain/models/stock-in-transaction.model.ts`
- Sửa: `src/modules/finished-goods/domain/models/stock-out-transaction.model.ts`
- Test: `src/modules/finished-goods/domain/models/stock-transaction-id.spec.ts`

**Interfaces:**
- Sử dụng: `ElectronicProductCode`, `SizeNumber` và các domain exception hiện có.
- Cung cấp: `startTransaction()` của các transaction model tiếp tục trả về transaction ID và ném đúng exception hiện có khi toàn bộ số lượng yêu cầu vượt tiến độ.

- [ ] **Bước 1: Thêm các domain test sẽ thất bại**

Thêm các trường hợp sau vào suite hiện có:
- EPC stock-in có size không tồn tại trong `moInventory` phải ném `ExcessInboundOrderException`.
- Stock-out gồm EPC của hai MO nhưng cùng một size phải cộng tổng số lượng trước khi so với phần PO còn lại; tổng vượt giới hạn phải ném `ExcessOutboundOrderException`.
- Giữ lại test recall thiếu tồn kho hiện tại làm kiểm tra hồi quy.

- [ ] **Bước 2: Chạy suite tập trung và xác nhận test mới thất bại**

Chạy: `pnpm exec jest --runInBand src/modules/finished-goods/domain/models/stock-transaction-id.spec.ts`
Kết quả mong đợi: test stock-in với size không tồn tại và stock-out tổng hợp nhiều MO thất bại; các domain test hiện tại vẫn qua.

- [ ] **Bước 3: Sửa phép tổng hợp số lượng**

Trong `StockInTransaction.startTransaction()`, đối chiếu mọi nhóm size đầu vào với tiến độ MO; size không có trong tiến độ phải được xem là vượt giới hạn thay vì bỏ qua. Trong `StockOutTransaction.startTransaction()`, cộng số EPC theo size cho kiểm tra giới hạn PO, đồng thời giữ nhóm theo MO và size cho kiểm tra tồn kho từng MO. Giữ nguyên exception hiện tại và cấu trúc `cause`.

- [ ] **Bước 4: Chạy lại suite tập trung và xác nhận test qua**

Chạy: `pnpm exec jest --runInBand src/modules/finished-goods/domain/models/stock-transaction-id.spec.ts`
Kết quả mong đợi: PASS, bao gồm các trường hợp biên mới.

### Task 2: Bảo vệ nguyên tử giới hạn số lượng trong persistence cho ba luồng stock

**Files:**
- Sửa: `src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/inventory-ledger.repository.ts`
- Sửa: `src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/shipping-progress-mongo.repository.ts`
- Sửa: `src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-mongo.repository.ts`
- Test: `src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-concurrency.integration.spec.ts`

**Interfaces:**
- Sử dụng: các method hiện có của `IInventoryLedgerRepository`, `IShippingProgressRepository`, `IStockTransactionRepository` và MongoDB transaction session dùng chung.
- Cung cấp: giữ nguyên interface command/repository và business exception hiện có; guard thất bại phải abort transaction, không để EPC hoặc ledger cập nhật dở dang.

- [ ] **Bước 1: Thêm integration test MongoDB cho các tình huống cạnh tranh**

Tạo suite integration có điều kiện chạy bằng `STOCK_TX_TEST_MONGO_URI` và MongoDB replica set (bắt buộc để dùng transaction). Tạo MO, PO, EPC riêng cho từng test và dùng hai instance repository/handler độc lập. Đặt barrier sau khi cả hai lệnh đã đọc cùng snapshot tiến độ; chỉ cho lệnh thứ hai bắt đầu transaction ghi sau khi lệnh thứ nhất commit. Kiểm tra:
- Hai lệnh stock-in không làm tồn kho MO cuối cùng vượt `order_qty`.
- Hai lệnh stock-out không làm tồn kho của bất kỳ MO nào âm hoặc số lượng đã xuất của PO vượt `order_qty`, kể cả khi EPC thuộc nhiều MO.
- Hai lệnh recall không làm tồn kho MO cuối cùng âm.
- Hai request cùng gửi một EPC chỉ cập nhật tiến độ một lần.
- Guard từ chối thì trạng thái EPC và bộ đếm MO/PO đều không đổi.
- MO/PO không tồn tại hoặc size không có trong tiến độ bị từ chối, không tạo/cập nhật document tiến độ.

- [ ] **Bước 2: Chạy integration suite và xác nhận test race thất bại trước khi có guard**

Chạy với `STOCK_TX_TEST_MONGO_URI` trỏ đến replica set dùng riêng cho test:
`pnpm exec jest --runInBand src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-concurrency.integration.spec.ts`
Kết quả mong đợi: với interleaving snapshot cũ được điều khiển, luồng hiện tại tái hiện việc cộng vượt giới hạn (và request trùng EPC có thể bị tính hai lần). Nếu không cấu hình URI, Jest có thể bỏ qua suite; không xem việc bị skip là đã xác minh concurrency.

- [ ] **Bước 3: Thêm guard nguyên tử cho tiến độ MO**

Trong `InventoryLedgerRepository`, biến các cập nhật stock-in, stock-out và recall thành cập nhật có điều kiện trên chính document `ManufacturingOrder` được tăng:
- Stock-in bảo đảm giới hạn theo size hiện có, tính trên tiến độ đang lưu và delta của lệnh hiện tại.
- Stock-out bảo đảm tồn kho hiện tại theo MO/size đủ trước khi tăng `shipped_out_qty`.
- Recall bảo đảm tồn kho hiện tại theo MO/size đủ trước khi tăng `total_recall_tx`.

Dùng transaction session hiện tại cho conditional update và các cập nhật EPC/ledger liên quan. Nếu guard không khớp, ném domain exception tương ứng; không upsert MO bị thiếu như thể guard đã thành công.

- [ ] **Bước 4: Thêm guard PO và cập nhật EPC có điều kiện**

Trong `ShippingProgressMongoRepository`, chỉ tăng số lượng xuất từng PO/size nếu `shipped_out_qty` đang lưu cộng delta không vượt `order_qty`; gộp delta cùng PO/size trước khi áp dụng guard. Trong `StockTransactionMongoRepository`, chỉ cập nhật EPC còn ở trạng thái hợp lệ theo điều kiện nghiệp vụ hiện tại và xác nhận đủ số EPC dự kiến đã chuyển trạng thái trước khi tiếp tục. Guard số lượng hoặc số EPC thất bại phải ném lỗi để MongoDB transaction rollback toàn bộ cập nhật liên quan.

- [ ] **Bước 5: Chạy integration suite và các test tập trung hiện có**

Chạy:
- `pnpm exec jest --runInBand src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-concurrency.integration.spec.ts`
- `pnpm exec jest --runInBand src/modules/finished-goods/domain/models/stock-transaction-id.spec.ts`

Kết quả mong đợi: các race test qua trên replica set đã cấu hình; nghiệp vụ domain và cách ánh xạ exception hiện tại không đổi.

- [ ] **Bước 6: Chạy kiểm tra kiểu dữ liệu**

Chạy: `pnpm typecheck`
Kết quả mong đợi: exit code 0.

### Task 3: Làm rollback an toàn, idempotent và chống trạng thái stale

**Files:**
- Sửa: `src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-mongo.repository.ts`
- Sửa: `src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/inventory-ledger.repository.ts`
- Tạo: `src/modules/finished-goods/domain/exceptions/stock-transaction-not-rollbackable.exception.ts`
- Sửa: `src/modules/finished-goods/presentation/filters/stock-exception.filter.ts`
- Test: `src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-rollback.integration.spec.ts`

**Interfaces:**
- Sử dụng: transaction history trong `DailyMoInventoryLedger` / `DailyPoShippingProgress`, `voided`, EPC `last_tx`, và các method rollback hiện tại.
- Cung cấp: rollback của transaction đã hoàn tất trước đó là no-op idempotent; nếu transaction chỉ còn một phần hiệu lực thì ném `StockTransactionNotRollbackableException` (HTTP 409) và không thay đổi EPC hay ledger.

- [ ] **Bước 1: Thêm integration test cho stale, duplicate và partial rollback**

Trong suite MongoDB replica set, kiểm tra:
- Transaction đã có `voided: true`: gọi rollback lặp lại trả về no-op và không thay đổi các bộ đếm.
- Transaction history chưa void nhưng một phần EPC đã có trạng thái/`last_tx` khác transaction gốc: rollback bị từ chối toàn bộ; EPC và MO/PO counters không đổi.
- Hai rollback cùng transaction chạy đồng thời: chỉ một lần áp dụng delta âm.
- Rollback cạnh tranh với stock flow mới trên cùng EPC: không ghi đè trạng thái mới hơn và không làm counter âm.
- Redis history được đánh dấu void sau khi MongoDB commit; MongoDB mới là nguồn quyết định, không phải dữ liệu lịch sử đang cache ở client hoặc Redis.

- [ ] **Bước 2: Chạy test rollback và xác nhận test partial-state thất bại trước khi sửa**

Chạy với `STOCK_TX_TEST_MONGO_URI` trỏ đến replica set dùng riêng cho test:
`pnpm exec jest --runInBand src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-rollback.integration.spec.ts`
Kết quả mong đợi: luồng hiện tại tái hiện việc trừ toàn bộ transaction history dù chỉ còn một phần EPC mang `last_tx` gốc. Nếu không cấu hình URI, Jest có thể bỏ qua suite; không xem việc bị skip là đã xác minh rollback.

- [ ] **Bước 3: Đọc và claim trạng thái rollback từ MongoDB một cách nguyên tử**

Trong `StockTransactionMongoRepository`, kiểm tra transaction history bền vững trong MongoDB thay vì tin Redis để quyết định rollback. Dùng `voided` làm điều kiện compare-and-set trong cùng transaction với các cập nhật EPC và inverse ledger. Nếu đã voided thì trả về no-op; nếu chưa void nhưng không tìm thấy đủ EPC/counter còn nguyên theo transaction history thì ném exception mới và rollback toàn bộ transaction.

- [ ] **Bước 4: Chỉ hoàn tác đủ tập EPC/counter còn nguyên vẹn**

Đối chiếu trạng thái và `last_tx` của EPC theo transaction gốc trước khi ghi. Các cập nhật trạng thái phải giữ điều kiện trạng thái/`last_tx` ngay trong update; xác nhận số EPC khớp đầy đủ. Trong `InventoryLedgerRepository`, chỉ decrement các trường stock-in/recall/shipped-out nếu counter đang lưu đủ để hoàn tác; nếu không đủ thì ném exception để transaction rollback. Không áp dụng một phần `changes` khi transaction gốc không còn nguyên vẹn.

- [ ] **Bước 5: Ánh xạ lỗi rollback không hợp lệ và đồng bộ Redis sau commit**

Tạo `StockTransactionNotRollbackableException` trong domain và ánh xạ sang HTTP 409 trong `StockExceptionFilter`. Chỉ cập nhật cờ void trong Redis sau khi MongoDB commit thành công; nếu Redis projection chưa đồng bộ, lần retry phải dựa trên MongoDB `voided` và có thể đồng bộ lại mà không áp dụng inverse ledger lần nữa.

- [ ] **Bước 6: Chạy rollback/integration/domain tests và type-check**

Chạy:
- `pnpm exec jest --runInBand src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-rollback.integration.spec.ts`
- `pnpm exec jest --runInBand src/modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-concurrency.integration.spec.ts`
- `pnpm exec jest --runInBand src/modules/finished-goods/domain/models/stock-transaction-id.spec.ts`
- `pnpm typecheck`

Kết quả mong đợi: các guard và rollback idempotent qua trên replica set đã cấu hình; domain tests và type-check đều PASS.

---

## Ghi chú bàn giao

**Transactional outbox cho lịch sử Redis:** Stock-in, stock-out, recall và rollback ghi ý định đồng bộ vào `stock_history_outbox` bằng cùng MongoDB session với EPC và ledger. Worker đọc bản ghi đã commit trên primary và đồng bộ danh sách `transactions:inbound` / `transactions:outbound` theo chu kỳ một giây; lịch sử hiển thị có thể trễ khi có backlog hoặc Redis lỗi. Worker thử lại sau lỗi, không yêu cầu gọi lại lệnh kho. Redis áp dụng theo ID giao dịch trong một Lua script nguyên tử; gửi lại không tạo bản sao hoặc đổi `voided` về `false`. Worker chỉ xóa đúng phiên bản đã gửi, không xóa nhầm rollback mới hơn. Outbox phục vụ lịch sử tạm thời: bản ghi quá hạn không được đưa lại vào Redis. Mốc hết hạn là 23:00 kế tiếp theo giờ ứng dụng, để giao dịch sau giờ chốt không hết hạn ngay. Lịch sử MongoDB vẫn là nguồn quyết định rollback.

Kiểm thử MongoDB replica set: `pnpm test --runInBand --testPathPattern 'stock-transaction-(rollback|concurrency).integration'` với `STOCK_TX_TEST_MONGO_URI`. Đặt thêm `STOCK_TX_TEST_REDIS_URI` trỏ đến Redis thử nghiệm để chạy Lua thật; nếu không đặt, bộ test rollback dùng Redis giả lập. Khi triển khai, thay toàn bộ instance chạy phiên bản cũ để không còn instance ghi Redis trực tiếp trước commit.

Rollback recall khôi phục trạng thái EPC đã ghi ngay trước lúc thu hồi. Nếu giao dịch cũ không lưu trạng thái của một EPC, rollback bị từ chối toàn bộ và không thay đổi EPC hay sổ kho. Số lần nhập kho không đủ để phân biệt `SCANNING` và `IN_STOCK`.

**Bổ sung về hạn mức MO/size:** Mỗi size được cập nhật phải thỏa `0 <= shipped_out_qty <= stocked_in_qty + total_return_tx - total_recall_tx <= order_qty` trên chính document `manufacturing_orders`. Xuất không giải phóng hạn mức nhập; recall giải phóng hạn mức, nên EPC đã nhập lại hợp lệ có thể được thu hồi lần nữa. Stock-out vẫn phải thỏa thêm hạn mức PO/size. MongoDB kiểm trạng thái sau ghi trong cùng transaction với EPC và ledger, kể cả khi rollback. MO đặt 60 EPC size 05 và 40 EPC size 06 phải từ chối lô 50/50 và chấp nhận lô 60/40 nếu toàn bộ hạn mức còn trống.

Domain check trong bộ nhớ tiếp tục giúp từ chối sớm và đưa lỗi nghiệp vụ phù hợp; atomic predicate trên MongoDB là lớp bảo vệ cuối cùng trước race condition. Không dùng mutex trong một process hoặc Redis lock, nhờ đó nhiều instance ứng dụng và nhiều kho cùng được bảo vệ. Không đưa các file inventory đang thay đổi ngoài phạm vi vào commit này.
