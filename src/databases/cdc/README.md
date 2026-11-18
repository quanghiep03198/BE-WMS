# CDC (Change Data Capture)

## CDC là gì?

CDC là cơ chế ghi nhận các thay đổi trên bảng nguồn để ứng dụng có thể xử lý và đồng bộ chúng sang nơi khác mà không cần đọc lại toàn bộ bảng. Trong module này, SQL Server lưu các thay đổi; ứng dụng NestJS định kỳ đọc chúng và gọi handler tương ứng. Ví dụ trong dự án, dữ liệu từ Data Lake được xử lý để cập nhật các collection MongoDB của hệ thống.

Luồng tổng quát:

```text
Cấu hình bảng ──> Bật CDC trên SQL Server
                         │
Ứng dụng khởi động ──> Tìm các @CdcHandler
                         │
Scheduler ──> Watcher ──> Đọc thay đổi từ SQL Server
                   │     ├─ Bỏ qua echo do ứng dụng tự ghi
                   │     ├─ Gom thay đổi thành nhóm
                   │     └─ Gọi handler
                   ├─ Lưu checkpoint vào Redis
                   └─ Lưu lỗi xử lý vào MongoDB cdc_quarantine
```

## Các thành phần

### `cdc.module.ts` — đăng ký module

`CdcModule` là NestJS dynamic module. Ứng dụng hiện đăng ký bằng `CdcModule.registerAsync(...)`, lấy danh sách cấu hình từ `CDC_CONFIG_TOKEN`. Module cung cấp các service nội bộ để provision, khám phá handler, polling và điều phối lịch chạy; `CdcExplorerService` cùng `CdcEchoRegistryService` được export để phần khác của ứng dụng sử dụng.

Hai cách đăng ký:

- `CdcModule.register(configs)`: truyền trực tiếp danh sách cấu hình đồng bộ.
- `CdcModule.registerAsync(options)`: tạo cấu hình bằng `useFactory`, `useClass` hoặc `useExisting`; có thể khai báo `imports` và `inject` cho các dependency cần thiết.

### `decorators/index.ts` — khai báo handler

`@CdcHandler(options)` gắn metadata lên một class và đồng thời đánh dấu class đó là NestJS provider (`Injectable`). Các trường:

| Trường | Ý nghĩa |
| --- | --- |
| `schema` | Schema SQL Server chứa bảng nguồn. |
| `sourceName` | Tên bảng nguồn cần theo dõi. |
| `dataSourceToken` | Token của kết nối TypeORM tới cơ sở dữ liệu nguồn. |
| `pollIntervalMs` | Khoảng thời gian chờ giữa các lượt poll thông thường, tính bằng mili giây. |
| `lockTtlMs` | Thời hạn lock Redis cho một lượt xử lý; mặc định 60 giây. |
| `originMarkerColumn` | Cột đánh dấu bản ghi do ứng dụng ghi ngược vào SQL Server, ví dụ `sync_id`; dùng để nhận diện và bỏ qua echo. Chỉ khai báo khi bảng có cơ chế ghi ngược này. |

Handler cần triển khai `ICdcHandler` và phương thức `handle(context)`. `context` chứa tên bảng (`schema.table`) và danh sách nhóm thay đổi.

### `types/index.ts` — cấu trúc dữ liệu và hợp đồng

- `CdcProvisionConfig`: cấu hình bật capture cho một bảng, gồm kết nối, schema, tên bảng, các cột cần capture và lựa chọn `supportsNetChanges`.
- `CdcHandlerOptions`: cấu hình runtime gắn với handler qua decorator.
- `ICdcHandler`: hợp đồng xử lý thay đổi; `handle` phải trả về `Promise<void>`.
- `CdcOperation`: một trong `insert`, `update`, `delete`.
- `CdcChangeContext` / `CdcChangeGroup`: dữ liệu truyền cho handler. Mỗi nhóm có operation, mảng `data` và LSN dạng chuỗi hex.

Provision config và handler options phục vụ hai bước khác nhau: config bật CDC trên SQL Server, còn decorator chỉ định handler và nhịp polling cho bảng đó. `schema`, `sourceName` và `dataSourceToken` cần khớp giữa hai cấu hình.

### `services/cdc-provision.service.ts` — chuẩn bị CDC trên SQL Server

`CdcProvisionerService` xử lý từng `CdcProvisionConfig` khi ứng dụng khởi động:

