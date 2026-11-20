# Tên dự án

Backend WMS - Warehouse Management System

## 1. Tổng quan

Dự án quản lý kho hàng backend, giúp theo dõi tồn kho, đơn hàng và các hoạt động liên quan đến kho.

## 2. Tech stack

NestJS, Fastify, MongoDB, MSSQL, Redis, BullMQ, Prometheus, Grafana

## 3. Cấu trúc thư mục

- `.github/`: các file cấu hình GitHub, bao gồm workflow và copilot instructions
- `log`: các file log của dự án
- `migrations/`: các file migration của cơ sở dữ liệu
- `postman`: các file cấu hình và collection của Postman
- `scripts/`: các script tiện ích dump và restore MongoDB
- `src/`: mã nguồn chính của dự án
- `test/`: các file test của dự án

## 4. Lệnh thường dùng

- Cài đặt: `pnpm install`
- Chạy dev: `pnpm dev`
- Test: `pnpm test`
- Lint/typecheck: `pnpm lint && pnpm typecheck`

## 5. Quy ước code

- TypeScript strict, không dùng `any`
- Đặt tên file: kebab-case; class: PascalCase
- Mỗi module NestJS phần lớn được triển khai theo mô hình Domain-Driven Design
- Các module nên tách biệt rõ ràng giữa domain logic và infrastructure
- Không để business logic trong controller
- Sử dụng repository pattern cho các thao tác với cơ sở dữ liệu

## 6. Quy tắc quan trọng

**Nên làm:**

- Viết test cho logic mới
- Dùng DTO + validation cho mọi endpoint

**Không được làm:**

- Không sửa các file migration cũ
- Không commit file `.env`
- Không thêm thư viện mới khi chưa hỏi

## 7. Quy trình làm việc

- Đọc code liên quan trước khi sửa
- Sau khi sửa phải chạy typecheck và test
- Luôn cập nhật Postman collection nếu có thay đổi API
- Trước khi merge, luôn chạy typecheck và test để đảm bảo không phá vỡ chức năng hiện có
- Commit message theo Conventional Commits

## 8. Lưu ý đặc biệt / bẫy thường gặp

- Không được ghi vào các database MSSQ production như `TENANT 19`, `TENANT 21`, `TENANT 80.2`, `TENANT 201.202`, `TENANT 5.1`
- Được phép ghi vào database MSSQL test là `TENANT 18`
- Với MongoDB chỉ dùng local, không ghi vào môi trường production
