# 整车配送管理表规格说明 (Đặc tả bảng Quản lý Giao hàng Trọn xe)

## 📋 表基本信息 (Thông tin cơ bản)

| 项目 (Mục)             | 值 (Giá trị)                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **数据库 (Database)**  | `DV_DATA_LAKE`                                                                                                                                              |
| **架构 (Schema)**      | `dbo`                                                                                                                                                       |
| **表名 (Table name)**  | `dv_truckload_delivery`                                                                                                                                     |
| **主键 (Primary Key)** | `keyid`                                                                                                                                                     |
| **说明 (Mô tả)**       | 整车配送管理表，用于追踪和管理从工厂发出的整车货物运输 (Bảng quản lý giao hàng trọn xe, dùng để theo dõi và quản lý vận chuyển hàng hóa bằng xe từ nhà máy) |

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

### 📦 配送单信息 (Thông tin đơn giao hàng)

| 字段名<br/>Tên cột | 数据类型<br/>Kiểu dữ liệu | 长度<br/>Độ dài | 允许空值<br/>Cho phép NULL | 索引<br/>Index | 说明 (中文)<br/>Mô tả (Tiếng Việt)                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------- | --------------- | -------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatch_order`   | `nvarchar`                | 50              | ❌ No                      | ✅ Yes         | **配送单号**<br/>格式：`FACTORY_CODE-EXP-YYYYMMDD-XXX`<br/>• `FACTORY_CODE`: 工厂代码 (VA1, VB1, VB2, CA1)<br/>• `EXP`: Export（出口）<br/>• `YYYYMMDD`: 创建日期<br/>• `XXX`: 当天序号（001-999）<br/><br/>**Mã đơn giao hàng**<br/>Định dạng: `FACTORY_CODE-EXP-YYYYMMDD-XXX`<br/>• `FACTORY_CODE`: Mã nhà máy (VA1, VB1, VB2, CA1)<br/>• `EXP`: Export (Xuất khẩu)<br/>• `YYYYMMDD`: Ngày tạo<br/>• `XXX`: Số thứ tự trong ngày (001-999) |
| `factory_code`     | `nvarchar`                | 10              | ❌ No                      | ❌ No          | 工厂代码（发货工厂）<br/>Mã nhà máy (nhà máy xuất hàng)                                                                                                                                                                                                                                                                                                                                                                                      |
| `po`               | `nvarchar`                | 20              | ❌ No                      | ✅ Yes         | 采购订单号<br/>Số đơn đặt hàng (Purchase Order)                                                                                                                                                                                                                                                                                                                                                                                              |
| `outbound_qty`     | `int`                     | -               | ❌ No                      | ❌ No          | 本次配送的出库数量<br/>Số lượng xuất kho trong lần giao hàng này                                                                                                                                                                                                                                                                                                                                                                             |

---

### 🚚 运输信息 (Thông tin vận chuyển)

| 字段名<br/>Tên cột       | 数据类型<br/>Kiểu dữ liệu | 长度<br/>Độ dài | 允许空值<br/>Cho phép NULL | 说明 (中文)<br/>Mô tả (Tiếng Việt)                |
| ------------------------ | ------------------------- | --------------- | -------------------------- | ------------------------------------------------- |
| `license_plate`          | `nvarchar`                | 50              | ✅ Yes                     | 车辆牌照号码<br/>Biển số xe vận chuyển            |
| `container_number`       | `nvarchar`                | 50              | ✅ Yes                     | 集装箱编号<br/>Số container                       |
| `factory_departure_time` | `datetime`                | -               | ✅ Yes                     | 从工厂出发时间<br/>Thời gian xuất phát từ nhà máy |

---

### 📋 状态管理 (Quản lý trạng thái)

| 字段名<br/>Tên cột | 数据类型<br/>Kiểu dữ liệu | 长度<br/>Độ dài | 允许空值<br/>Cho phép NULL | 默认值<br/>Mặc định | 枚举值<br/>Giá trị Enum                  | 说明 (中文)<br/>Mô tả (Tiếng Việt)                                                                                                                                                                                                               |
| ------------------ | ------------------------- | --------------- | -------------------------- | ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`           | `nvarchar`                | 20              | ❌ No                      | `'pending'`         | `pending`, `confirmed`, `request_change` | **配送状态：**<br/>• `pending` = 待确认<br/>• `confirmed` = 已确认<br/>• `request_change` = 请求变更<br/><br/>**Trạng thái giao hàng:**<br/>• `pending` = Chờ xác nhận<br/>• `confirmed` = Đã xác nhận<br/>• `request_change` = Yêu cầu thay đổi |

