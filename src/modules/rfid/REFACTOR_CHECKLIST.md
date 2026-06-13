# REFACTOR CHECK LIST

### PHASE 1 - Migrate dữ liệu

<table>
   <thead>
      <tr>
         <th>-</th>
         <th>Task</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td><input type="checkbox"></td>
         <td>
            Tạo 1 collection mới là <code>inventory_epcs</code>. Collection này sẽ gom hết dữ liệu từ <code>epcs_inbound</code> và <code>epcs_outbound</code>  vào làm 1 để quản lý trạng thái vào ra kho của tem
         </td>
      </tr>
      <tr>
         <td><input type="checkbox"></td>
         <td>
            Fix API đọc dữ liệu xuất nhập từ collection <code>inventory_epcs</code> theo <b>inbound_device_sn<b>
            <ul style="font-weight: 500">
               <li>/rfid/inbound/sse/:device_sn</li>
               <li>/rfid/inbound/fetch-epc/:device_sn</li>
               <li>/rfid/inbound/fetch-epc/manufacturing-order-detail/:device_sn</li>
            </ul>
         </td>
      </tr>
      <tr>
         <td><input type="checkbox"></td>
         <td>
            Fix API đọc dữ liệu xuất nhập từ collection <code>inventory_epcs</code> theo <b>outbound_device_sn</b>
         </td>
      </tr>
   </tbody>
</table>
