# Tài liệu Quy trình Git cho Dự án Chuẩn

Hướng dẫn này trình bày quy trình làm việc với Git được khuyến nghị nhằm đảm bảo sự hợp tác hiệu quả và tổ chức trong các dự án phần mềm.

## 1. Cấu trúc Repository

- **main**: Nhánh ổn định, sẵn sàng cho sản xuất.
- **develop**: Nhánh tích hợp các tính năng và sửa lỗi.
- **feature/\***: Nhánh phát triển tính năng mới.
- **bugfix/\***: Nhánh sửa lỗi.
- **release/\***: Nhánh chuẩn bị cho các bản phát hành mới.
- **hotfix/\***: Nhánh sửa lỗi nghiêm trọng trên môi trường sản xuất.

## 2. Các Bước Quy trình

### 2.1. Sao chép Repository (Clone)

```bash
git clone <repository-url>
```

### 2.2. Tạo Nhánh Mới

Tạo nhánh mới từ `develop` để phát triển tính năng hoặc sửa lỗi:

```bash
git checkout develop
git pull
git checkout -b feature/<ten-tinh-nang>
```

### 2.3. Làm Việc Trên Nhánh

Thực hiện các thay đổi, commit thường xuyên với thông điệp rõ ràng:

```bash
git add .
git commit -m "Mô tả ngắn gọn thay đổi"
```

### 2.4. Đồng Bộ với Nhánh Gốc

Luôn cập nhật nhánh của bạn với nhánh `develop` mới nhất:

```bash
git fetch origin
git rebase origin/develop
```

### 2.5. Tạo Pull Request (PR)

Sau khi hoàn thành, đẩy nhánh lên remote và tạo PR để hợp nhất vào `develop`:

```bash
git push origin feature/<ten-tinh-nang>
```

Tạo PR trên GitHub/GitLab và chờ review.

### 2.6. Kiểm Tra & Review Code

- Thành viên khác kiểm tra, nhận xét và phê duyệt PR.
- Sửa đổi nếu cần thiết theo phản hồi.

### 2.7. Hợp Nhất (Merge) & Xóa Nhánh

Sau khi PR được duyệt, hợp nhất vào `develop` và xóa nhánh đã hoàn thành:

```bash
git checkout develop
git pull
git branch -d feature/<ten-tinh-nang>
git push origin --delete feature/<ten-tinh-nang>
```

### 2.8. Quy trình Release & Hotfix

- Tạo nhánh `release/<version>` từ `develop` để chuẩn bị phát hành.
- Tạo nhánh `hotfix/<ten-hotfix>` từ `main` để sửa lỗi khẩn cấp trên môi trường sản xuất.
- Sau khi hoàn thành, hợp nhất vào cả `main` và `develop`.
- Tag phiên bản mới trên `main`.

### 2.9. Quy tắc Đặt Tên Nhánh

- `feature/<ten-tinh-nang>`
- `bugfix/<ten-bug>`
- `release/<version>`
- `hotfix/<ten-hotfix>`
- Sử dụng tiếng Anh, viết thường, nối bằng dấu gạch ngang.

### 2.10. Lưu ý

- Không commit trực tiếp lên `main` hoặc `develop`.
- Luôn viết thông điệp commit rõ ràng, ngắn gọn.
- Thường xuyên đồng bộ nhánh cá nhân với nhánh chính.
- Kiểm tra kỹ trước khi merge hoặc release.
