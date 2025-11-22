# 次品管理表规格说明 (Đặc tả bảng Quản lý hàng lỗi)

## 📋 表基本信息 (Thông tin cơ bản)

| 项目 (Mục)             | 值 (Giá trị)                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **数据库 (Database)**  | `DV_DATA_LAKE`                                                                                                             |
| **架构 (Schema)**      | `dbo`                                                                                                                      |
| **表名 (Table name)**  | `dv_defective_goods`                                                                                                       |
| **主键 (Primary Key)** | `keyid`                                                                                                                    |
| **说明 (Mô tả)**       | 次品管理表，包括B级品、C级品和研发样品 (Bảng quản lý hàng lỗi, bao gồm hàng Grade B, Grade C và mẫu nghiên cứu phát triển) |

---

## 📊 字段说明 (Mô tả các cột)

### 🔑 基础字段 (Các cột cơ sở - từ BaseAbstractEntity)

| 字段名<br/>Tên cột  | 数据类型<br/>Kiểu dữ liệu | 长度<br/>Độ dài | 允许空值<br/>Cho phép NULL | 默认值<br/>Giá trị mặc định | 说明 (中文)<br/>Mô tả (Tiếng Việt)            |
| ------------------- | ------------------------- | --------------- | -------------------------- | --------------------------- | --------------------------------------------- |
| `keyid`             | `int`                     | -               | ❌ No                      | `IDENTITY(1,1)`             | 主键，自增ID<br/>Khóa chính, ID tự tăng       |
| `user_code_created` | `nvarchar`                | 10              | ✅ Yes                     | -                           | 创建用户代码<br/>Mã người tạo                 |
| `created`           | `datetime`                | -               | ❌ No                      | `GETDATE()`                 | 创建时间<br/>Thời gian tạo                    |
| `user_code_updated` | `nvarchar`                | 10              | ✅ Yes                     | -                           | 更新用户代码<br/>Mã người cập nhật            |
| `updated`           | `datetime`                | -               | ✅ Yes                     | -                           | 更新时间<br/>Thời gian cập nhật               |
| `isactive`          | `char`                    | 1               | ❌ No                      | `'Y'`                       | 是否启用 (Y/N)<br/>Trạng thái hoạt động (Y/N) |

---

### 📦 产品信息字段 (Thông tin sản phẩm)

| 字段名<br/>Tên cột    | 数据类型<br/>Kiểu dữ liệu | 长度<br/>Độ dài | 允许空值<br/>Cho phép NULL | 说明 (中文)<br/>Mô tả (Tiếng Việt)                                             |
| --------------------- | ------------------------- | --------------- | -------------------------- | ------------------------------------------------------------------------------ |
| `epc`                 | `nvarchar`                | 30              | ❌ No                      | 电子产品代码，用于识别次品<br/>Mã điện tử sản phẩm (EPC) để nhận diện hàng lỗi |
| `brand_name`          | `nvarchar`                | 30              | ❌ No                      | 客户品牌名称<br/>Tên thương hiệu khách hàng                                    |
| `mo_no`               | `nvarchar`                | 20              | ✅ Yes                     | 制造订单号（仅B级品需要）<br/>Số lệnh sản xuất (chỉ bắt buộc với Grade B)      |
| `po`                  | `nvarchar`                | 20              | ✅ Yes                     | 采购订单号（仅B级品需要）<br/>Số đơn hàng (chỉ bắt buộc với Grade B)           |
| `cust_shoes_style`    | `nvarchar`                | 30              | ❌ No                      | 客户鞋款编号<br/>Mã kiểu dáng giày của khách hàng                              |
| `factory_shoes_style` | `nvarchar`                | 30              | ❌ No                      | 工厂鞋款编号<br/>Mã kiểu dáng giày của nhà máy                                 |
| `color_sn`            | `nvarchar`                | 10              | ❌ No                      | 颜色编号<br/>Mã màu sắc                                                        |
| `size_code`           | `nvarchar`                | 5               | ❌ No                      | 尺码<br/>Size giày                                                             |

---

### 🔍 次品分类信息 (Thông tin phân loại hàng lỗi)

