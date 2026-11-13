# Quy ước Tham số Query String

> **Phiên bản:** 2.0 | **Cập nhật:** 2026-11-12 | **Cơ sở dữ liệu:** SQL Server
> **Đối tượng đọc:** AI agent và lập trình viên.
> **Đọc file này TRƯỚC KHI** thiết kế hoặc cài đặt bất kỳ endpoint danh sách (list) nào có lọc, tìm kiếm, sắp xếp hoặc phân trang.
> Các từ **PHẢI**, **KHÔNG ĐƯỢC**, **NÊN**, **CÓ THỂ** mang nghĩa như RFC 2119. Quy tắc **PHẢI / KHÔNG ĐƯỢC** không có ngoại lệ trừ khi con người phê duyệt rõ ràng.
> Xem thêm: `mssql-indexing.md` (quy ước index và truy vấn SQL Server).

---

## Checklist nhanh

- [ ] Tham số điều khiển (phân trang, sắp xếp) luôn bắt đầu bằng `_`; tham số lọc dùng đúng tên trường
- [ ] Lọc theo dạng `trường:toán_tử=giá_trị`; bỏ toán tử thì mặc định là `eq`
- [ ] Chỉ các trường nằm trong **whitelist** mới được lọc / sắp xếp / tìm kiếm
- [ ] `_sort` và `_order` (có dấu gạch dưới) — KHÔNG dùng `sort` / `order`
- [ ] Mọi danh sách có `_limit` mặc định và **giới hạn tối đa**
- [ ] Không trộn `_page`/`_limit` với `_start`/`_end` trong cùng một request
- [ ] Sắp xếp luôn có cột phụ duy nhất (`id`) để kết quả ổn định
- [ ] Giá trị luôn đi qua **tham số có kiểu** (parameterized), không nối chuỗi SQL
- [ ] Tham số không hợp lệ trả về `400`, không bị bỏ qua âm thầm
- [ ] Mỗi tổ hợp lọc/sắp xếp được hỗ trợ đều có index phù hợp

---

## 1. Tham số dành riêng (reserved)

Mọi tham số bắt đầu bằng `_` là tham số điều khiển của API. Vì vậy:

- Tên trường dữ liệu KHÔNG ĐƯỢC bắt đầu bằng `_`.
- `q` là tham số dành riêng cho tìm kiếm văn bản; không có trường dữ liệu nào được đặt tên `q`.

| Tham số          | Chức năng                        | Mặc định                   |
| ---------------- | -------------------------------- | -------------------------- |
| `q`              | Tìm kiếm văn bản                 | không có                   |
| `_page`          | Số trang, bắt đầu từ `1`         | `1`                        |
| `_limit`         | Số bản ghi mỗi trang             | `20` (tối đa `100`)        |
| `_start`, `_end` | Lấy theo phạm vi vị trí          | không có                   |
| `_cursor`        | Phân trang bằng con trỏ (keyset) | không có                   |
| `_sort`          | Trường sắp xếp                   | theo cấu hình của endpoint |
| `_order`         | Chiều sắp xếp: `asc` / `desc`    | `asc`                      |

Tham số lạ bắt đầu bằng `_` hoặc có trường/toán tử không hợp lệ PHẢI trả về `400 Bad Request` kèm thông báo lỗi nêu rõ tham số sai. KHÔNG ĐƯỢC bỏ qua âm thầm.

---

## 2. Lọc dữ liệu

Cú pháp: `trường:toán_tử=giá_trị`. Nếu bỏ `:toán_tử` thì dùng `eq`.

```
GET /users?name:eq=John
GET /users?name=John            # tương đương dòng trên
GET /users?age:gte=18&age:lt=30
GET /users?status:in=active,pending
```

| Toán tử      | Ý nghĩa                                                      | Ví dụ                   | SQL Server tương ứng             |
| ------------ | ------------------------------------------------------------ | ----------------------- | -------------------------------- |
| `eq`         | bằng                                                         | `name:eq=John`          | `Name = @p`                      |
| `ne`         | khác                                                         | `status:ne=deleted`     | `Status <> @p`                   |
| `gt`, `gte`  | lớn hơn, lớn hơn hoặc bằng                                   | `age:gte=18`            | `Age >= @p`                      |
| `lt`, `lte`  | nhỏ hơn, nhỏ hơn hoặc bằng                                   | `age:lt=30`             | `Age < @p`                       |
| `in`         | thuộc danh sách (phân tách bằng dấu phẩy, tối đa 50 giá trị) | `status:in=a,b`         | `Status IN (@p1, @p2)`           |
| `startswith` | bắt đầu bằng                                                 | `name:startswith=Ng`    | `Name LIKE @p + '%'` (đã escape) |
| `isnull`     | là / không là NULL                                           | `deletedAt:isnull=true` | `DeletedAt IS NULL`              |

