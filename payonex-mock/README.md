# PayoneX Mock API Server

Mock server จำลอง PayoneX Payment Gateway API ใช้สำหรับ integration testing โดยไม่ต้องเชื่อมต่อ API จริง

## Setup

```bash
npm install
npm start          # หรือ npm run dev สำหรับ auto-reload
```

Server จะรันที่ port **3101** (เปลี่ยนได้ผ่าน environment variable `PORT`)

---

## Credentials (Mock)

| Field      | Value                                  |
|------------|----------------------------------------|
| accessKey  | `aa6f90f9-c5c9-4cb5-ac59-b502f80d89e6` |
| secretKey  | `777cb628-a875-4e66-b197-c5416a51bf35` |

Token มีอายุ **24 ชั่วโมง**

---

## Endpoints

### 1. Authentication

**POST** `/authenticate`

```json
{
  "accessKey": "aa6f90f9-c5c9-4cb5-ac59-b502f80d89e6",
  "secretKey": "777cb628-a875-4e66-b197-c5416a51bf35"
}
```

Response:
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": { "token": "<token>" }
}
```

---

### 2. Customers

ใช้ `Authorization: Bearer <token>` ทุก request

**POST** `/v2/customers` — สร้าง customer
```json
{ "name": "น.ส. มะลิดา กิ่งเมือง", "bankCode": "KBANK", "accountNo": "2041057028" }
```

**PUT** `/customers/:uuid/status` — อัปเดตสถานะ customer
```json
{ "status": "SUCCESS" }   // หรือ "BLOCK"
```

**PUT** `/v2/customers/:uuid` — อัปเดตข้อมูลบัญชี
```json
{ "name": "...", "bankCode": "SCB", "accountNo": "..." }
```

**GET** `/customers/options/bank-codes` — รายการ bank code (ไม่ต้อง auth)

---

### 3. Merchant

**GET** `/profile/balance` — ยอดเงินคงเหลือ

**PUT** `/profile/settings` — ตั้งค่า min/max
```json
{ "minDeposit": 100, "maxWithdraw": 200000 }
```

---

### 4. Transactions

**GET** `/transactions?page=1&size=10&filter=` — รายการ transaction

**GET** `/transactions/:uuid` — ดู transaction

**PUT** `/transactions/:uuid/status` — อัปเดตสถานะ (สำหรับ ON_HOLD)
```json
{ "status": "SUCCESS" }   // หรือ "REJECTED"
```

**POST** `/transactions/:uuid/refund` — คืนเงิน (สำหรับ REJECTED)

**POST** `/transactions/deposit/request` — สร้าง Payin (ฝากเงิน)
```json
{ "customerUuid": "<uuid>", "amount": 500, "referenceId": "...", "note": "", "remark": "", "callbackUrl": "https://your-app.com/payonex/webhook" }
```
→ Returns: `{ uuid, link, qrCode, qrBase64 }`  
→ เปิด link ใน browser เพื่อ simulate การยืนยันการโอน

พฤติกรรม Mock สำหรับ deposit:
- ระบบจะตอบ `uuid` ทันที แล้วรอ 5 วินาที (ตั้งค่าได้ด้วย `PAYONEX_DEPOSIT_WEBHOOK_DELAY_MS`)
- ครบเวลาแล้วเปลี่ยนสถานะเป็น `SUCCESS`
- ส่ง webhook callback อัตโนมัติไปที่ `callbackUrl` (ถ้าไม่ส่งใน body จะ fallback ไป `PAYONEX_WEBHOOK_URL`)
- ยังสามารถกดหน้า `/pay/:uuid/confirm` เพื่อ simulate manual confirm ได้ แต่ระบบกันการยืนยันซ้ำแล้ว

**POST** `/transactions/withdraw/request` — สร้าง Payout (ถอนเงิน)
```json
{ "customerUuid": "<uuid>", "amount": 800, "referenceId": "...", "note": "", "remark": "", "callbackUrl": "https://your-app.com/payonex/webhook" }
```

พฤติกรรม Mock สำหรับ withdraw:
- ระบบจะตอบ `uuid` ทันที
- รอ 5 วินาที (ตั้งค่าได้ด้วย `PAYONEX_WITHDRAW_WEBHOOK_DELAY_MS`)
- เปลี่ยนสถานะ transaction เป็น `SUCCESS`
- ส่ง webhook callback อัตโนมัติไปที่ `callbackUrl` (ถ้าไม่ส่งใน body จะ fallback ไป `PAYONEX_WEBHOOK_URL`)

**POST** `/transactions/upload-slip` — อัปโหลด slip
```json
{ "base64": "<base64 string>" }
```

---

### 5. Webhook Receiver

**POST** `/payonex/webhook` — รับ callback จาก PayoneX (ไม่ต้อง auth)
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "uuid": "...",
    "type": "deposit",
    "status": "SUCCESS",
    "amount": 500,
    ...
  }
}
```

---

## Mock Payment Page

เมื่อสร้าง deposit request จะได้ link เช่น:  
`http://localhost:3101/pay/<uuid>`

เปิดใน browser แล้วกดปุ่ม **"ยืนยันการโอน (Mock)"** เพื่อเปลี่ยน status เป็น `SUCCESS`

---

## Business Logic

| Rule | Value |
|------|-------|
| Fee (deposit) | 1.6% ของ amount |
| Fee (withdraw) | 0 |
| Token TTL | 24 ชั่วโมง |
| ยอดเริ่มต้น merchant | 100,000 THB |
| Min deposit (default) | 100 THB |
| Max withdraw (default) | 200,000 THB |
