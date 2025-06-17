# Quy ước Tham số Query String

Tài liệu này trình bày các quy ước về tham số query string được sử dụng trong API của chúng tôi.

## Lọc dữ liệu

Để lọc kết quả, sử dụng các tham số query trùng khớp chính xác với tên trường trong dữ liệu. Ví dụ, để lọc người dùng theo tên:

```
GET /users?name.eq=John
```

## Full text search

Để tìm kiếm Full text trên tất cả các trường, sử dụng tham số `q`:

```
GET /users?q=John
```

## Phân trang

Để phân trang kết quả, sử dụng các tham số `_page` và `_limit`:

```
GET /users?_page=1&_limit=10
```

## Sắp xếp

Để sắp xếp kết quả, sử dụng các tham số `_sort` và `_order`. Tham số `sort` chỉ định trường để sắp xếp, và tham số `order` chỉ định thứ tự (`asc` cho tăng dần, `desc` cho giảm dần):

```
GET /users?sort=name&order=asc
```

## Lấy theo phạm vi

Để lấy một phạm vi các mục, sử dụng các tham số `_start` và `_end`:

```
GET /users?_start=0&_end=10
```

## Ví dụ

Dưới đây là ví dụ về một truy vấn phức tạp kết hợp nhiều quy ước:

```
GET /users?q=John&_page=1&_limit=5&_sort=name&_order=asc
```

Truy vấn này tìm kiếm người dùng có tên "John", trả về trang đầu tiên với 5 kết quả mỗi trang, và sắp xếp kết quả theo tên theo thứ tự tăng dần.

Bằng cách tuân theo các quy ước này, bạn có thể truy vấn và thao tác dữ liệu một cách nhất quán và dễ dự đoán.