Quy tắc:

- Tên trường trong query PHẢI trùng chính xác với tên trường trong dữ liệu trả về (API), và được ánh xạ sang tên cột qua **whitelist** do server định nghĩa. KHÔNG ĐƯỢC đưa tên trường từ query vào câu SQL trực tiếp.
- Mỗi endpoint PHẢI khai báo rõ danh sách trường được phép lọc và toán tử cho phép của từng trường. Trường nào không có index phù hợp thì KHÔNG NÊN cho phép lọc trên bảng lớn.
- Nhiều điều kiện khác nhau được kết hợp bằng **AND**. Muốn dùng OR, hãy dùng toán tử `in` hoặc thiết kế endpoint riêng.
- Giá trị PHẢI được ép kiểu theo kiểu dữ liệu của trường (số, ngày, boolean, ...) rồi truyền vào dưới dạng **tham số có kiểu khớp với cột** (xem mục implicit conversion trong tài liệu index). Giá trị sai kiểu trả về `400`.
- KHÔNG hỗ trợ `contains` / `endswith` (tức `LIKE '%...'`) trên bảng lớn vì không dùng được index seek. Nếu thật sự cần, dùng `q` với Full-Text Search.
- Lọc theo thời gian PHẢI dùng khoảng nửa mở: `gte` ngày bắt đầu và `lt` ngày kế tiếp.

```
# ✅ Lọc theo ngày: nửa mở
GET /orders?createdAt:gte=2024-01-01&createdAt:lt=2024-01-02

# ❌ Không dùng toán tử "between" / "date" cho cột ngày giờ
```

---

## 3. Tìm kiếm văn bản (`q`)

Tham số `q` tìm kiếm văn bản trên **một tập trường cố định** do endpoint định nghĩa (không phải "tất cả các trường").

```
GET /users?q=John
```

Quy tắc:

- Mỗi endpoint PHẢI khai báo rõ `q` tìm trên những trường nào (ví dụ `name`, `email`).
- Độ dài tối thiểu của `q` là 2 ký tự; ngắn hơn trả về `400`.
- Cài đặt trên SQL Server theo thứ tự ưu tiên:
   1. **Full-Text Index** với `CONTAINS` / `FREETEXT` cho văn bản dài hoặc cần tìm theo từ.
   2. Tìm theo **tiền tố** `LIKE @q + '%'` trên cột có index.
   3. `LIKE '%' + @q + '%'` chỉ được dùng trên bảng nhỏ (dưới khoảng 10.000 dòng) và PHẢI có ghi chú giải thích.
- Ký tự đặc biệt của `LIKE` (`%`, `_`, `[`) trong `q` PHẢI được escape.
- `q` có thể kết hợp với bộ lọc: các điều kiện được kết hợp bằng AND.

---

## 4. Sắp xếp

Dùng `_sort` và `_order` (đều có dấu gạch dưới).

```
GET /users?_sort=name&_order=asc
GET /users?_sort=createdAt,name&_order=desc,asc    # nhiều trường
```

Quy tắc:

- `_order` nhận `asc` hoặc `desc`. Khi sắp xếp nhiều trường, số phần tử của `_order` PHẢI bằng số phần tử của `_sort` (hoặc bỏ `_order` để mặc định tất cả là `asc`).
- Trường sắp xếp PHẢI nằm trong whitelist của endpoint và có index hỗ trợ.
- Server PHẢI tự **thêm cột duy nhất (thường là `id`) vào cuối** mệnh đề `ORDER BY` để thứ tự luôn xác định. Nếu không, các bản ghi có thể bị trùng hoặc bị bỏ sót giữa các trang.
- Mỗi endpoint PHẢI có `_sort` mặc định (ví dụ `createdAt` giảm dần).

---

## 5. Phân trang

Có ba kiểu. Mỗi endpoint chọn một kiểu; KHÔNG ĐƯỢC trộn nhiều kiểu trong cùng một request (trả về `400`).

### 5.1 Theo trang: `_page` và `_limit` (mặc định)

```
GET /users?_page=1&_limit=10
```

- `_page` bắt đầu từ `1`; `_limit` mặc định `20`, tối đa `100`. Vượt quá tối đa trả về `400` (hoặc bị cắt xuống `100`, tùy theo một lựa chọn thống nhất toàn dự án).
- Cài đặt bằng `OFFSET ... FETCH`: chỉ phù hợp tập dữ liệu nhỏ hoặc trang nông (offset dưới khoảng 1.000). Với danh sách lớn dùng 5.3.
- Response NÊN trả tổng số bản ghi trong header `X-Total-Count` khi tính được rẻ. `COUNT(*)` trên bảng lớn rất tốn kém, nên cân nhắc cache hoặc bỏ qua.

