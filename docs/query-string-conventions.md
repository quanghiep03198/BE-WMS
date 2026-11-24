# Quy ước Tham số Query String

> **Phiên bản:** 3.0 | **Cập nhật:** 2026-11-24 | **Cơ sở dữ liệu:** MongoDB
> **Đối tượng đọc:** AI agent và lập trình viên.
> **Đọc file này TRƯỚC KHI** thiết kế hoặc cài đặt bất kỳ endpoint danh sách (list) nào có lọc, tìm kiếm, sắp xếp hoặc phân trang.
> Các từ **PHẢI**, **KHÔNG ĐƯỢC**, **NÊN**, **CÓ THỂ** mang nghĩa như RFC 2119. Quy tắc **PHẢI / KHÔNG ĐƯỢC** không có ngoại lệ trừ khi con người phê duyệt rõ ràng.
> Xem thêm: `mongodb-indexing.md` (quy ước index và truy vấn MongoDB).

---

## Checklist nhanh

- [ ] Tham số điều khiển (phân trang, sắp xếp) luôn bắt đầu bằng `_`; tham số lọc dùng đúng tên trường
- [ ] Lọc theo dạng `trường:toán_tử=giá_trị`; bỏ toán tử thì mặc định là `eq`
- [ ] Chỉ các trường nằm trong **whitelist** mới được lọc / sắp xếp / tìm kiếm
- [ ] `_sort` và `_order` (có dấu gạch dưới) — KHÔNG dùng `sort` / `order`
- [ ] Mọi danh sách có `_limit` mặc định và **giới hạn tối đa**
- [ ] Không trộn `_page`/`_limit` với `_start`/`_end` trong cùng một request
- [ ] Sắp xếp luôn có trường phụ duy nhất (`_id`) để kết quả ổn định
- [ ] Filter MongoDB luôn được **server tự dựng** từ whitelist; giá trị từ query chỉ là chuỗi đã ép kiểu, KHÔNG BAO GIỜ là object / toán tử `$...` (chống NoSQL injection)
- [ ] Giá trị luôn được ép về **đúng kiểu BSON của trường** (ObjectId, Date, số, boolean, ...)
- [ ] Tham số không hợp lệ trả về `400`, không bị bỏ qua âm thầm
- [ ] Mỗi tổ hợp lọc/sắp xếp được hỗ trợ đều có index phù hợp (không `COLLSCAN`)

---

## 1. Tham số dành riêng (reserved)

Mọi tham số bắt đầu bằng `_` là tham số điều khiển của API. Vì vậy:

- Tên trường dữ liệu trong API KHÔNG ĐƯỢC bắt đầu bằng `_`.
- Khóa chính `_id` của MongoDB PHẢI được trả ra ngoài API với tên `id`. Trong query, client luôn dùng `id`; server ánh xạ `id` → `_id` qua whitelist (xem mục 2). Client KHÔNG ĐƯỢC dùng `_id` trong query.
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

| Toán tử      | Ý nghĩa                                                      | Ví dụ                   | MongoDB tương ứng                                      |
| ------------ | ------------------------------------------------------------ | ----------------------- | ------------------------------------------------------ |
| `eq`         | bằng                                                         | `name:eq=John`          | `{ name: 'John' }`                                     |
| `ne`         | khác                                                         | `status:ne=deleted`     | `{ status: { $ne: 'deleted' } }`                       |
| `gt`, `gte`  | lớn hơn, lớn hơn hoặc bằng                                   | `age:gte=18`            | `{ age: { $gte: 18 } }`                                |
| `lt`, `lte`  | nhỏ hơn, nhỏ hơn hoặc bằng                                   | `age:lt=30`             | `{ age: { $lt: 30 } }`                                 |
| `in`         | thuộc danh sách (phân tách bằng dấu phẩy, tối đa 50 giá trị) | `status:in=a,b`         | `{ status: { $in: ['a', 'b'] } }`                      |
| `startswith` | bắt đầu bằng                                                 | `name:startswith=Ng`    | `{ name: { $regex: '^' + escapeRegex('Ng') } }`        |
| `isnull`     | là / không là null                                           | `deletedAt:isnull=true` | `{ deletedAt: null }` / `{ deletedAt: { $ne: null } }` |