---

## 🔗 关系和约束 (Ràng buộc và quan hệ)

### 主键约束 (Primary Key Constraint)

```sql
CONSTRAINT PK_dv_truckload_delivery PRIMARY KEY (keyid)
```

### 索引 (Indexes)

```sql
-- 配送单号索引 / Index cho mã đơn giao hàng
CREATE INDEX IDX_dispatch_order
ON DV_DATA_LAKE.dbo.dv_truckload_delivery(dispatch_order)

-- 采购订单号索引 / Index cho số đơn hàng
CREATE INDEX IDX_truckload_delivery_po
ON DV_DATA_LAKE.dbo.dv_truckload_delivery(po)
```

### 字段约束说明 (Business Rules)

1. **配送单号唯一性 (Tính duy nhất mã đơn giao hàng):**

   - `dispatch_order` 应该是唯一的，每天按工厂自动生成
   - `dispatch_order` nên là duy nhất, được tự động tạo theo từng nhà máy mỗi ngày

2. **状态流转规则 (Quy tắc chuyển trạng thái):**

   - `pending` → `confirmed`: 正常确认流程
   - `pending` → `request_change`: 需要修改配送信息
   - `confirmed` → `request_change`: 已确认后需要变更
   - Không thể chuyển trực tiếp từ `request_change` sang `confirmed` mà không xử lý

3. **运输信息完整性 (Tính toàn vẹn thông tin vận chuyển):**

   - 当状态为 `confirmed` 时，建议填写完整的运输信息
   - Khi trạng thái là `confirmed`, nên điền đầy đủ thông tin vận chuyển

4. **数量验证 (Xác thực số lượng):**
   - `outbound_qty` 必须大于 0
   - `outbound_qty` phải lớn hơn 0

---

## 📝 使用示例 (Ví dụ sử dụng)

### 创建新的配送单 (Tạo đơn giao hàng mới)

```sql
INSERT INTO DV_DATA_LAKE.dbo.dv_truckload_delivery (
    dispatch_order, factory_code, po, outbound_qty,
    license_plate, container_number,
    factory_departure_time, status,
    user_code_created, isactive
) VALUES (
    'VA1-EXP-20251122-001',      -- 配送单号 / Mã đơn giao hàng
    'VA1',                        -- 工厂代码 / Mã nhà máy
    'PO-2024-001',                -- 采购订单 / Đơn hàng
    1000,                         -- 出库数量 / Số lượng xuất
    '59A-12345',                  -- 车牌号 / Biển số xe
    'CONT-2024-001',              -- 集装箱号 / Số container
    '2025-11-22 08:00:00',        -- 出发时间 / Giờ xuất phát
    'pending',                    -- 待确认状态 / Trạng thái chờ
    'USER001',                    -- 创建用户 / Người tạo
    'Y'                           -- 启用 / Kích hoạt
)
```

### 确认配送单 (Xác nhận đơn giao hàng)

```sql
-- 将配送单状态更新为已确认 / Cập nhật trạng thái đơn giao hàng sang đã xác nhận
UPDATE DV_DATA_LAKE.dbo.dv_truckload_delivery
SET
    status = 'confirmed',
    factory_departure_time = GETDATE(),
    user_code_updated = 'USER002',
    updated = GETDATE()
WHERE dispatch_order = 'VA1-EXP-20251122-001'
  AND status = 'pending'
```

### 查询待发货的配送单 (Truy vấn đơn hàng chờ giao)

```sql
-- 查询所有待确认的配送单 / Truy vấn tất cả đơn hàng chờ xác nhận
SELECT
    dispatch_order AS 配送单号,
    factory_code AS 工厂代码,
    po AS 采购订单,
    outbound_qty AS 出库数量,
    license_plate AS 车牌号,
    container_number AS 集装箱号,
    CASE status
        WHEN 'pending' THEN '待确认 / Chờ xác nhận'
        WHEN 'confirmed' THEN '已确认 / Đã xác nhận'
        WHEN 'request_change' THEN '请求变更 / Yêu cầu thay đổi'
    END AS 状态说明,
    created AS 创建时间
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery
WHERE status = 'pending'
  AND isactive = 'Y'
ORDER BY created DESC
```

### 查询配送单详情（含商品明细）(Truy vấn chi tiết đơn giao hàng với thông tin sản phẩm)