1. Kiểm tra định dạng tên schema, bảng và cột.
2. Bật CDC ở cấp database nếu chưa bật.
3. Kiểm tra capture instance và danh sách cột đã cấu hình.
4. Tạo capture instance nếu chưa tồn tại.
5. Nếu cấu hình cột hoặc `supportsNetChanges` thay đổi, tắt rồi tạo lại capture instance và xóa checkpoint Redis cũ vì LSN của capture instance mới không còn tương thích.

Nếu một bảng provision lỗi, lỗi được ghi log và quá trình tiếp tục với cấu hình kế tiếp. Cần kiểm tra log khởi động để xác nhận bảng đã được provision thành công.

### `services/cdc-bootstrap.service.ts` — khởi động luồng CDC

Trong hook `onApplicationBootstrap`, service gọi provisioner trước. Sau đó, qua `setImmediate`, nó yêu cầu explorer tìm handler và bắt đầu scheduler.

### `services/cdc-explorer.service.ts` — tìm handler

`CdcExplorerService` duyệt các provider của NestJS, tìm metadata do `@CdcHandler` gắn và tạo danh sách handler để scheduler chạy. Nếu cùng một kết nối/schema/bảng được khai báo nhiều lần, service báo lỗi do trùng checkpoint key.

### `services/cdc-scheduler.service.ts` — điều phối polling

Mỗi handler có một vòng lặp riêng, chạy tuần tự:

- Còn dữ liệu tồn (`more`): poll tiếp ngay sau khi nhường event loop.
- Đã xử lý hết hoặc bảng đang bận: chờ `pollIntervalMs`.
- Gặp lỗi: chờ theo exponential backoff, tối đa 30 giây; khi poll không lỗi thì trở lại nhịp bình thường.
- Khi ứng dụng shutdown: gửi tín hiệu hủy và đợi các vòng lặp kết thúc.

Các vòng lặp được lệch pha lúc khởi động để tránh nhiều bảng poll đồng thời.

### `services/cdc-watcher.service.ts` — đọc và xử lý thay đổi

`CdcWatcherService` thực hiện một lượt poll cho một bảng:

1. Lấy lock Redis theo kết nối và bảng, tránh nhiều instance ứng dụng xử lý cùng bảng cùng lúc.
2. Đọc checkpoint LSN trước đó; xác định phạm vi thay đổi mới trong SQL Server.
3. Giới hạn lượng dữ liệu của một lượt đọc để kiểm soát bộ nhớ. Nếu còn backlog, lượt kế tiếp chạy ngay.
4. Đọc từ hàm CDC `net_changes` hoặc `all_changes`, tùy cấu hình capture instance.
5. Với `all_changes`, bỏ before-image của thao tác update và chỉ chuyển after-image cho handler.
6. Lọc echo nếu đã cấu hình `originMarkerColumn`, rồi gom bản ghi thành nhóm theo command ID và operation.
7. Gọi `handle` cho các nhóm. Nếu handler ném lỗi, lưu các dòng liên quan vào collection cách ly.
8. Chỉ cập nhật checkpoint sau khi toàn bộ cửa sổ đã xử lý; nhả lock khi kết thúc.

Nếu checkpoint cũ hơn dữ liệu CDC còn được giữ lại trong SQL Server, watcher bắt đầu lại từ LSN nhỏ nhất còn tồn tại và ghi cảnh báo. Những thay đổi đã bị SQL Server dọn khỏi vùng lưu CDC sẽ không thể được khôi phục từ checkpoint.

### `services/cdc-echo-registery.service.ts` — nhận diện thay đổi ghi ngược

Tên tệp trong repository được viết là `cdc-echo-registery.service.ts`; class export bên trong là `CdcEchoRegistryService`.

Khi ứng dụng ghi dữ liệu trở lại bảng SQL Server, nó có thể đăng ký `originId` vào Redis trước khi ghi. Watcher so sánh giá trị ở `originMarkerColumn` với marker này; nếu khớp, bản ghi được xem là echo do chính ứng dụng tạo và không gọi handler lần nữa. Marker mặc định tồn tại 10 phút.

- `registerOrigin` / `registerOrigins`: đăng ký một hoặc nhiều marker.
- `consumeIfOrigin` / `consumeManyIfOrigin`: xóa và trả kết quả marker đã tồn tại hay chưa.

Với ghi theo lô, hãy gọi `registerOrigins` **trước** khi ghi dữ liệu nguồn để tránh watcher đọc bản ghi trước khi marker được tạo. Nếu Redis gặp lỗi khi kiểm tra marker, lượt poll thất bại để thử lại thay vì coi nhầm bản ghi là thay đổi mới.

### `schemas/cdc-quarantine.schema.ts` — lưu thay đổi xử lý lỗi

