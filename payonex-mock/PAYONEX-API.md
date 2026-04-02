# PayoneX API — คู่มือการใช้งาน (Local)

> 📌 Mock server จำลอง PayoneX Payment Gateway API  
> Base URL: `http://localhost:3101`  
> เอกสารนี้สร้างจาก source code + ผลทดสอบจริง

---

## 📑 สารบัญ

1. [Authentication](#1-authentication)
2. [Customers](#2-customers)
3. [Merchant Profile](#3-merchant-profile)
4. [Transactions](#4-transactions)
   - [4.1 Deposit (Payin)](#41-deposit-payin)
   - [4.2 Withdraw (Payout)](#42-withdraw-payout)
   - [4.3 รายการ Transactions](#43-รายการ-transactions)
   - [4.4 Transaction Status](#44-transaction-status)
   - [4.5 Refund](#45-refund)
   - [4.6 Upload Slip](#46-upload-slip)
5. [Webhook](#5-webhook)
6. [Mock Payment Page](#6-mock-payment-page)
7. [Error Codes](#7-error-codes)
8. [Business Logic](#8-business-logic)

---

## Credentials (Mock)

| Field       | Value                                  |
|-------------|----------------------------------------|
| accessKey   | `aa6f90f9-c5c9-4cb5-ac59-b502f80d89e6` |
| secretKey   | `777cb628-a875-4e66-b197-c5416a51bf35` |
| Token TTL   | 24 ชั่วโมง                             |

---

## 1. Authentication

### POST `/authenticate`

ขอ token เพื่อใช้กับ API ทุกตัว (ยกเว้น `/customers/options/bank-codes` และ `/payonex/webhook`)

**Headers**
```
Content-Type: application/json
```

**Request Body**
```json
{
  "accessKey": "aa6f90f9-c5c9-4cb5-ac59-b502f80d89e6",
  "secretKey": "777cb628-a875-4e66-b197-c5416a51bf35"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "token": "576ed4812afd4f15ace83e02b91175250e8dd9ce897b4cddbefd215e3cfe269b"
  }
}
```

**Error — Wrong Credentials (400)**
```json
{
  "success": false,
  "code": "40502",
  "data": "Credential not found"
}
```

**Error — Missing Fields (400)**
```json
{
  "success": false,
  "message": "accessKey and secretKey are required",
  "code": "40001"
}
```

---

## 2. Customers

ทุก request ต้องมี header:
```
Authorization: Bearer <token>
```

---

### POST `/v2/customers` — สร้าง Customer

**Request Body**
```json
{
  "name": "น.ส. มะลิดา กิ่งเมือง",
  "bankCode": "KBANK",
  "accountNo": "2041057028"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "partner": "PARTNER-MOCK",
    "customerUuid": "e5656d7a-73c5-4d97-85be-21f1f2dc7939",
    "clientCode": "CLIENT-MOCK",
    "name": "น.ส. มะลิดา กิ่งเมือง",
    "searchName": ["น.ส. มะลิดา กิ่งเมือง"],
    "accountNo": "2041057028",
    "bankCode": "KBANK",
    "status": "SUCCESS",
    "createdAt": 1775113426837,
    "updatedAt": 1775113426837
  }
}
```

**Error — Missing Fields (400)**
```json
{
  "success": false,
  "message": "Missing required fields: bankCode, accountNo",
  "code": "40001"
}
```

---

### PUT `/customers/:uuid/status` — อัปเดตสถานะ Customer

**Request Body**
```json
{
  "status": "BLOCK"
}
```
> ค่าที่รองรับ: `SUCCESS` | `BLOCK`

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "partner": "PARTNER-MOCK",
    "customerUuid": "64e43fc7-95ae-401f-851d-3aedf0cdf0cd",
    "clientCode": "CLIENT-MOCK",
    "name": "Test User",
    "searchName": ["Test User"],
    "accountNo": "9999999999",
    "bankCode": "SCB",
    "status": "BLOCK",
    "createdAt": 1775113482710,
    "updatedAt": 1775113482738
  }
}
```

---

### PUT `/v2/customers/:uuid` — อัปเดตข้อมูลบัญชี

**Request Body**
```json
{
  "name": "ชื่อใหม่",
  "bankCode": "SCB",
  "accountNo": "2222222222"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "partner": "PARTNER-MOCK",
    "customerUuid": "2d6acc73-e053-44f8-b43c-4d7347ad7c18",
    "clientCode": "CLIENT-MOCK",
    "name": "ชื่อใหม่",
    "searchName": ["ชื่อใหม่"],
    "accountNo": "2222222222",
    "bankCode": "SCB",
    "status": "SUCCESS",
    "createdAt": 1775113530029,
    "updatedAt": 1775113530060
  }
}
```

---

### GET `/customers/options/bank-codes` — รายการ Bank Code

> ⚠️ ไม่ต้องมี Authorization header

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": [
    { "bank_code": "KBANK", "bank_name_th": "ธนาคารกสิกรไทย",        "bank_name_en": "Kasikorn Bank" },
    { "bank_code": "SCB",   "bank_name_th": "ธนาคารไทยพาณิชย์",      "bank_name_en": "Siam Commercial Bank" },
    { "bank_code": "BBL",   "bank_name_th": "ธนาคารกรุงเทพ",          "bank_name_en": "Bangkok Bank" },
    { "bank_code": "KTB",   "bank_name_th": "ธนาคารกรุงไทย",          "bank_name_en": "Krungthai Bank" },
    { "bank_code": "BAY",   "bank_name_th": "ธนาคารกรุงศรีอยุธยา",    "bank_name_en": "Bank of Ayudhya" },
    { "bank_code": "TMB",   "bank_name_th": "ธนาคารทีเอ็มบีธนชาต",    "bank_name_en": "TMB Thanachart Bank" },
    { "bank_code": "GSB",   "bank_name_th": "ธนาคารออมสิน",           "bank_name_en": "Government Savings Bank" },
    { "bank_code": "BAAC",  "bank_name_th": "ธนาคารเพื่อการเกษตรฯ",  "bank_name_en": "Bank for Agriculture and Agricultural Cooperatives" },
    { "bank_code": "UOB",   "bank_name_th": "ธนาคารยูโอบี",           "bank_name_en": "United Overseas Bank" },
    { "bank_code": "CIMB",  "bank_name_th": "ธนาคารซีไอเอ็มบี ไทย", "bank_name_en": "CIMB Thai Bank" }
  ]
}
```

---

## 3. Merchant Profile

### GET `/profile/balance` — ยอดเงินคงเหลือ

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "balance": 100000.00,
    "settleBalance": 100000.00
  }
}
```

---

### PUT `/profile/settings` — ตั้งค่า Merchant

ส่งได้อย่างน้อย 1 field

**Request Body**
```json
{
  "minDeposit": 100,
  "maxWithdraw": 200000,
  "depositFee": 1.6,
  "withdrawFee": 0
}
```

> รองรับทั้ง camelCase และ snake_case:  
> `depositFee` = `deposit_fee` | `withdrawFee` = `withdraw_fee`

| Field        | ค่า default | ช่วงที่ยอมรับ     |
|--------------|------------|-------------------|
| minDeposit   | 100        | 20 – 1,000,000    |
| maxWithdraw  | 200,000    | 100 – 1,000,000   |
| depositFee   | 1.6%       | 0 – 100           |
| withdrawFee  | 0%         | 0 – 100           |

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "partner": "PARTNER-MOCK",
    "clientCode": "CLIENT-MOCK",
    "minDeposit": 100,
    "maxWithdraw": 200000,
    "depositFee": 1.6,
    "withdrawFee": 0
  }
}
```

---

## 4. Transactions

### 4.1 Deposit (Payin)

### POST `/transactions/deposit/request`

**Request Body**
```json
{
  "customerUuid": "e5656d7a-73c5-4d97-85be-21f1f2dc7939",
  "amount": 500,
  "referenceId": "REF-001",
  "note": "หมายเหตุ",
  "remark": "remark",
  "callbackUrl": "https://your-app.com/payonex/webhook"
}
```

> `referenceId`, `note`, `remark`, `callbackUrl` — optional

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "uuid": "da153ec7-8c34-4f56-9f01-c202d7197c96",
    "link": "https://api.payonex.asia/pay/da153ec7-8c34-4f56-9f01-c202d7197c96",
    "qrCode": "00020101021229370016A000000677010111011300666374052005802TH530376454075006304MOCK",
    "qrBase64": "data:image/png;base64,MOCK_QR_BASE64"
  }
}
```

**พฤติกรรม Mock:**
1. ตอบกลับทันที พร้อม `uuid`, `link`, `qrCode`
2. รอ **5 วินาที** (ตั้งค่าได้ด้วย `PAYONEX_DEPOSIT_WEBHOOK_DELAY_MS`)
3. อัปเดต status เป็น `SUCCESS`
4. ส่ง webhook ไปที่ `callbackUrl` (หรือ `PAYONEX_WEBHOOK_URL`)

**Transaction Status Flow:**
```
PROCESSING → SUCCESS
```

**Error — Amount below minimum (400)**
```json
{
  "success": false,
  "message": "Amount below minimum deposit of 100",
  "code": "40004"
}
```

**Error — Customer blocked (400)**
```json
{
  "success": false,
  "message": "Customer is blocked",
  "code": "40003"
}
```

---

### 4.2 Withdraw (Payout)

### POST `/transactions/withdraw/request`

**Request Body**
```json
{
  "customerUuid": "e5656d7a-73c5-4d97-85be-21f1f2dc7939",
  "amount": 800,
  "referenceId": "REF-WD-001",
  "note": "",
  "remark": "",
  "callbackUrl": "https://your-app.com/payonex/webhook"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "uuid": "ce5ae6c5-fced-40c4-a84f-3ddca653d0ba"
  }
}
```

**พฤติกรรม Mock:**
1. ตัดยอด merchant balance ทันที (`amount + fee`)
2. ตอบกลับ `uuid`
3. รอ **5 วินาที** (ตั้งค่าได้ด้วย `PAYONEX_WITHDRAW_WEBHOOK_DELAY_MS`)
4. อัปเดต status เป็น `SUCCESS`
5. ส่ง webhook ไปที่ `callbackUrl`

**Error — Exceed maxWithdraw (400)**
```json
{
  "success": false,
  "message": "Amount exceeds maximum withdraw of 200000",
  "code": "40005"
}
```

**Error — Insufficient balance (400)**
```json
{
  "success": false,
  "message": "Insufficient merchant balance",
  "code": "40006"
}
```

---

### 4.3 รายการ Transactions

### GET `/transactions?page=1&size=10&filter=`

| Query Param | Type   | Default | คำอธิบาย                                        |
|-------------|--------|---------|--------------------------------------------------|
| page        | int    | 1       | หน้าที่ต้องการ                                   |
| size        | int    | 10      | จำนวนต่อหน้า                                     |
| filter      | string | (ว่าง)  | กรองด้วย `type`, `status`, หรือ `customerUuid`  |

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "data": [
      {
        "id": 11,
        "uuid": "ce5ae6c5-fced-40c4-a84f-3ddca653d0ba",
        "partner": "PARTNER-MOCK",
        "customerUuid": "cdcfe860-fa7e-4d12-a617-9a864e133fd3",
        "clientCode": "CLIENT-MOCK",
        "type": "withdraw",
        "settlement": "FALSE",
        "reconcile": "FALSE",
        "qrCode": null,
        "status": "SUCCESS",
        "amount": 800,
        "currency": "THB",
        "settleAmount": 800,
        "settleCurrency": "THB",
        "fee": 0,
        "rate": 0,
        "referenceId": "REF-WD-001",
        "merchantOrderId": "5628E836F64B4C3E963E524D01D7042E",
        "platformOrderId": "b9427377-aad7-4808-899b-046a82b2f85e",
        "note": "",
        "remark": "",
        "createdAt": 1775113583827,
        "updatedAt": 1775113588829
      }
    ],
    "count": 11,
    "totalPages": 2
  }
}
```

---

### GET `/transactions/:uuid` — ดู Transaction

**Response (200 OK)**  
→ เหมือน object ใน array ด้านบน (ครบทุก field)

**Error — Not Found (400)**
```json
{
  "success": false,
  "message": "Transaction not found",
  "code": "40400"
}
```

---

### 4.4 Transaction Status

### PUT `/transactions/:uuid/status`

> ใช้สำหรับ transaction ที่มีสถานะ `ON_HOLD` เท่านั้น

**Request Body**
```json
{
  "status": "SUCCESS"
}
```
> ค่าที่รองรับ: `SUCCESS` | `REJECTED`

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "uuid": "...",
    "status": "SUCCESS",
    "updatedAt": 1775113600000
  }
}
```

**Error — ไม่ใช่ ON_HOLD (400)**
```json
{
  "success": false,
  "message": "Transaction is not in ON_HOLD status",
  "code": "40002"
}
```

---

### 4.5 Refund

### POST `/transactions/:uuid/refund`

> ใช้สำหรับ transaction ที่มีสถานะ `REJECTED` เท่านั้น

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "uuid": "...",
    "status": "REFUNDED",
    "refundInfo": {
      "accountNo": "2041057028",
      "bankCode": "KBANK",
      "bankName": {
        "bank_code": "KBANK",
        "bank_name_th": "ธนาคารกสิกรไทย",
        "bank_name_en": "Kasikorn Bank"
      }
    }
  }
}
```

**Error — ไม่ใช่ REJECTED (400)**
```json
{
  "success": false,
  "message": "Transaction must be in REJECTED status to refund",
  "code": "40002"
}
```

---

### 4.6 Upload Slip

### POST `/transactions/upload-slip`

**Request Body**
```json
{
  "base64": "<base64 encoded image string>"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "matched": true,
    "message": "Slip received and matched successfully"
  }
}
```

---

## 5. Webhook

### POST `/payonex/webhook` — รับ Callback

> ⚠️ ไม่ต้องมี Authorization header

**Deposit Webhook Payload (ที่ระบบส่งออก)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "uuid": "da153ec7-8c34-4f56-9f01-c202d7197c96",
    "customerUuid": "e5656d7a-73c5-4d97-85be-21f1f2dc7939",
    "channelName": "MOCK_CHANNEL",
    "merchantOrderId": "ABC123DEF456...",
    "platformOrderId": "b9427377-aad7-4808-...",
    "accountName": "น.ส. มะลิดา กิ่งเมือง",
    "bankCode": "KBANK",
    "accountNo": "2041057028",
    "amount": 500,
    "fee": 8,
    "settleAmount": 492,
    "type": "deposit",
    "status": "SUCCESS",
    "referenceId": "REF-001"
  }
}
```

**Withdraw Webhook Payload (ที่ระบบส่งออก)**
```json
{
  "success": true,
  "message": "successfully",
  "code": "20000",
  "data": {
    "uuid": "ce5ae6c5-fced-40c4-a84f-3ddca653d0ba",
    "customerUuid": "64e43fc7-95ae-401f-851d-3aedf0cdf0cd",
    "channelName": "MOCK_CHANNEL",
    "merchantOrderId": "5628E836F64B4C3E963E524D01D7042E",
    "platformOrderId": "b9427377-aad7-4808-899b-046a82b2f85e",
    "accountName": "Test User",
    "bankCode": "SCB",
    "accountNo": "9999999999",
    "amount": 800,
    "fee": 0,
    "settleAmount": 800,
    "type": "withdraw",
    "status": "SUCCESS",
    "referenceId": "REF-WD-001"
  }
}
```

**Response (เมื่อรับ webhook)**
```json
{
  "success": true,
  "message": "webhook received",
  "code": "20000"
}
```

---

## 6. Mock Payment Page

เมื่อสร้าง deposit จะได้ `link` สำหรับจำลองหน้าชำระเงิน:

```
GET /pay/:uuid
```

เปิดใน browser แล้วกดปุ่ม **"ยืนยันการโอน (Mock)"** เพื่อเปลี่ยน status เป็น `SUCCESS` ทันที  
(ระบบจะกัน double-confirm อัตโนมัติ)

> **หมายเหตุ:** ระบบจะ auto-complete ใน 5 วินาทีอยู่แล้ว ไม่จำเป็นต้องกดปุ่มหากต้องการทดสอบ flow ปกติ

---

## 7. Error Codes

| HTTP | code    | ความหมาย                            |
|------|---------|--------------------------------------|
| 200  | `20000` | สำเร็จ                               |
| 400  | `40001` | Validation failed / Missing fields   |
| 400  | `40002` | Wrong status for this operation      |
| 400  | `40003` | Customer is blocked                  |
| 400  | `40004` | Amount below minimum deposit         |
| 400  | `40005` | Amount exceeds maximum withdraw      |
| 400  | `40006` | Insufficient merchant balance        |
| 400  | `40400` | Resource not found                   |
| 400  | `40502` | Credential not found                 |
| 401  | `40100` | Missing Authorization header         |
| 401  | `40101` | Token invalid or expired             |
| 404  | `40400` | Route not found                      |
| 500  | `50000` | Internal server error                |

**Error Response Format**
```json
{
  "success": false,
  "message": "Error description",
  "code": "40001"
}
```

---

## 8. Business Logic

### Fee Calculation
```
deposit:  settleAmount = amount - (amount × depositFee / 100)
withdraw: settleAmount = amount + (amount × withdrawFee / 100)
```

**ตัวอย่าง deposit 500 THB (fee 1.6%)**
```
fee         = 500 × 1.6 / 100 = 8 THB
settleAmount = 500 - 8        = 492 THB
```

### Transaction Status Flow

```
Deposit:
  PROCESSING → SUCCESS   (auto 5 วิ หรือกดยืนยันบน /pay/:uuid)
  PROCESSING → ON_HOLD   (กรณี manual review)
  ON_HOLD    → SUCCESS   (admin approve)
  ON_HOLD    → REJECTED  (admin reject)
  REJECTED   → REFUNDED  (refund)

Withdraw:
  PROCESSING → SUCCESS   (auto 5 วิ)
  PROCESSING → ON_HOLD   (กรณี manual review)
```

### Merchant Balance
- **Deposit** → เพิ่ม `settleAmount` เมื่อ status เป็น `SUCCESS`
- **Withdraw** → ตัด `amount + fee` ทันทีที่สร้าง transaction

### Environment Variables

| Variable                          | Default | คำอธิบาย                            |
|-----------------------------------|---------|--------------------------------------|
| `PORT`                            | `3101`  | Port ของ server                      |
| `PAYONEX_DEPOSIT_WEBHOOK_DELAY_MS` | `5000`  | หน่วง webhook deposit (ms)           |
| `PAYONEX_WITHDRAW_WEBHOOK_DELAY_MS`| `5000`  | หน่วง webhook withdraw (ms)          |
| `PAYONEX_WEBHOOK_URL`             | (ว่าง)  | Fallback webhook URL                  |

---

## ตัวอย่าง cURL ครบ Flow

```bash
BASE="http://localhost:3101"

# 1. Get token
TOKEN=$(curl -s -X POST "$BASE/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"accessKey":"aa6f90f9-c5c9-4cb5-ac59-b502f80d89e6","secretKey":"777cb628-a875-4e66-b197-c5416a51bf35"}' \
  | jq -r '.data.token')

# 2. Create customer
CUST=$(curl -s -X POST "$BASE/v2/customers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","bankCode":"KBANK","accountNo":"1234567890"}' \
  | jq -r '.data.customerUuid')

# 3. Deposit request
curl -s -X POST "$BASE/transactions/deposit/request" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"customerUuid\":\"$CUST\",\"amount\":500,\"referenceId\":\"MY-REF-001\",\"callbackUrl\":\"https://your-app.com/webhook\"}" \
  | jq

# 4. Withdraw request
curl -s -X POST "$BASE/transactions/withdraw/request" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"customerUuid\":\"$CUST\",\"amount\":300,\"referenceId\":\"MY-WD-001\",\"callbackUrl\":\"https://your-app.com/webhook\"}" \
  | jq

# 5. Check balance
curl -s "$BASE/profile/balance" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

*สร้างจาก source code + ผลทดสอบจริง — อัปเดตล่าสุด 2026-04-02*