```sql
-- 使用CTE查询配送单及其商品明细 / Sử dụng CTE truy vấn đơn giao hàng và chi tiết sản phẩm
WITH delivery_details AS (
    SELECT
        a.dispatch_order,
        a.po,
        d.shoestyle_codefactory AS factory_shoes_style,
        c.color_sn,
        a.outbound_qty
    FROM DV_DATA_LAKE.dbo.dv_truckload_delivery a
    LEFT JOIN wuerp_vnrd.dbo.ta_ordermst b
        ON a.po = IIF(ISNULL(b.or_custpoone, '') = '', b.or_custpo, b.or_custpoone)
    LEFT JOIN wuerp_vnrd.dbo.ta_productmst c
        ON c.mat_code = b.mat_code
    LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst d
        ON d.shoestyle_systemcodefty = c.shoestyle_systemcodefty
)
SELECT
    a.dispatch_order AS 配送单号,
    a.factory_code AS 工厂代码,
    a.license_plate AS 车牌号,
    a.container_number AS 集装箱号,
    a.factory_departure_time AS 出发时间,
    a.status AS 状态,
    (
        SELECT dd.po, dd.factory_shoes_style, dd.color_sn, dd.outbound_qty
        FROM delivery_details dd
        WHERE dd.dispatch_order = a.dispatch_order
        FOR JSON PATH
    ) AS 商品明细
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery a
WHERE a.dispatch_order = 'VA1-EXP-20251122-001'
  AND a.isactive = 'Y'
```

---

## 📊 统计查询示例 (Ví dụ truy vấn thống kê)

### 按工厂统计配送量 (Thống kê số lượng giao hàng theo nhà máy)

```sql
SELECT
    factory_code AS 工厂代码,
    COUNT(*) AS 配送单数量,
    SUM(outbound_qty) AS 总出库数量,
    COUNT(CASE WHEN status = 'confirmed' THEN 1 END) AS 已确认数量,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) AS 待确认数量,
    COUNT(CASE WHEN status = 'request_change' THEN 1 END) AS 请求变更数量
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery
WHERE isactive = 'Y'
  AND created >= CAST(DATEADD(MONTH, -1, GETDATE()) AS DATE)
GROUP BY factory_code
ORDER BY SUM(outbound_qty) DESC
```

### 按日期统计配送趋势 (Thống kê xu hướng giao hàng theo ngày)

```sql
SELECT
    CAST(created AS DATE) AS 日期,
    COUNT(*) AS 配送单数量,
    SUM(outbound_qty) AS 总数量,
    AVG(CAST(outbound_qty AS FLOAT)) AS 平均数量,
    STRING_AGG(factory_code, ', ') AS 涉及工厂
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery
WHERE isactive = 'Y'
  AND created >= CAST(DATEADD(DAY, -7, GETDATE()) AS DATE)
GROUP BY CAST(created AS DATE)
ORDER BY CAST(created AS DATE) DESC
```

### 车辆利用率分析 (Phân tích tỷ lệ sử dụng xe)

```sql
SELECT
    license_plate AS 车牌号,
    COUNT(*) AS 配送次数,
    SUM(outbound_qty) AS 累计运输数量,
    AVG(CAST(outbound_qty AS FLOAT)) AS 平均装载量,
    MIN(factory_departure_time) AS 首次出发,
    MAX(factory_departure_time) AS 最近出发
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery
WHERE isactive = 'Y'
  AND license_plate IS NOT NULL
  AND factory_departure_time IS NOT NULL
GROUP BY license_plate
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, SUM(outbound_qty) DESC
```

### 配送单生成序号示例 (Ví dụ tạo số thứ tự đơn giao hàng)

```sql
-- 获取今日某工厂的下一个配送单号 / Lấy mã đơn giao hàng tiếp theo của nhà máy trong ngày
DECLARE @factory_code NVARCHAR(10) = 'VA1'
DECLARE @create_date NVARCHAR(8) = FORMAT(GETDATE(), 'yyyyMMdd')
DECLARE @count INT

SELECT @count = COUNT(*) + 1
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery
WHERE factory_code = @factory_code
  AND created >= CAST(GETDATE() AS DATE)
  AND created < CAST(DATEADD(DAY, 1, GETDATE()) AS DATE)

SELECT CONCAT(@factory_code, '-EXP-', @create_date, '-', RIGHT('000' + CAST(@count AS NVARCHAR), 3)) AS next_dispatch_order
-- 结果示例 / Ví dụ kết quả: VA1-EXP-20251122-001
```