Khi handler ném lỗi, watcher **thử** ghi các nhóm thay đổi vào collection MongoDB `cdc_quarantine`, kèm bảng nguồn, token kết nối, payload, thông báo lỗi, LSN và thời điểm cách ly. Schema cũng có các trường `resolved`, `resolved_at` và `resolved_note` để theo dõi việc xử lý thủ công.

**Lưu ý về tên trường:** schema khai báo `source_table`, `data_source_token`, `raw_payload`, `quarantined_at`, trong khi watcher hiện tạo document bằng `sourceTable`, `dataSourceToken`, `rawPayload`, `quarantinedAt`. Do các trường bắt buộc không khớp tên, thao tác lưu quarantine có thể thất bại. Khi đó lượt poll báo lỗi và checkpoint không được cập nhật. Nếu lưu thành công, watcher vẫn có thể tiến checkpoint; quarantine là nơi lưu để điều tra/khôi phục, không phải hàng đợi tự động thử lại.

### `constants/index.ts` — token và khóa registry

- `CDC_PROVISION_CONFIGS`: injection token cho danh sách cấu hình provision.
- `CDC_CHECKPOINT_REGISTRY_KEY`: khóa Redis dạng set lưu danh sách checkpoint key đã đăng ký. Có thể dùng `SMEMBERS cdc:checkpoint:registry` để xem registry.

### `utils/index.ts` — tiện ích dùng chung

- Tạo tên capture instance (`schema_table`) và nhãn bảng (`schema.table`).
- Tạo Redis key cho checkpoint và echo marker.
- Gom bản ghi CDC thành nhóm để truyền cho handler.

## Cấu hình trong ứng dụng

### 1. Khai báo các bảng cần capture

Trong dự án, các cấu hình được cung cấp từ `src/configs/cdc.config.ts` qua `CdcModule.registerAsync`. Mỗi mục `CdcProvisionConfig` có dạng:

```ts
{
  dataSourceToken: DATA_SOURCE_DATA_LAKE,
  schema: DATABASE_SCHEMA,
  sourceName: 'dv_warehouseccodemst',
  capturedColumns: ['keyid', 'warehouse_name', 'sync_id'],
  supportsNetChanges: true
}
```

`capturedColumns` là các cột SQL Server sẽ ghi nhận. Chỉ chọn những cột handler cần dùng và bao gồm cột marker nếu sử dụng echo filtering. `supportsNetChanges: true` cần bảng có khóa chính; nếu không có khóa chính, cấu hình này không thể bật thành công.

### 2. Viết handler cho bảng

Ví dụ rút gọn:

```ts
@CdcHandler({
  schema: DATABASE_SCHEMA,
  sourceName: 'dv_warehouseccodemst',
  dataSourceToken: DATA_SOURCE_DATA_LAKE,
  pollIntervalMs: 5000,
  originMarkerColumn: 'sync_id'
})
export class WarehouseCdcHandler implements ICdcHandler<WarehouseRow> {
  async handle({ changes }: CdcChangeContext<WarehouseRow>): Promise<void> {
    for (const change of changes) {
      if (change.operation === 'insert' || change.operation === 'update') {
        // Đồng bộ change.data sang đích.
      }
    }
  }
}
```

Đảm bảo module chứa handler được import vào ứng dụng để NestJS đăng ký class như provider. Trong dự án, các handler được đặt trong `modules/<tên-module>/infrastructure/cdc/`.

## Lưu ý khi triển khai handler

- **Xử lý idempotent:** nếu tiến trình dừng trước khi checkpoint được lưu, lượt sau sẽ đọc lại các thay đổi từ checkpoint cũ. Hãy dùng upsert hoặc cơ chế tương đương để xử lý lặp an toàn.
- **Xử lý đủ operation:** tùy nghiệp vụ, handler có thể cần xử lý cả insert, update và delete.
- **Đăng ký marker trước khi ghi ngược:** bắt buộc khi dùng echo filtering; nếu không watcher có thể xử lý chính thay đổi do ứng dụng tạo.
- **Đưa marker vào danh sách cột capture:** cột `originMarkerColumn` phải có trong `capturedColumns` để watcher kiểm tra thay đổi của cột đó.
- **Theo dõi log và quarantine:** kiểm tra log provisioning/polling và collection `cdc_quarantine`; các hàng đã quarantine không tự động chạy lại.
- **Giữ thời gian marker phù hợp:** TTL của echo marker cần dài hơn độ trễ capture và thời gian xử lý backlog lớn nhất, nếu không echo có thể bị xử lý như thay đổi bình thường.
