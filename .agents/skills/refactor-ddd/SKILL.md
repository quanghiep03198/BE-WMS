---
name: refactor-ddd
description: Refactor lại module đang có đã được tổ chức theo mô hình controller - service sang mô hình domain-driven design (DDD).
---

# Refactor DDD - Chuyển đổi module sang mô hình domain-driven design (DDD)

## Ranh giới (Boundaries)

- ĐƯỢC: đọc code, sửa code (đối với các module được chỉ định để refactor), chạy app trên local, viết test, chạy test, fix lại nếu lỗi, làm việc với database local/test (đối với MSSQL là 10.30.0.18, đối với MongoDB là localhost).
- KHÔNG ĐƯỢC: sửa các các biến môi trường, làm việc với các database production trực tiếp, không truncate, không xóa dữ liệu trực tiếp trên production.
- Log, stack trace

## Bước 1 - Xác định các module và ranh giới của chúng

- Đọc TypeORM Entity (MSSQL) để hiểu cấu trúc dữ liệu hiện tại
- Đọc Schema MongoDB để hiểu cấu trúc dữ liệu hiện tại, đây sẽ là database chính (primary database)
- Đọc Service cũ hiện tại để hiểu các chức năng và nghiệp vụ
- Xác định các Entity model (Aggregate Root) và các Value Object liên quan

## Bước 2 - Viết code triển khai theo mô hình DDD (Domain-Driven Design)

- Sau khi đã xác định được logic nghiệp vụ, tiến hành tách Service hiện tại dùng TypeORM sang CQRS (Command - Query Responsibility Segregation) nhưng sử dụng MongoDB làm database chính. Lưu ý rằng các query chỉ đọc từ secondary node của MongoDB (đã thiết lập sẵn Replica Set)
- Viết các Domain Entity (Aggregate Root và các Value Object liên quan) dựa trên cấu trúc dữ liệu hiện tại và logic nghiệp vụ đã xác định.
- Viết thêm các Repository để thao tác với MongoDB dựa trên các Domain Entity đã xác định.
- Viết thêm các Exception Filter để xử lý Domain Exception và các lỗi liên quan đến nghiệp vụ trong CQRS. Các route handler thực thi command/query cần xử lý logic nghiệp vụ sẽ sử dụng các Exception Filter này để trả về response phù hợp. Lưu ý rằng, hệ thống đang sử dụng đa ngôn ngữ, do đó các exception message cần được khai báo vào các file json thuộc các language pack [vi, en, cn] trong folder [i18n](../../../src/i18n/) tương ứng.
- Mỗi command đã được execute thành công, domain event được phát đi, cần đảm bảo insert/update/delete tương ứng trên MSSQL để giữ dữ liệu đồng bộ giữa MongoDB và MSSQL thông qua Saga của `@nestjs/cqrs`. Các command mà Saga thực thi sẽ sử dụng `@nestjs/bullmq` để xử lý queue.
- Sau khi refactor tách service hiện tại sang CQRS, cần đảm bảo các command và query được triển khai đúng theo ranh giới của domain và các aggregate root đã xác định. Đồng thời thay thế Service cũ đã được inject vào controller và execute bằng Command/Query bus với các command và query mới.
- Đối với các module đã import Service từ module cũ, cần thay thế bằng Repository (Nếu nơi đang thao tác trực tiếp với database) hoặc Command/Query tương ứng (Nếu nơi đang thao tác với nghiệp vụ) theo mô hình DDD.
- Service cũ sẽ được đưa vào trạng thái legacy, gỡ khỏi providers được khai báo trong module, đồng thời chỉ còn phục vụ các trường hợp đặc biệt hoặc các chức năng chưa được refactor sang CQRS, đồng thời loại bỏ khỏi provider của module và không được inject vào các controller mới.
- Viết thêm 1 file CHANGELOG.md để ghi lại các thay đổi quan trọng sau khi refactor (Command/Query mới tương ứng với method nào trong Service cũ)
- Viết thêm các CDC handler để bắt sự thay đổi dữ liệu từ MSSQL và đồng bộ lại vào MongoDB

## Bước 3 - Test

- Cập nhật lại Postman mới nếu có thay đổi về API endpoints hoặc request/response structure.
- Chạy test API qua Postman, xem dữ liệu trả về có đúng như mong đợi không.