### 5.2 Theo phạm vi: `_start` và `_end`

```
GET /users?_start=0&_end=10      # trả về 10 bản ghi: vị trí 0 đến 9
```

- `_start` tính từ `0`, bao gồm; `_end` **không bao gồm**. Số bản ghi trả về là `_end - _start`.
- Cũng chịu giới hạn tối đa `100` bản ghi. Cài đặt bằng `OFFSET _start ROWS FETCH NEXT (_end - _start) ROWS ONLY`.
- Dùng cho thư viện phía client yêu cầu kiểu này (ví dụ bảng dữ liệu/UI dùng range). Không dùng đồng thời với `_page`/`_limit`.

### 5.3 Theo con trỏ: `_cursor` (khuyến nghị cho danh sách lớn)

```
GET /orders?_limit=20&_cursor=eyJjcmVhdGVkQXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwIiwiaWQiOjEyMzR9
```

- `_cursor` là chuỗi mờ (opaque, ví dụ Base64 của giá trị sắp xếp của bản ghi cuối cùng, gồm cả `id`). Client KHÔNG ĐƯỢC tự dựng hay phân tích cursor.
- Response trả `nextCursor` (hoặc `null` khi hết dữ liệu).
- Cài đặt bằng keyset pagination; cần index khớp với `_sort`:

```sql
SELECT TOP (@Limit) Id, Status, CreatedAt
FROM dbo.Orders
WHERE CreatedAt < @LastCreatedAt
   OR (CreatedAt = @LastCreatedAt AND Id < @LastId)
ORDER BY CreatedAt DESC, Id DESC;
```

---

## 6. Ví dụ kết hợp

```
GET /users?q=John&status:eq=active&age:gte=18&_page=1&_limit=5&_sort=name&_order=asc
```

Truy vấn này tìm các người dùng khớp từ khóa "John" trong các trường được phép tìm kiếm của endpoint (ví dụ `name`, `email`), có `status` là `active` và tuổi từ 18 trở lên. Kết quả sắp xếp theo `name` tăng dần (kèm `id` làm cột phụ), trả về trang đầu tiên với 5 bản ghi.

Ví dụ danh sách lớn dùng cursor:

```
GET /orders?status:eq=pending&_sort=createdAt&_order=desc&_limit=20&_cursor=<nextCursor của trang trước>
```

---

## 7. Xử lý lỗi

Trả về `400 Bad Request` kèm nội dung lỗi có cấu trúc khi:

| Tình huống                                   | Ví dụ                       |
| -------------------------------------------- | --------------------------- |
| Trường không nằm trong whitelist             | `?password:eq=abc`          |
| Toán tử không được hỗ trợ cho trường         | `?name:gt=John`             |
| Giá trị sai kiểu                             | `?age:gte=abc`              |
| `_limit` vượt tối đa hoặc `< 1`; `_page < 1` | `?_limit=1000`              |
| `_start >= _end`                             | `?_start=10&_end=5`         |
| Trộn kiểu phân trang                         | `?_page=1&_start=0&_end=10` |
| `_sort` / `_order` không hợp lệ              | `?_order=up`                |
| Tham số lạ bắt đầu bằng `_`                  | `?_foo=1`                   |

```json
{
	"statusCode": 400,
	"message": "Invalid query parameter",
	"errors": [{ "param": "age:gte", "reason": "must be an integer" }]
}
```

---

## 8. Bảo mật và hiệu năng (dành cho agent)

- **KHÔNG ĐƯỢC** nối chuỗi giá trị hoặc tên trường từ query vào SQL. Giá trị luôn là tham số; tên cột/trường lấy từ whitelist ánh xạ do server định nghĩa.
- **PHẢI** khai báo giới hạn `_limit` tối đa; KHÔNG ĐƯỢC trả về danh sách không giới hạn.
- Trước khi cho phép một trường lọc/sắp xếp mới, PHẢI kiểm tra index theo `indexing-and-queries-sqlserver.md`. Nếu cần index mới, nêu rõ truy vấn mà index phục vụ.
- Khi thêm endpoint, ghi rõ trong code/tài liệu: trường được lọc (kèm toán tử), trường được sắp xếp, trường của `q`, kiểu phân trang, `_sort` mặc định.
- Giá trị lọc dạng chuỗi PHẢI khai báo đúng kiểu tham số (`VARCHAR` / `NVARCHAR`, độ dài) khớp với cột để tránh implicit conversion.

---

Bằng cách tuân theo các quy ước này, bạn có thể truy vấn và thao tác dữ liệu một cách nhất quán, an toàn và dễ dự đoán.