Quy tắc:

- Tên trường trong query PHẢI trùng chính xác với tên trường trong dữ liệu trả về (API), và được ánh xạ sang đường dẫn trường trong document (field path, ví dụ `id` → `_id`, `owner` → `owner.name`) qua **whitelist** do server định nghĩa. KHÔNG ĐƯỢC đưa tên trường từ query vào filter trực tiếp.
- Mỗi endpoint PHẢI khai báo rõ danh sách trường được phép lọc và toán tử cho phép của từng trường. Trường nào không có index phù hợp thì KHÔNG NÊN cho phép lọc trên collection lớn.
- Nhiều điều kiện khác nhau được kết hợp bằng **AND** (nhiều khóa trong filter, hoặc `$and` khi cần). Muốn dùng OR, hãy dùng toán tử `in` hoặc thiết kế endpoint riêng. KHÔNG ĐƯỢC nhận `$or` / `$and` / `$nor` từ client.
- Giá trị PHẢI được ép kiểu theo **kiểu BSON** của trường rồi mới đưa vào filter. Giá trị sai kiểu trả về `400`. Đặc biệt:

   | Kiểu trường | Cách ép kiểu                                                        |
   | ----------- | ------------------------------------------------------------------- |
   | `ObjectId`  | Chuỗi 24 ký tự hex hợp lệ → `new ObjectId(v)`; không hợp lệ → `400` |
   | `Date`      | Chuỗi ISO 8601 → `new Date(v)`; ngày không hợp lệ → `400`           |
   | số          | `Number(v)` (hoặc `Decimal128` cho tiền tệ); `NaN` → `400`          |
   | boolean     | Chỉ chấp nhận đúng `true` / `false`                                 |
   | chuỗi       | Giữ nguyên chuỗi; giới hạn độ dài tối đa                            |

   > Khác với SQL Server, MongoDB **không báo lỗi** khi so sánh sai kiểu mà chỉ trả về **0 kết quả** (ví dụ so chuỗi `"64f..."` với trường `ObjectId`), và không dùng được index đúng cách. Vì vậy việc ép kiểu ở bước này là bắt buộc, không phải tùy chọn.