---

## 🔄 工作流程 (Quy trình làm việc)

### 中文 (Tiếng Trung)

1. **创建配送单**: 用户创建新的配送单，状态为 `pending`
2. **填写信息**: 填写车辆信息、集装箱号等
3. **确认配送**: 确认配送信息无误后，更新状态为 `confirmed`
4. **发车**: 记录实际出发时间 `factory_departure_time`
5. **变更处理**: 如需变更，更新状态为 `request_change`，修改后再次确认

### Tiếng Việt

1. **Tạo đơn giao hàng**: Người dùng tạo đơn giao hàng mới, trạng thái `pending`
2. **Điền thông tin**: Điền thông tin xe, số container, v.v.
3. **Xác nhận giao hàng**: Sau khi kiểm tra thông tin, cập nhật trạng thái sang `confirmed`
4. **Xuất phát**: Ghi nhận thời gian xuất phát thực tế `factory_departure_time`
5. **Xử lý thay đổi**: Nếu cần thay đổi, cập nhật trạng thái sang `request_change`, sau khi sửa sẽ xác nhận lại

---

## ⚠️ 注意事项 (Lưu ý quan trọng)

### 中文 (Tiếng Trung)

1. **配送单号规则**: 严格按照 `FACTORY_CODE-EXP-YYYYMMDD-XXX` 格式生成
2. **工厂代码**: 必须是有效的工厂代码 (VA1, VB1, VB2, CA1)
3. **数量验证**: 出库数量必须与实际扫描的RFID标签数量一致
4. **车牌号格式**: 车牌号会自动转换为大写
5. **状态管理**: 只有 `pending` 状态的配送单才能被修改详细信息
6. **数据完整性**: 建议在确认前填写完整的运输信息
7. **软删除**: 删除操作使用软删除 (`isactive = 'N'`)，不进行物理删除
8. **时间记录**: 所有时间字段应使用服务器时间 `GETDATE()`

### Tiếng Việt

1. **Quy tắc mã đơn**: Tuân thủ nghiêm ngặt format `FACTORY_CODE-EXP-YYYYMMDD-XXX`
2. **Mã nhà máy**: Phải là mã nhà máy hợp lệ (VA1, VB1, VB2, CA1)
3. **Xác thực số lượng**: Số lượng xuất phải khớp với số thẻ RFID được quét thực tế
4. **Format biển số**: Biển số xe sẽ tự động chuyển sang chữ hoa
5. **Quản lý trạng thái**: Chỉ đơn hàng có trạng thái `pending` mới được sửa thông tin chi tiết
6. **Tính toàn vẹn dữ liệu**: Khuyến nghị điền đầy đủ thông tin vận chuyển trước khi xác nhận
7. **Soft delete**: Thao tác xóa sử dụng soft delete (`isactive = 'N'`), không xóa vật lý
8. **Ghi nhận thời gian**: Tất cả trường thời gian nên sử dụng `GETDATE()` của server

---

## 🔐 权限建议 (Khuyến nghị phân quyền)

| 角色<br/>Vai trò               | 创建<br/>Tạo | 查看<br/>Xem | 修改<br/>Sửa | 确认<br/>Xác nhận | 删除<br/>Xóa |
| ------------------------------ | ------------ | ------------ | ------------ | ----------------- | ------------ |
| **仓库管理员<br/>Quản lý kho** | ✅           | ✅           | ✅           | ✅                | ✅           |
| **仓库员工<br/>Nhân viên kho** | ✅           | ✅           | ✅           | ❌                | ❌           |
| **司机<br/>Tài xế**            | ❌           | ✅           | ❌           | ❌                | ❌           |
| **查看者<br/>Người xem**       | ❌           | ✅           | ❌           | ❌                | ❌           |

---

## 🔄 版本历史 (Lịch sử phiên bản)

| 版本<br/>Version | 日期<br/>Ngày | 说明<br/>Mô tả                                                                          |
| ---------------- | ------------- | --------------------------------------------------------------------------------------- |
| 1.0              | 2025-01-10    | 初始版本，创建整车配送管理表<br/>Phiên bản đầu tiên, tạo bảng quản lý giao hàng trọn xe |

---

**文档创建日期 (Ngày tạo tài liệu):** 2025-11-22  
**最后更新 (Cập nhật cuối):** 2025-11-22  
**维护者 (Người bảo trì):** quanghiep03198 (阿侠)