| 字段名<br/>Tên cột      | 数据类型<br/>Kiểu dữ liệu | 长度<br/>Độ dài | 允许空值<br/>Cho phép NULL | 枚举值<br/>Giá trị Enum | 说明 (中文)<br/>Mô tả (Tiếng Việt)                                                                                                                                                                 |
| ----------------------- | ------------------------- | --------------- | -------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defective_category`    | `nvarchar`                | 2               | ❌ No                      | `B`, `C`, `RD`          | **次品类别：**<br/>• `B` = B级品<br/>• `C` = C级品<br/>• `RD` = 研发样品<br/><br/>**Phân loại hàng lỗi:**<br/>• `B` = Hàng Grade B<br/>• `C` = Hàng Grade C<br/>• `RD` = Mẫu nghiên cứu phát triển |
| `defective_location`    | `nvarchar`                | 1               | ❌ No                      | `A`, `B`, `C`, `D`      | **缺陷位置：**<br/>• `A` = 全部<br/>• `B` = 鞋面<br/>• `C` = 鞋底<br/>• `D` = 其他<br/><br/>**Vị trí lỗi:**<br/>• `A` = Toàn bộ<br/>• `B` = Mặt trên giày<br/>• `C` = Đế giày<br/>• `D` = Khác     |
| `defective_description` | `text`                    | -               | ❌ No                      | -                       | 缺陷描述（编辑器原始文本，不要手动更新）<br/>Mô tả chi tiết lỗi (văn bản từ editor, không cập nhật thủ công)                                                                                       |

---

### 📍 仓储信息 (Thông tin kho bãi)

| 字段名<br/>Tên cột | 数据类型<br/>Kiểu dữ liệu | 长度<br/>Độ dài | 允许空值<br/>Cho phép NULL | 说明 (中文)<br/>Mô tả (Tiếng Việt)                                                                                                                                                     |
| ------------------ | ------------------------- | --------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage_location` | `nvarchar`                | 10              | ✅ Yes                     | 存储位置，次品存放的仓库位置<br/>Vị trí lưu kho nơi hàng lỗi được cất giữ                                                                                                              |
| `inbound_date`     | `datetime`                | -               | ✅ Yes                     | 入库日期，次品入库到仓库的日期<br/>Ngày nhập kho hàng lỗi vào kho                                                                                                                      |
| `outbound_date`    | `datetime`                | -               | ✅ Yes                     | 出库日期，次品从仓库出库的日期<br/>Ngày xuất kho hàng lỗi ra khỏi kho                                                                                                                  |
| `outbound_purpose` | `nvarchar`                | 20              | ✅ Yes                     | **出库目的：**<br/>• `SELL` = 销售<br/>• `GIVEAWAY` = 赠送<br/>• `RECYCLE` = 回收<br/><br/>**Mục đích xuất kho:**<br/>• `SELL` = Bán<br/>• `GIVEAWAY` = Tặng<br/>• `RECYCLE` = Tái chế |

---

## 🔗 关系和约束 (Ràng buộc và quan hệ)

### 主键约束 (Primary Key Constraint)

```sql
CONSTRAINT PK_dv_defective_goods PRIMARY KEY (keyid)
```

### 字段约束说明 (Business Rules)

1. **次品类别 B 的特殊规则 (Quy tắc đặc biệt cho Grade B):**

   - 当 `defective_category = 'B'` 时，`mo_no` 和 `po` 字段**必须填写**
   - Khi `defective_category = 'B'`, các trường `mo_no` và `po` là **bắt buộc**

2. **EPC 唯一性 (Tính duy nhất của EPC):**

   - `epc` 应该是唯一的，用于追踪每个次品
   - `epc` nên là duy nhất để theo dõi từng sản phẩm lỗi

3. **出库逻辑 (Logic xuất kho):**
   - 当填写 `outbound_date` 时，应同时填写 `outbound_purpose`
   - Khi điền `outbound_date`, nên điền cả `outbound_purpose`

---

## 📝 使用示例 (Ví dụ sử dụng)

### 插入 B 级品记录 (Thêm bản ghi Grade B)

```sql
INSERT INTO DV_DATA_LAKE.dbo.dv_defective_goods (
    epc, brand_name, mo_no, po,
    cust_shoes_style, factory_shoes_style,
    color_sn, size_code,
    defective_category, defective_location,
    defective_description,
    inbound_date, storage_location,
    user_code_created, isactive
) VALUES (
    'EPC001234567890',           -- EPC码 / Mã EPC
    'NIKE',                      -- 品牌 / Thương hiệu
    'TVA2411001',                -- 制造订单 / Lệnh sản xuất
    'PO-2024-001',               -- 采购订单 / Đơn hàng
    'AIR-MAX-90',                -- 客户鞋款 / Mã giày khách hàng
    'TV-AM90-001',               -- 工厂鞋款 / Mã giày nhà máy
    'BLACK',                     -- 颜色 / Màu
    '42',                        -- 尺码 / Size
    'B',                         -- B级品 / Grade B
    'B',                         -- 鞋面缺陷 / Lỗi mặt giày
    '鞋面有轻微划痕',             -- 缺陷描述 / Mô tả lỗi
    GETDATE(),                   -- 入库日期 / Ngày nhập
    'A-01-05',                   -- 存储位置 / Vị trí kho
    'USER001',                   -- 创建用户 / Người tạo
    'Y'                          -- 启用 / Kích hoạt
)
```