- `eq` so khớp **phân biệt chữ hoa/thường và dấu** (ví dụ `Nguyen` ≠ `nguyen` ≠ `Nguyễn`). Nếu endpoint cần so khớp không phân biệt hoa/thường hoặc dấu, PHẢI dùng **collation** (xem mục 4) thay vì `$regex` với cờ `i`.
- `ne` cũng khớp với các document **không có trường đó**; `ne` thường kém chọn lọc nên KHÔNG NÊN dùng làm điều kiện lọc chính trên collection lớn.
- `isnull=true` → `{ trường: null }` khớp cả giá trị `null` lẫn trường **không tồn tại**. Nếu cần phân biệt, dùng thêm `$exists` ở tầng server (không mở ra cho client). `isnull=false` → `{ trường: { $ne: null } }`.
- Với trường kiểu mảng, `eq` khớp nếu **bất kỳ phần tử** nào bằng giá trị. Endpoint PHẢI ghi chú rõ nếu trường lọc là mảng.
- `startswith` PHẢI escape ký tự đặc biệt của regex (`. * + ? ^ $ { } ( ) | [ ] \`), neo đầu chuỗi bằng `^`, KHÔNG dùng cờ `i`, và giới hạn độ dài giá trị (tối đa 100 ký tự) để chống ReDoS. Regex có neo `^` và phân biệt hoa/thường mới dùng được index.
- KHÔNG hỗ trợ `contains` / `endswith` (tức `$regex` không neo đầu chuỗi) trên collection lớn vì phải quét toàn bộ index hoặc collection. Nếu thật sự cần, dùng `q` với Text Index hoặc Atlas Search.
- KHÔNG hỗ trợ `regex`, `where`, `expr` hoặc bất kỳ toán tử `$...` nào do client truyền vào.
- Lọc theo thời gian PHẢI dùng khoảng nửa mở: `gte` ngày bắt đầu và `lt` ngày kế tiếp. Ngày giờ PHẢI lưu kiểu `Date` (BSON), KHÔNG lưu dạng chuỗi.

```
# ✅ Lọc theo ngày: nửa mở
GET /orders?createdAt:gte=2024-01-01&createdAt:lt=2024-01-02

# ❌ Không dùng toán tử "between" / "date" cho trường ngày giờ
```

---

## 3. Tìm kiếm văn bản (`q`)

Tham số `q` tìm kiếm văn bản trên **một tập trường cố định** do endpoint định nghĩa (không phải "tất cả các trường").

```
GET /users?q=John
```

Quy tắc:

- Mỗi endpoint PHẢI khai báo rõ `q` tìm trên những trường nào (ví dụ `name`, `email`).
- Độ dài tối thiểu của `q` là 2 ký tự và tối đa 100 ký tự; ngoài khoảng này trả về `400`.
- Cài đặt trên MongoDB theo thứ tự ưu tiên:
   1. **Atlas Search** (`$search`) nếu hệ thống chạy trên MongoDB Atlas: hỗ trợ tìm theo từ, autocomplete, fuzzy, bỏ dấu tiếng Việt qua analyzer. Đây là lựa chọn tốt nhất cho tìm kiếm văn bản tiếng Việt.
   2. **Text Index** (`$text`) cho văn bản dài hoặc cần tìm theo từ khi không dùng Atlas.
   3. Tìm theo **tiền tố** `{ $regex: '^' + escape(q) }` trên trường có index (có thể ghép nhiều trường bằng `$or` do server dựng).
   4. `$regex` không neo (`.*q.*`, cờ `i`) chỉ được dùng trên collection nhỏ (dưới khoảng 10.000 document) và PHẢI có ghi chú giải thích.
- Lưu ý khi dùng Text Index (`$text`):
   - Mỗi collection chỉ có **một** text index (có thể gồm nhiều trường, đặt trọng số `weights`). Vì vậy phải chốt tập trường của `q` ngay khi thiết kế.
   - MongoDB không có stemming cho tiếng Việt: PHẢI đặt `default_language: 'none'` khi tạo text index.
   - Text index mặc định không phân biệt hoa/thường và dấu (phiên bản index 3), nên `nguyen` khớp `Nguyễn`.
   - Chỉ dùng được **một** biểu thức `$text` trong một truy vấn, và không dùng trong `$or` nếu không phải toàn bộ các nhánh đều có index.
   - Khi dùng `$text`, `_sort` mặc định của endpoint CÓ THỂ là điểm liên quan `{ $meta: 'textScore' }`; nếu client chọn `_sort` khác thì việc sắp xếp có thể không dùng được index.
- Ký tự đặc biệt của regex trong `q` PHẢI được escape khi dùng `$regex` (xem mục 2). Giá trị `q` với `$text` / `$search` cũng KHÔNG ĐƯỢC truyền nguyên văn các cú pháp đặc biệt (ví dụ dấu `-` loại trừ từ, dấu `"` cụm từ) nếu endpoint không chủ ý hỗ trợ.
- `q` có thể kết hợp với bộ lọc: các điều kiện được kết hợp bằng AND.

---

## 4. Sắp xếp

Dùng `_sort` và `_order` (đều có dấu gạch dưới).

```
GET /users?_sort=name&_order=asc
GET /users?_sort=createdAt,name&_order=desc,asc    # nhiều trường
```

Quy tắc:

- `_order` nhận `asc` hoặc `desc` (ánh xạ sang `1` / `-1`). Khi sắp xếp nhiều trường, số phần tử của `_order` PHẢI bằng số phần tử của `_sort` (hoặc bỏ `_order` để mặc định tất cả là `asc`).
- Trường sắp xếp PHẢI nằm trong whitelist của endpoint và có index hỗ trợ. Sắp xếp không có index phải thực hiện trong bộ nhớ và sẽ lỗi khi vượt giới hạn 100 MB (trừ khi bật `allowDiskUse`, KHÔNG NÊN dùng cho API thông thường).
- Server PHẢI tự **thêm `_id` vào cuối** `sort` (cùng chiều với trường cuối cùng) để thứ tự luôn xác định. Nếu không, các bản ghi có thể bị trùng hoặc bị bỏ sót giữa các trang.
- Mỗi endpoint PHẢI có `_sort` mặc định (ví dụ `createdAt` giảm dần).
- Thứ tự trong `sort` PHẢI khớp với thứ tự trường và chiều của một index có sẵn. Khi thiết kế index cho truy vấn vừa lọc vừa sắp xếp, theo quy tắc **ESR** (Equality → Sort → Range): trường lọc bằng đặt trước, rồi đến trường sắp xếp, cuối cùng là trường lọc theo khoảng. Chi tiết xem `mongodb-indexing.md`.
- Trường có thể thiếu hoặc `null` sẽ được xếp cùng nhóm "nhỏ nhất" khi sắp xếp tăng dần; trường có nhiều kiểu BSON khác nhau được xếp theo thứ tự kiểu BSON. Vì vậy mỗi trường sắp xếp PHẢI nhất quán một kiểu dữ liệu.
- Sắp xếp chuỗi tiếng Việt đúng thứ tự (ví dụ `a`, `ă`, `â`, `b`) PHẢI dùng **collation** `{ locale: 'vi' }`. Collation của truy vấn PHẢI trùng với collation của index thì index mới được dùng. Nếu cần so khớp/sắp xếp không phân biệt hoa/thường và dấu, thêm `strength` (`1` bỏ qua hoa/thường và dấu, `2` chỉ bỏ qua hoa/thường). Collation không áp dụng cho `$regex`.

---

## 5. Phân trang

Có ba kiểu. Mỗi endpoint chọn một kiểu; KHÔNG ĐƯỢC trộn nhiều kiểu trong cùng một request (trả về `400`).

### 5.1 Theo trang: `_page` và `_limit` (mặc định)

```
GET /users?_page=1&_limit=10
```

- `_page` bắt đầu từ `1`; `_limit` mặc định `20`, tối đa `100`. Vượt quá tối đa trả về `400` (hoặc bị cắt xuống `100`, tùy theo một lựa chọn thống nhất toàn dự án).
- Cài đặt bằng `.skip((_page - 1) * _limit).limit(_limit)`: `skip` phải duyệt qua tất cả bản ghi bị bỏ qua, nên chỉ phù hợp tập dữ liệu nhỏ hoặc trang nông (skip dưới khoảng 1.000). Với danh sách lớn dùng 5.3.
- Response NÊN trả tổng số bản ghi trong header `X-Total-Count` khi tính được rẻ. PHẢI dùng `countDocuments(filter)` (đếm theo filter); KHÔNG dùng `estimatedDocumentCount()` vì nó bỏ qua filter. `countDocuments` với filter trên collection lớn rất tốn kém, nên cân nhắc cache hoặc bỏ qua.

### 5.2 Theo phạm vi: `_start` và `_end`

```
GET /users?_start=0&_end=10      # trả về 10 bản ghi: vị trí 0 đến 9
```

- `_start` tính từ `0`, bao gồm; `_end` **không bao gồm**. Số bản ghi trả về là `_end - _start`.
- Cũng chịu giới hạn tối đa `100` bản ghi. Cài đặt bằng `.skip(_start).limit(_end - _start)`.
- Dùng cho thư viện phía client yêu cầu kiểu này (ví dụ bảng dữ liệu/UI dùng range). Không dùng đồng thời với `_page`/`_limit`.

### 5.3 Theo con trỏ: `_cursor` (khuyến nghị cho danh sách lớn)

```
GET /orders?_limit=20&_cursor=eyJjcmVhdGVkQXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJpZCI6IjY1ZjAuLi4ifQ
```

- `_cursor` là chuỗi mờ (opaque, ví dụ Base64 của giá trị sắp xếp của bản ghi cuối cùng, gồm cả `_id`). Client KHÔNG ĐƯỢC tự dựng hay phân tích cursor.
- Khi giải mã cursor, server PHẢI kiểm tra cấu trúc và **ép lại đúng kiểu BSON** (`Date` từ chuỗi ISO, `ObjectId` từ chuỗi hex) trước khi đưa vào filter. Cursor sai định dạng hoặc không khớp `_sort` hiện tại trả về `400`. NÊN ký (HMAC) cursor để chống bị sửa.
- Server lấy `_limit + 1` bản ghi để biết còn trang sau hay không. Response trả `nextCursor` (hoặc `null` khi hết dữ liệu).
- Cài đặt bằng keyset pagination; cần index khớp với `_sort`. Điều kiện cursor được kết hợp với filter của client bằng `$and`:

```js
// Index: { createdAt: -1, _id: -1 }
// GET /orders?status:eq=pending&_sort=createdAt&_order=desc&_limit=20&_cursor=...
await orders
	.find({
		$and: [
			{ status: 'pending' }, // filter từ client
			{
				$or: [{ createdAt: { $lt: lastCreatedAt } }, { createdAt: lastCreatedAt, _id: { $lt: lastId } }]
			}
		]
	})
	.sort({ createdAt: -1, _id: -1 })
	.limit(limit + 1) // lấy dư 1 bản ghi để biết còn trang sau
	.toArray()
```

- Khi sắp xếp nhiều trường với chiều khác nhau, điều kiện keyset PHẢI dùng đúng chiều (`$lt` / `$gt`) cho từng trường.

---

## 6. Ví dụ kết hợp

```
GET /users?q=John&status:eq=active&age:gte=18&_page=1&_limit=5&_sort=name&_order=asc
```

Truy vấn này tìm các người dùng khớp từ khóa "John" trong các trường được phép tìm kiếm của endpoint (ví dụ `name`, `email`), có `status` là `active` và tuổi từ 18 trở lên. Kết quả sắp xếp theo `name` tăng dần (kèm `_id` làm trường phụ), trả về trang đầu tiên với 5 bản ghi. Filter MongoDB do server dựng (trường hợp dùng `$text` cho `q`):

```js
await users
	.find({
		$text: { $search: 'John' },
		status: 'active',
		age: { $gte: 18 }
	})
	.sort({ name: 1, _id: 1 })
	.collation({ locale: 'vi' })
	.skip(0)
	.limit(5)
	.toArray()
```

Ví dụ danh sách lớn dùng cursor:

```
GET /orders?status:eq=pending&_sort=createdAt&_order=desc&_limit=20&_cursor=<nextCursor của trang trước>
```

---

## 7. Xử lý lỗi

Trả về `400 Bad Request` kèm nội dung lỗi có cấu trúc khi:

| Tình huống                                             | Ví dụ                                                  |
| ------------------------------------------------------ | ------------------------------------------------------ |
| Trường không nằm trong whitelist                       | `?password:eq=abc`                                     |
| Toán tử không được hỗ trợ cho trường                   | `?name:gt=John`                                        |
| Giá trị sai kiểu                                       | `?age:gte=abc`                                         |
| `ObjectId` không hợp lệ                                | `?id:eq=xyz`                                           |
| Toán tử MongoDB / object trong query (NoSQL injection) | `?status[$ne]=x`, `?name:eq[$regex]=.*`, `?$where=...` |
| Dùng `_id` thay vì `id` trong query                    | `?_id:eq=65f...`                                       |
| `_limit` vượt tối đa hoặc `< 1`; `_page < 1`           | `?_limit=1000`                                         |
| `_start >= _end`                                       | `?_start=10&_end=5`                                    |
| Trộn kiểu phân trang                                   | `?_page=1&_start=0&_end=10`                            |
| `_sort` / `_order` không hợp lệ                        | `?_order=up`                                           |
| `_cursor` sai định dạng hoặc không khớp `_sort`        | `?_cursor=abc`                                         |
| Tham số lạ bắt đầu bằng `_`                            | `?_foo=1`                                              |

```json
{
	"statusCode": 400,
	"message": "Invalid query parameter",
	"errors": [{ "param": "age:gte", "reason": "must be an integer" }]
}
```

---

## 8. Bảo mật và hiệu năng (dành cho agent)

- **KHÔNG ĐƯỢC** truyền `req.query` (hoặc bất kỳ object nào suy ra từ query) trực tiếp vào `find()` / `aggregate()`. Bộ phân tích query string (ví dụ `qs` trong Express) chuyển `?a[$ne]=1` thành object `{ a: { $ne: '1' } }`; đây là đường tấn công NoSQL injection phổ biến nhất. Server PHẢI tự dựng filter từ whitelist, và mỗi giá trị từ query PHẢI là chuỗi (hoặc mảng chuỗi cho `in`) rồi mới được ép kiểu; gặp object lồng nhau → `400`.
- Tên trường từ client KHÔNG ĐƯỢC bắt đầu bằng `$` hoặc chứa dấu `.` trừ khi là một mục có trong whitelist; đường dẫn thật (kể cả dot notation cho trường lồng nhau) lấy từ whitelist do server định nghĩa.
- Nếu dùng Mongoose, NÊN bật `sanitizeFilter` (`mongoose.set('sanitizeFilter', true)`) và `strictQuery` như một lớp bảo vệ bổ sung. Đây KHÔNG thay thế cho whitelist và ép kiểu ở trên.
- KHÔNG ĐƯỢC dùng `$where`, `$function`, `$accumulator` hay `$expr` với dữ liệu từ client. Giá trị đưa vào `$regex` PHẢI được escape và giới hạn độ dài.
- **PHẢI** khai báo giới hạn `_limit` tối đa; KHÔNG ĐƯỢC trả về danh sách không giới hạn. NÊN đặt `maxTimeMS` cho mọi truy vấn của endpoint danh sách để tránh truy vấn chạy quá lâu.
- **PHẢI** dùng `projection` để chỉ trả về các trường cần thiết của endpoint; KHÔNG ĐƯỢC trả về toàn bộ document mặc định, đặc biệt các trường nhạy cảm (ví dụ `password`).
- Trước khi cho phép một trường lọc/sắp xếp mới, PHẢI kiểm tra index theo `mongodb-indexing.md` và chạy `explain('executionStats')` để chắc chắn truy vấn dùng `IXSCAN`, không phải `COLLSCAN`, và `totalDocsExamined` gần bằng `nReturned`. Nếu cần index mới, nêu rõ truy vấn mà index phục vụ.
- Khi thêm endpoint, ghi rõ trong code/tài liệu: trường được lọc (kèm toán tử và kiểu BSON), trường được sắp xếp, trường của `q` (và cách cài đặt: Atlas Search / Text Index / tiền tố), kiểu phân trang, `_sort` mặc định, collation (nếu có).
- Giá trị lọc PHẢI được ép đúng kiểu BSON của trường (`ObjectId`, `Date`, số, boolean, chuỗi) để tránh trường hợp so sánh sai kiểu trả về rỗng và không dùng được index.

---

Bằng cách tuân theo các quy ước này, bạn có thể truy vấn và thao tác dữ liệu một cách nhất quán, an toàn và dễ dự đoán.
