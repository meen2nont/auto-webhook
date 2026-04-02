# WorldPayz API — คู่มือการใช้งาน (Local)

> 📌 Mock server จำลอง WorldPayz Payment Gateway API  
> อ้างอิงจาก: https://worldpayz.pages.dev/th  
> Base URL (Mock): `http://localhost:3102`  
> Base URL (Production): `https://testnet.trustsig.xyz`

---

## 📑 สารบัญ

1. [Authentication & Signature](#1-authentication--signature)
2. [Balance](#2-balance)
3. [Add-on — Bank List (Fiat)](#3-add-on--bank-list-fiat)
4. [Add-on — Chain List (Crypto)](#4-add-on--chain-list-crypto)
5. [Payment — Create (Fiat)](#5-payment--create-fiat)
6. [Payment — Create (Crypto)](#6-payment--create-crypto)
7. [Payment — Get Invoice Info](#7-payment--get-invoice-info)
8. [Payment — Cancel](#8-payment--cancel)
9. [Withdrawal — Create (Fiat)](#9-withdrawal--create-fiat)
10. [Withdrawal — Create (Crypto)](#10-withdrawal--create-crypto)
11. [Withdrawal — List](#11-withdrawal--list)
12. [Withdrawal — Info](#12-withdrawal--info)
13. [Webhook](#13-webhook)
14. [Mock Helpers (เฉพาะ Mock Server)](#14-mock-helpers-เฉพาะ-mock-server)
15. [Mock Payment Page](#15-mock-payment-page)
16. [Error Codes](#16-error-codes)
17. [Business Logic](#17-business-logic)
18. [Environment Variables](#18-environment-variables)

---

## Mock Credentials

| Field      | Value                       |
|------------|-----------------------------|
| x-api-key  | `WORLDPAYZ_MOCK_API_KEY`    |
| secret key | `WORLDPAYZ_MOCK_SECRET_KEY` |
| Port       | `3102`                      |

---

## 1. Authentication & Signature

ทุก request ต้องมี 3 headers:

```
x-api-key:   YOUR_API_KEY
x-signature: HMAC_SHA256_SIGNATURE
x-timestamp: UNIX_TIMESTAMP_MS
```

### วิธีสร้าง Signature

```
content = "${timestamp}|${METHOD}|${fullUrl}|${JSON.stringify(body)}"
signature = HMAC-SHA256(secret_key, content)
```

> ถ้า body ว่าง ให้ใช้ `""` (empty string)

### ตัวอย่าง Node.js

```js
const crypto = require('crypto');

const timestamp = Date.now().toString();
const method    = 'POST';
const fullUrl   = 'http://localhost:3102/v1/payment/createInvoicePayment/fiat';
const body      = { order_id: 'ORDER-001', amount: '500.00', /* ... */ };

const content   = `${timestamp}|${method}|${fullUrl}|${JSON.stringify(body)}`;
const signature = crypto
  .createHmac('sha256', 'WORLDPAYZ_MOCK_SECRET_KEY')
  .update(content)
  .digest('hex');

// Headers ที่ต้องส่ง:
// x-api-key:   WORLDPAYZ_MOCK_API_KEY
// x-signature: <signature>
// x-timestamp: <timestamp>
// Content-Type: application/json
```

### ตัวอย่าง cURL (GET Balance)

```bash
TIMESTAMP=$(date +%s000)
SECRET="WORLDPAYZ_MOCK_SECRET_KEY"
URL="http://localhost:3102/v1/balance/query"
SIG=$(echo -n "${TIMESTAMP}|GET|${URL}|" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl --location "$URL" \
  --header "x-api-key: WORLDPAYZ_MOCK_API_KEY" \
  --header "x-signature: $SIG" \
  --header "x-timestamp: $TIMESTAMP" \
  --header "Content-Type: application/json"
```

### Error — Missing Headers (401)

```json
{
  "success": false,
  "code": 1401,
  "message": "Missing authentication headers",
  "details": { "required": ["x-api-key", "x-signature", "x-timestamp"] }
}
```

### Error — Invalid Signature (401)

```json
{
  "success": false,
  "code": 1402,
  "message": "Invalid signature",
  "details": { "expectedForMock": "a1b2c3..." }
}
```

### Error — Invalid API Key (403)

```json
{
  "success": false,
  "code": 1403,
  "message": "Invalid API key"
}
```

---

## 2. Balance

### GET `/v1/balance/query`

**Response (200 OK)**

```json
{
  "success": true,
  "code": 0,
  "message": "success",
  "data": {
    "error": null,
    "result": {
      "THB": {
        "available": "10000.00",
        "freeze": "0",
        "total": "10000.00",
        "total_value": "10000.00",
        "available_value": "10000.00",
        "freeze_value": "0",
        "rate_usd": "0.030829",
        "rate_pair": "1",
        "pair": "USD"
      },
      "ETH": {
        "available": "0",
        "freeze": "0",
        "total": "0",
        "total_value": "0",
        "available_value": "0",
        "freeze_value": "0",
        "rate_usd": "4318.90925577",
        "rate_pair": "1",
        "pair": "USD"
      },
      "USDT": { "available": "0", "freeze": "0", "total": "0", "rate_usd": "0.99996938", "pair": "USD" },
      "BNB":  { "available": "0", "freeze": "0", "total": "0", "rate_usd": "1023.02695597", "pair": "USD" },
      "BTC":  { "available": "0", "freeze": "0", "total": "0", "rate_usd": "117408.334404", "pair": "USD" },
      "SOL":  { "available": "0", "freeze": "0", "total": "0", "rate_usd": "218.98311802", "pair": "USD" }
    }
  }
}
```

---

## 3. Add-on — Bank List (Fiat)

### GET `/v1/ebank/bankConfig`

**Response (200 OK)**

```json
{
  "success": true,
  "code": 0,
  "data": {
    "KBANK": { "name_th": "กสิกรไทย",     "fullname_th": "ธนาคารกสิกรไทย",          "name_en": "Kasikorn Bank",                                  "bank_code": "KBANK",     "bank_number": "004" },
    "SCB":   { "name_th": "ไทยพาณิชย์",   "fullname_th": "ธนาคารไทยพาณิชย์",        "name_en": "The Siam Commercial Bank",                       "bank_code": "SCB",       "bank_number": "014" },
    "KTB":   { "name_th": "กรุงไทย",      "fullname_th": "ธนาคารกรุงไทย",            "name_en": "Krungthai Bank",                                 "bank_code": "KTB",       "bank_number": "006" },
    "BBL":   { "name_th": "กรุงเทพ",      "fullname_th": "ธนาคารกรุงเทพ",            "name_en": "Bangkok Bank",                                   "bank_code": "BBL",       "bank_number": "002" },
    "BAY":   { "name_th": "กรุงศรีอยุธยา","fullname_th": "ธนาคารกรุงศรีอยุธยา",     "name_en": "Krungsri Bank",                                  "bank_code": "BAY",       "bank_number": "025" },
    "TTB":   { "name_th": "ทีเอ็มบีธนชาต","fullname_th": "ธนาคารทีเอ็มบีธนชาต",    "name_en": "TMBThanachart Bank",                             "bank_code": "TTB",       "bank_number": "011" },
    "UOB":   { "name_th": "ยูโอบี",       "fullname_th": "ธนาคารยูโอบี",             "name_en": "United Overseas Bank",                           "bank_code": "UOB",       "bank_number": "024" },
    "KKP":   { "name_th": "เกียรตินาคิน", "fullname_th": "ธนาคารเกียรตินาคินภัทร",  "name_en": "Kiatnakin Phatra Bank",                          "bank_code": "KKP",       "bank_number": "069" },
    "GSB":   { "name_th": "ออมสิน",       "fullname_th": "ธนาคารออมสิน",             "name_en": "Government Savings Bank",                        "bank_code": "GSB",       "bank_number": "030" },
    "BAAC":  { "name_th": "ธ.ก.ส.",       "fullname_th": "ธนาคารเพื่อการเกษตรฯ",    "name_en": "Bank for Agriculture and Agricultural Cooperatives","bank_code": "BAAC",    "bank_number": "034" },
    "CIMB":  { "name_th": "ซีไอเอ็มบี",  "fullname_th": "ธนาคารซีไอเอ็มบี",        "name_en": "CIMB Thai Bank",                                 "bank_code": "CIMB",      "bank_number": "022" }
  }
}
```

---

## 4. Add-on — Chain List (Crypto)

### GET `/v1/chain/list`

**Response (200 OK)**

```json
{
  "success": true,
  "code": 0,
  "data": [
    { "id": "0ff1f448-...", "name": "Ethereum",          "chain": "ethereum", "native_asset": "ETH",   "standard_token": "erc20",    "gas_min": 0.0030625, "is_actived": true, "metadata": { "chain_id": 3 } },
    { "id": "1d44e285-...", "name": "Polygon",           "chain": "polygon",  "native_asset": "MATIC", "standard_token": "erc20",    "gas_min": 13.315579, "is_actived": true, "metadata": { "chain_id": 80001 } },
    { "id": "29ebef1f-...", "name": "Litecoin",          "chain": "litecoin", "native_asset": "LTC",   "standard_token": "litecoin", "gas_min": 0.038931,  "is_actived": true, "metadata": { "chain_id": 1 } },
    { "id": "97b8e001-...", "name": "Binance Smart Chain","chain": "bsc",     "native_asset": "BNB",   "standard_token": "bep20",    "gas_min": 0.006906,  "is_actived": true, "metadata": { "chain_id": 97 } },
    { "id": "97ba8e57-...", "name": "Bitcoin",           "chain": "bitcoin",  "native_asset": "BTC",   "standard_token": "bitcoin",  "gas_min": 0.00003126,"is_actived": true, "metadata": { "chain_id": 0 } },
    { "id": "fa9878a5-...", "name": "Dogecoin",          "chain": "dogecoin", "native_asset": "DOGE",  "standard_token": "dogecoin", "gas_min": 4.05358843,"is_actived": true, "metadata": { "chain_id": 2 } },
    { "id": "d28f040c-...", "name": "Tron",              "chain": "tron",     "native_asset": "TRX",   "standard_token": "trc20",    "gas_min": 3.398395,  "is_actived": true, "metadata": { "chain_id": 195 } }
  ]
}
```

---

## 5. Payment — Create (Fiat)

### POST `/v1/payment/createInvoicePayment/fiat`

**Required Headers**
```
Content-Type: application/json
x-api-key:    WORLDPAYZ_MOCK_API_KEY
x-signature:  <HMAC-SHA256>
x-timestamp:  <Unix ms>
```

**Request Body**

```json
{
  "order_id": "ORDER-123456789",
  "order_user_reference": "USER123",
  "payment_method_type": "PROMPTPAY_QR",
  "amount": "500.00",
  "from_currency": "THB",
  "to_currency": "THB",
  "payer_bank_provider": "SCB",
  "payer_bank_account_number": "4052512594",
  "payer_bank_account_name": "รณชิต ราโช",
  "payment_domain": "http://localhost:3102",
  "url_return":  "https://yourdomain.com/return",
  "url_success": "https://yourdomain.com/success",
  "url_failed":  "https://yourdomain.com/failed",
  "additional_data": { "description": "test payment" }
}
```

| Field                      | Required | คำอธิบาย                     |
|----------------------------|----------|-------------------------------|
| order_id                   | ✅       | Order ID ของ merchant          |
| order_user_reference       | ✅       | User reference                 |
| payment_method_type        | ✅       | `PROMPTPAY_QR`                 |
| amount                     | ✅       | จำนวนเงิน (string)             |
| from_currency / to_currency| ✅       | `THB`                          |
| payer_bank_provider        | ✅       | รหัสธนาคารผู้จ่าย             |
| payer_bank_account_number  | ✅       | เลขบัญชีผู้จ่าย               |
| payer_bank_account_name    | ✅       | ชื่อผู้จ่าย                   |
| payment_domain             | ✅       | Domain ของหน้าชำระเงิน        |
| url_return / url_success / url_failed | ✅ | Redirect URLs            |
| additional_data            | ✅       | ข้อมูลเพิ่มเติม               |

**Response (200 OK)**

```json
{
  "success": true,
  "code": 0,
  "data": {
    "id": "f5f0e968-95aa-4939-9b97-a38ae03a3d68",
    "seq_num": 2206,
    "source_id": "wpayz",
    "order_id": "ORDER-123456789",
    "order_user_reference": "USER123",
    "order_display_mode": "FIAT",
    "payment_method_type": "PROMPTPAY_QR",
    "payment_provider": "EBANK",
    "invoice_type": "FIAT",
    "from_currency": "THB",
    "to_currency": "THB",
    "chain": "offchain",
    "network": "testnet",
    "amount": "500.00",
    "payment_amount": 500.00,
    "lifetime": 900,
    "expired_at": "2025-10-08T19:38:02.695Z",
    "payment_url": "http://localhost:3102/pay/f5f0e968-95aa-4939-9b97-a38ae03a3d68",
    "payment_qr": "00020101021229370016A000000677010111021307755680032235303764540500005802TH6304MOCK",
    "payment_status": "PAYMENT_CHECKING",
    "is_completed": false,
    "status": "PENDING",
    "created_at": "2025-10-08T19:23:02.773Z"
  }
}
```

**พฤติกรรม Mock:**
1. ตอบกลับทันที พร้อม `payment_url`, `payment_qr`
2. รอ **5 วินาที** (`WORLDPAYZ_PAYMENT_WEBHOOK_DELAY_MS`)
3. อัปเดต payment_status เป็น `PAYMENT_PAID`, status → `SUCCESS`
4. ส่ง webhook event `PAYMENT_PAID` ไปที่ `WORLDPAYZ_WEBHOOK_URL`

> **หมายเหตุ:** ถ้าใช้ `order_id` ซ้ำ จะได้ payment เดิมกลับมา

---

## 6. Payment — Create (Crypto)

### POST `/v1/payment/createInvoicePayment/crypto`

**Request Body**

```json
{
  "order_id": "ORDER-CRYPTO-001",
  "order_user_reference": "USER123",
  "payment_method_type": "CRYPTO",
  "amount": "100.00",
  "from_currency": "USDT",
  "to_currency": "USDT",
  "payment_domain": "http://localhost:3102",
  "url_return":  "https://yourdomain.com/return",
  "url_success": "https://yourdomain.com/success",
  "url_failed":  "https://yourdomain.com/failed",
  "additional_data": { "description": "crypto payment" }
}
```

> `payer_bank_*` fields ไม่จำเป็นสำหรับ Crypto

**Response** — โครงสร้างเดียวกับ Fiat แต่มี crypto address แทน QR:

```json
{
  "success": true,
  "code": 0,
  "data": {
    "id": "...",
    "invoice_type": "CRYPTO",
    "from_currency": "USDT",
    "to_currency": "USDT",
    "chain": "tron",
    "network": "testnet",
    "payment_url": "http://localhost:3102/pay/...",
    "payment_qr": null,
    "payment_status": "PAYMENT_CHECKING",
    "status": "PENDING"
  }
}
```

---

## 7. Payment — Get Invoice Info

### GET `/v1/payment/info?id=<invoice_id>`

**Response (200 OK)** — object เต็มของ payment พร้อม detail ครบ:

```json
{
  "success": true,
  "code": 0,
  "data": {
    "id": "f5f0e968-95aa-4939-9b97-a38ae03a3d68",
    "seq_num": 2206,
    "source_id": "wpayz",
    "order_id": "ORDER-123456789",
    "order_user_reference": "USER123",
    "invoice_type": "FIAT",
    "from_currency": "THB",
    "to_currency": "THB",
    "amount": "500.00",
    "payment_amount": 500.0,
    "payment_status": "PAYMENT_PAID",
    "is_completed": true,
    "status": "SUCCESS",
    "fee_percent": 1.4,
    "fee_amount": 7.0,
    "merchant_amount": 493.0,
    "payment_url": "http://localhost:3102/pay/f5f0e968-...",
    "payment_qr": "00020101...",
    "payer_bank_provider": "SCB",
    "payer_bank_account_number": "4052512594",
    "payer_bank_account_name": "รณชิต ราโช",
    "merchant_detail": {
      "merchant_id": "merchant-fallback",
      "merchant_code": "WPMOCK001",
      "name": "Worldpayz Mock Merchant",
      "provider": "SCB",
      "account_number": "6123013742",
      "amount_received": 493.0,
      "fee_deducted": 7.0
    },
    "payer_detail": {
      "bank_provider": "SCB",
      "bank_name": "ธนาคารไทยพาณิชย์",
      "bank_code": "SCB",
      "account_number": "4052512594",
      "account_name": "รณชิต ราโช",
      "amount_paid": 500.0
    },
    "fee_breakdown": {
      "type": "PERCENTAGE",
      "percent": 1.4,
      "amount": 7.0,
      "charge_to": "MERCHANT"
    },
    "txid": "mock-f5f0e968-...",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

**Error — Not Found (404)**

```json
{
  "success": false,
  "code": 1404,
  "message": "Payment not found"
}
```

---

## 8. Payment — Cancel

### POST `/v1/payment/cancel`

**Request Body**

```json
{
  "id": "f5f0e968-95aa-4939-9b97-a38ae03a3d68"
}
```

**Response (200 OK)**

```json
{
  "success": true,
  "code": 0,
  "data": {
    "id": "f5f0e968-95aa-4939-9b97-a38ae03a3d68",
    "status": "CANCELLED",
    "payment_status": "PAYMENT_CANCELED",
    "cancelled_at": "2024-01-15T10:30:00Z"
  }
}
```

> ระบบจะส่ง webhook event `PAYMENT_CANCELED` ออกไปด้วย

**Error — Already completed (400)**

```json
{
  "success": false,
  "code": 1001,
  "message": "Payment cannot be cancelled"
}
```

---

## 9. Withdrawal — Create (Fiat)

### POST `/v1/withdrawal/createRequest/fiat`

**Request Body**

```json
{
  "withdrawal_mode": "FIAT",
  "order_id": "WD-ORDER-001",
  "amount": 1000.00,
  "currency": "THB",
  "receiver_bank": "SCB",
  "receiver_name": "MR. John Snow",
  "withdrawal_address": "9999999999",
  "chain": "offchain",
  "asset_type": "native",
  "additional": {
    "description": "test withdrawal",
    "reference_user_id": 123
  }
}
```

| Field               | Required | คำอธิบาย                    |
|---------------------|----------|-----------------------------|
| withdrawal_mode     | ✅       | `FIAT`                       |
| order_id            | ✅       | Order ID ของ merchant         |
| amount              | ✅       | จำนวนเงิน (number)            |
| currency            | ✅       | `THB`                        |
| receiver_bank       | ✅       | รหัสธนาคารผู้รับ             |
| receiver_name       | ✅       | ชื่อผู้รับ                   |
| withdrawal_address  | ✅       | เลขบัญชีผู้รับ               |
| chain               | ✅       | `offchain`                   |
| asset_type          | ✅       | `native`                     |
| additional          | ✅       | ข้อมูลเพิ่มเติม              |

**Response (200 OK)**

```json
{
  "success": true,
  "code": 0,
  "data": {
    "id": "650c44b0-7371-4e73-a766-d3216b87e7a2",
    "seq_num": 489,
    "source_id": "wpayz",
    "unique_hash": "8f1a9c432af55a04f606458cdabf3a77ce01f28bebe6d059b0caa07d064ed5b2",
    "order_id": "WD-ORDER-001",
    "withdrawal_mode": "FIAT",
    "receiver_bank": "SCB",
    "receiver_name": "MR. John Snow",
    "currency": "THB",
    "address": "9999999999",
    "amount": "1000",
    "chain": "offchain",
    "asset_type": "native",
    "network": "testnet",
    "fee_model_type": "PERCENTAGE",
    "fee": 0,
    "fee_amount": 0,
    "realized_amount": 1000,
    "withdrawal_status": "PENDING",
    "created_at": "2025-10-08T19:38:18.586Z"
  }
}
```

**พฤติกรรม Mock:**
1. ตอบกลับทันที พร้อม `id`, status = `PENDING`
2. รอ **5 วินาที** (`WORLDPAYZ_WITHDRAWAL_WEBHOOK_DELAY_MS`)
3. อัปเดต withdrawal_status เป็น `WITHDRAWAL_COMPLETE`
4. ส่ง webhook event `WITHDRAWAL_COMPLETE`

---

## 10. Withdrawal — Create (Crypto)

### POST `/v1/withdrawal/createRequest/crypto`

**Request Body**

```json
{
  "withdrawal_mode": "CRYPTO",
  "order_id": "WD-CRYPTO-001",
  "amount": 10.5,
  "currency": "USDT",
  "withdrawal_address": "TN8RjnF2QjB5zMBfDgsdD1cMQqcw7N3S9z",
  "chain": "tron",
  "asset_type": "native",
  "additional": {
    "description": "crypto withdrawal"
  }
}
```

> `receiver_bank` และ `receiver_name` ไม่จำเป็นสำหรับ Crypto

**Response** — โครงสร้างเดียวกับ Fiat แต่ไม่มี `receiver_bank`

---

## 11. Withdrawal — List

### GET `/v1/withdrawal/list?skip=0&take=10`

| Query Param | Default | คำอธิบาย           |
|-------------|---------|---------------------|
| skip        | 0       | จำนวน record ที่ข้าม |
| take        | 10      | จำนวน record ที่ดึง  |

**Response (200 OK)**

```json
{
  "success": true,
  "code": 0,
  "data": [
    {
      "id": "650c44b0-7371-4e73-a766-d3216b87e7a2",
      "seq_num": 489,
      "order_id": "WD-ORDER-001",
      "withdrawal_mode": "FIAT",
      "receiver_bank": "SCB",
      "receiver_name": "MR. John Snow",
      "currency": "THB",
      "address": "9999999999",
      "amount": "1000",
      "fee": 0,
      "fee_amount": 0,
      "realized_amount": 1000,
      "withdrawal_status": "WITHDRAWAL_COMPLETE",
      "created_at": "..."
    }
  ]
}
```

---

## 12. Withdrawal — Info

### GET `/v1/withdrawal/info?id=<withdrawal_id>`

**Response (200 OK)**

```json
{
  "success": true,
  "code": 0,
  "data": {
    "id": "1e602c35-7080-4fd4-a245-cf0c971423c8",
    "seq_num": 1,
    "order_id": "WD-20250101-001",
    "order_user_reference": "USER001",
    "amount": "1000.00",
    "withdrawal_amount": 1000.00,
    "fee": 0,
    "fee_amount": 0,
    "realized_amount": 1000,
    "currency": "THB",
    "receiver_bank": "SCB",
    "receiver_name": "นาย สมชาย ใจดี",
    "withdrawal_address": "9999999999",
    "withdrawal_status": "WITHDRAWAL_COMPLETE",
    "is_completed": true,
    "status": "COMPLETED",
    "transaction_history": [
      { "timestamp": "...", "status": "WITHDRAWAL_PENDING",  "description": "สร้างคำขอถอนเงิน" },
      { "timestamp": "...", "status": "WITHDRAWAL_APPROVED", "description": "อนุมัติการถอนเงิน" },
      { "timestamp": "...", "status": "WITHDRAWAL_COMPLETE", "description": "ถอนเงินสำเร็จ" }
    ],
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

## 13. Webhook

### Outgoing Headers (จาก WorldPayz → Merchant)

```
Content-Type: application/json
x-api-key:          <merchant api key>
x-signature:        <HMAC-SHA256>
x-timestamp:        <Unix ms>
```

> ลายเซ็น Webhook ใช้ format เดียวกับ Request signature

---

### Payment Paid Webhook (`PAYMENT_PAID`)

```json
{
  "event": "PAYMENT_PAID",
  "type": "FIAT",
  "data": {
    "payment": {
      "id": "f5f0e968-95aa-4939-9b97-a38ae03a3d68",
      "txid": "0x00",
      "chain": "offchain",
      "amount": "500.00",
      "status": "SUCCESS",
      "address": "0x00",
      "fx_rate": { "THB": 500.0, "USD": 15.87 },
      "network": "testnet",
      "seq_num": 2206,
      "agent_id": "aacc3472-f3c3-49bb-9040-d5a6aff283bf",
      "lifetime": 900,
      "order_id": "ORDER-123456789",
      "source_id": "payment",
      "created_at": "2026-01-16T07:02:31.142Z",
      "expired_at": "2026-01-16T07:17:31.110Z",
      "updated_at": "2026-01-16T07:04:20.621Z",
      "to_currency": "THB",
      "from_currency": "THB",
      "failed_reason": "UNKNOWN",
      "payment_amount": 500.0,
      "payment_status": "PAYMENT_PAID",
      "merchant_amount": 493.0,
      "payer_paid_amount": 500.0,
      "payer_bank_provider": "SCB",
      "payer_paid_currency": "THB",
      "payer_bank_account_name": "รณชิต ราโช",
      "payer_bank_account_number": "4052512594",
      "order_user_reference": "USER123"
    },
    "transaction": {
      "id": "txn-mock-id",
      "fee": 1.4,
      "type": "RECEIVE",
      "amount": 500.0,
      "status": "COMPLETED",
      "to_bank": "SCB",
      "tx_date": "16/01/2026 14:02",
      "currency": "THB",
      "order_id": "ORDER-123456789",
      "from_bank": "SCB",
      "from_name": "รณชิต ราโช",
      "reference": "35690374",
      "source_id": "payment",
      "created_at": "...",
      "fee_amount": 7.0,
      "payment_id": "f5f0e968-...",
      "updated_at": "...",
      "from_address": "4052512594",
      "realized_amount": 493.0,
      "order_user_reference": "USER123"
    }
  }
}
```

---

### Payment Canceled Webhook (`PAYMENT_CANCELED`)

```json
{
  "event": "PAYMENT_CANCELED",
  "type": "FIAT",
  "data": {
    "payment": {
      "id": "...",
      "status": "CANCELED",
      "payment_status": "PAYMENT_CANCELED",
      "failed_reason": "UNKNOWN",
      "order_id": "ORDER-123456789"
    }
  }
}
```

---

## 14. Mock Helpers (เฉพาะ Mock Server)

Endpoints เหล่านี้ **ไม่มีใน Production** ใช้สำหรับทดสอบ flow เท่านั้น

### POST `/mock/payments/:id/confirm`
Simulate การยืนยันการชำระเงิน → payment_status = `PAYMENT_PAID`

### POST `/mock/payments/:id/cancel`
Simulate การยกเลิก → payment_status = `PAYMENT_CANCELED`

### POST `/mock/payments/:id/webhook`
Resend webhook สำหรับ payment นี้

### POST `/mock/withdrawals/:id/approve`
Simulate admin อนุมัติ withdrawal → status = `WITHDRAWAL_APPROVED`

### POST `/mock/withdrawals/:id/complete`
Simulate การโอนเงินสำเร็จ → status = `WITHDRAWAL_COMPLETE`

### POST `/mock/withdrawals/:id/reject`
Simulate การปฏิเสธ → status = `WITHDRAWAL_REJECTED`

### POST `/mock/webhook/receive`
Webhook receiver ในตัว — รับและ log payload ออก console

---

## 15. Mock Payment Page

### GET `/pay/:id`

เปิดใน browser เพื่อจำลองหน้าชำระเงิน  
→ กดปุ่ม **"ยืนยันการโอน (Mock)"** เพื่อ trigger `PAYMENT_PAID` ทันที

> ระบบจะ auto-complete ใน **5 วินาที** อยู่แล้ว ไม่จำเป็นต้องกดปุ่ม

---

## 16. Error Codes

| HTTP | code | ความหมาย                        |
|------|------|----------------------------------|
| 200  | 0    | Success                          |
| 400  | 1000 | Bad request / validation failed  |
| 400  | 1400 | Invalid timestamp format         |
| 401  | 1401 | Missing authentication headers   |
| 401  | 1402 | Invalid signature                |
| 403  | 1403 | Invalid API key / inactive       |
| 404  | 1404 | Resource not found               |
| 409  | 1409 | Duplicate order_id               |
| 500  | 1500 | Internal server error            |

**Error Response Format**

```json
{
  "success": false,
  "code": 1404,
  "message": "Payment not found",
  "timestamp": "2026-04-02T00:00:00.000Z",
  "status_code": 404
}
```

---

## 17. Business Logic

### Payment Status Flow

```
PENDING → SUCCESS    (auto 5 วิ หรือกด confirm บน /pay/:id)
PENDING → CANCELLED  (เรียก /v1/payment/cancel)
```

### Payment Status Values

| payment_status       | ความหมาย                   |
|----------------------|----------------------------|
| `PAYMENT_CHECKING`   | รอการชำระเงิน              |
| `PAYMENT_PAID`       | ชำระเงินสำเร็จ              |
| `PAYMENT_CANCELED`   | ยกเลิกแล้ว                  |

### Withdrawal Status Flow

```
PENDING → WITHDRAWAL_APPROVED → WITHDRAWAL_COMPLETE
PENDING → WITHDRAWAL_REJECTED
```

### Withdrawal Status Values

| withdrawal_status       | ความหมาย                 |
|-------------------------|--------------------------|
| `PENDING`               | รอดำเนินการ               |
| `WITHDRAWAL_APPROVED`   | อนุมัติแล้ว               |
| `WITHDRAWAL_COMPLETE`   | โอนเงินสำเร็จ             |
| `WITHDRAWAL_REJECTED`   | ปฏิเสธ                    |

### Fee Calculation (Fiat Payment)

```
fee            = amount × 1.4%
merchant_amount = amount - fee

ตัวอย่าง amount = 500 THB:
  fee            = 500 × 0.014 = 7.00 THB
  merchant_amount = 500 - 7   = 493.00 THB
```

### Duplicate order_id
ถ้าใช้ `order_id` เดิม mock จะคืน payment/withdrawal เดิมกลับมา (idempotent)

---

## 18. Environment Variables

| Variable                            | Default                    | คำอธิบาย                         |
|-------------------------------------|----------------------------|----------------------------------|
| `PORT`                              | `3102`                     | Port ของ server                  |
| `WORLDPAYZ_API_KEY`                 | `WORLDPAYZ_MOCK_API_KEY`   | API Key สำหรับ Auth              |
| `WORLDPAYZ_SECRET_KEY`              | `WORLDPAYZ_MOCK_SECRET_KEY`| Secret สำหรับ Signature          |
| `WORLDPAYZ_WEBHOOK_URL`             | `""` (ว่าง)                | URL รับ webhook                  |
| `WORLDPAYZ_PAYMENT_DOMAIN`          | `https://worldpayz...`     | Domain ของหน้าชำระเงิน          |
| `WORLDPAYZ_PAYMENT_WEBHOOK_DELAY_MS`| `5000`                     | หน่วง webhook payment (ms)       |
| `WORLDPAYZ_WITHDRAWAL_WEBHOOK_DELAY_MS` | `5000`                 | หน่วง webhook withdrawal (ms)    |

---

## ตัวอย่างเต็ม Flow (Node.js)

```js
const crypto = require('crypto');
const fetch  = require('node-fetch'); // npm i node-fetch@2

const BASE       = 'http://localhost:3102';
const API_KEY    = 'WORLDPAYZ_MOCK_API_KEY';
const SECRET_KEY = 'WORLDPAYZ_MOCK_SECRET_KEY';

function sign(method, url, body) {
  const ts      = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const content = `${ts}|${method.toUpperCase()}|${url}|${bodyStr}`;
  const sig     = crypto.createHmac('sha256', SECRET_KEY).update(content).digest('hex');
  return { ts, sig };
}

async function apiCall(method, path, body = null) {
  const url = `${BASE}${path}`;
  const { ts, sig } = sign(method, url, body);
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    API_KEY,
      'x-signature':  sig,
      'x-timestamp':  ts,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// 1. Check balance
const balance = await apiCall('GET', '/v1/balance/query');
console.log('Balance THB:', balance.data.result.THB.available);

// 2. Create payment
const payment = await apiCall('POST', '/v1/payment/createInvoicePayment/fiat', {
  order_id: `ORDER-${Date.now()}`,
  order_user_reference: 'USER001',
  payment_method_type: 'PROMPTPAY_QR',
  amount: '500.00',
  from_currency: 'THB',
  to_currency: 'THB',
  payer_bank_provider: 'SCB',
  payer_bank_account_number: '4052512594',
  payer_bank_account_name: 'Test Customer',
  payment_domain: BASE,
  url_return:  'https://example.com/return',
  url_success: 'https://example.com/success',
  url_failed:  'https://example.com/failed',
  additional_data: { description: 'test' },
});
console.log('Payment ID:', payment.data.id);
console.log('QR URL:', payment.data.payment_url);

// 3. Check invoice info
const info = await apiCall('GET', `/v1/payment/info?id=${payment.data.id}`);
console.log('Status:', info.data.payment_status);

// 4. Create withdrawal
const wd = await apiCall('POST', '/v1/withdrawal/createRequest/fiat', {
  withdrawal_mode: 'FIAT',
  order_id: `WD-${Date.now()}`,
  amount: 300,
  currency: 'THB',
  receiver_bank: 'SCB',
  receiver_name: 'Test Receiver',
  withdrawal_address: '9999999999',
  chain: 'offchain',
  asset_type: 'native',
  additional: { description: 'test withdrawal' },
});
console.log('Withdrawal ID:', wd.data.id);
```

---

## Webhook IP Whitelist (Production)

```
18.142.128.26
54.254.162.138
157.230.39.147
74.220.52.0/24
```

---

*สร้างจาก source code + https://worldpayz.pages.dev/th — อัปเดตล่าสุด 2026-04-02*