### 查询库存次品 (Truy vấn hàng lỗi trong kho)

```sql
-- 查询所有在库的B级品 / Truy vấn tất cả Grade B còn trong kho
SELECT
    epc,
    brand_name,
    factory_shoes_style,
    color_sn,
    size_code,
    storage_location,
    inbound_date,
    DATEDIFF(DAY, inbound_date, GETDATE()) AS days_in_storage
FROM DV_DATA_LAKE.dbo.dv_defective_goods
WHERE defective_category = 'B'
  AND outbound_date IS NULL
  AND isactive = 'Y'
ORDER BY inbound_date DESC
```

### 出库记录 (Ghi nhận xuất kho)

```sql
-- 记录次品出库 / Cập nhật xuất kho hàng lỗi
UPDATE DV_DATA_LAKE.dbo.dv_defective_goods
SET
    outbound_date = GETDATE(),
    outbound_purpose = 'SELL',
    user_code_updated = 'USER002'
WHERE epc = 'EPC001234567890'
  AND outbound_date IS NULL
```

---

## 📊 统计查询示例 (Ví dụ truy vấn thống kê)

### 按品牌统计次品数量 (Thống kê số lượng theo thương hiệu)

```sql
SELECT
    brand_name AS 品牌名称,
    defective_category AS 次品类别,
    COUNT(*) AS 数量,
    COUNT(CASE WHEN outbound_date IS NULL THEN 1 END) AS 在库数量,
    COUNT(CASE WHEN outbound_date IS NOT NULL THEN 1 END) AS 已出库数量
FROM DV_DATA_LAKE.dbo.dv_defective_goods
WHERE isactive = 'Y'
GROUP BY brand_name, defective_category
ORDER BY brand_name, defective_category
```

### 按缺陷位置统计 (Thống kê theo vị trí lỗi)

```sql
SELECT
    defective_location AS 缺陷位置,
    CASE defective_location
        WHEN 'A' THEN '全部 / Toàn bộ'
        WHEN 'B' THEN '鞋面 / Mặt giày'
        WHEN 'C' THEN '鞋底 / Đế giày'
        WHEN 'D' THEN '其他 / Khác'
    END AS 位置说明,
    COUNT(*) AS 数量
FROM DV_DATA_LAKE.dbo.dv_defective_goods
WHERE isactive = 'Y'
  AND outbound_date IS NULL
GROUP BY defective_location
ORDER BY COUNT(*) DESC
```

---

## ⚠️ 注意事项 (Lưu ý quan trọng)

### 中文 (Tiếng Trung)

1. **EPC码管理**：每个次品必须有唯一的EPC码，用于追踪和管理
2. **B级品要求**：B级品必须填写完整的 `mo_no` 和 `po` 信息
3. **缺陷描述**：该字段由前端编辑器生成，不应手动编辑原始文本
4. **出库流程**：出库时必须同时记录出库日期和出库目的
5. **数据一致性**：删除操作应使用软删除（设置 `isactive = 'N'`），而非物理删除

### Tiếng Việt

1. **Quản lý mã EPC**: Mỗi sản phẩm lỗi phải có mã EPC duy nhất để theo dõi và quản lý
2. **Yêu cầu Grade B**: Hàng Grade B bắt buộc phải điền đầy đủ thông tin `mo_no` và `po`
3. **Mô tả lỗi**: Trường này được tạo bởi editor từ frontend, không nên chỉnh sửa thủ công
4. **Quy trình xuất kho**: Khi xuất kho phải ghi nhận cả ngày xuất và mục đích xuất
5. **Tính nhất quán dữ liệu**: Thao tác xóa nên sử dụng soft delete (đặt `isactive = 'N'`), không xóa vật lý

---

## 🔄 版本历史 (Lịch sử phiên bản)

| 版本<br/>Version | 日期<br/>Ngày | 说明<br/>Mô tả                                                             |
| ---------------- | ------------- | -------------------------------------------------------------------------- |
| 1.0              | 2025-01-14    | 初始版本，创建次品管理表<br/>Phiên bản đầu tiên, tạo bảng quản lý hàng lỗi |

---

**文档创建日期 (Ngày tạo tài liệu):** 2025-11-22  
**最后更新 (Cập nhật cuối):** 2025-11-22
**维护者 (Người bảo trì):** quanghiep03198 (阿侠)
