# Worldpayz Mock API Server

Mock server สำหรับทดสอบการเชื่อมต่อ Worldpayz payment API โดยอิงจากเอกสารที่หน้า `https://worldpayz.pages.dev/th`

## Coverage

รองรับ endpoint หลักตามเอกสาร Worldpayz ชุดนี้:

- `GET /v1/balance/query`
- `GET /v1/ebank/bankConfig`
- `GET /v1/chain/list`
- `POST /v1/payment/createInvoicePayment/fiat`
- `POST /v1/payment/createInvoicePayment/crypto`
- `GET /v1/payment/info?id=<invoice_id>`
- `POST /v1/payment/cancel`
- `POST /v1/withdrawal/createRequest/fiat`
- `POST /v1/withdrawal/createRequest/crypto`
- `GET /v1/withdrawal/list?skip=0&take=10`
- `GET /v1/withdrawal/info?id=<withdrawal_id>`
- `GET /pay/:id` สำหรับ simulate หน้า payment
- `POST /mock/payments/:id/confirm` เพื่อ mark payment ว่าจ่ายแล้ว
- `POST /mock/payments/:id/cancel`
- `POST /mock/payments/:id/webhook` เพื่อ resend webhook
- `POST /mock/withdrawals/:id/approve`
- `POST /mock/withdrawals/:id/complete`
- `POST /mock/withdrawals/:id/reject`
- `POST /mock/webhook/receive` เป็น receiver ทดสอบในตัว

## Setup

```bash
cd worldpayz-mock
npm install
npm start
# หรือรัน smoke test หลังจาก server ทำงานแล้ว
npm run smoke
# ถ้าต้องการรันคนละพอร์ต
PORT=3104 npm start
WORLDPAYZ_BASE_URL=http://localhost:3104 npm run smoke
```

Server จะรันที่ port `3102` โดย default

## Mock Credentials

- `x-api-key: WORLDPAYZ_MOCK_API_KEY`
- secret สำหรับทำ signature: `WORLDPAYZ_MOCK_SECRET_KEY`

เปลี่ยนได้ผ่าน env:

```bash
export WORLDPAYZ_API_KEY="your-api-key"
export WORLDPAYZ_SECRET_KEY="your-secret-key"
export WORLDPAYZ_WEBHOOK_URL="http://localhost:4000/webhook/worldpayz"
export PORT=3102
```

## Signature Rule

Mock นี้ตรวจ signature ตามเอกสาร:

```text
${timestamp}|${METHOD}|${fullUrl}|${JSON.stringify(body || '')}
```

แล้วนำไปทำ `HMAC-SHA256` ด้วย `WORLDPAYZ_SECRET_KEY`

ตัวอย่าง Node.js:

```js
const crypto = require('crypto');

const timestamp = Date.now().toString();
const method = 'POST';
const fullUrl = 'http://localhost:3102/v1/payment/createInvoicePayment/fiat';
const body = {
  order_id: 'ORDER-1001',
  order_user_reference: 'U1001',
  payment_method_type: 'PROMPTPAY_QR',
  amount: '500.00',
  from_currency: 'THB',
  to_currency: 'THB',
  payer_bank_provider: 'SCB',
  payer_bank_account_number: '4052512594',
  payer_bank_account_name: 'Mock Customer',
  payment_domain: 'http://localhost:3102',
  url_return: 'https://example.com/return',
  url_success: 'https://example.com/success',
  url_failed: 'https://example.com/failed',
  additional_data: { description: 'test create payment' }
};

const content = `${timestamp}|${method}|${fullUrl}|${JSON.stringify(body)}`;
const signature = crypto.createHmac('sha256', 'WORLDPAYZ_MOCK_SECRET_KEY').update(content).digest('hex');
```

## Example Request

```bash
curl --location 'http://localhost:3102/v1/payment/createInvoicePayment/fiat' \
--header 'Content-Type: application/json' \
--header 'x-api-key: WORLDPAYZ_MOCK_API_KEY' \
--header 'x-timestamp: <timestamp>' \
--header 'x-signature: <signature>' \
--data '{
  "order_id": "ORDER-1001",
  "order_user_reference": "U1001",
  "payment_method_type": "PROMPTPAY_QR",
  "amount": "500.00",
  "from_currency": "THB",
  "to_currency": "THB",
  "payer_bank_provider": "SCB",
  "payer_bank_account_number": "4052512594",
  "payer_bank_account_name": "Mock Customer",
  "payment_domain": "http://localhost:3102",
  "url_return": "https://example.com/return",
  "url_success": "https://example.com/success",
  "url_failed": "https://example.com/failed",
  "additional_data": {
    "description": "test create payment"
  }
}'
```

## Notes

- ถ้าใช้ `order_id` เดิม mock จะคืน payment หรือ withdrawal เดิมกลับมา
- payment รองรับทั้ง `fiat` และ `crypto`
- withdrawal รองรับทั้ง `fiat` และ `crypto` พร้อม mock helper สำหรับ approve, complete, reject
- balance THB จะคำนวณจาก payment สำเร็จและ withdrawal ที่ pending/completed ใน SQLite
- เมื่อ confirm payment แบบ fiat แล้ว mock จะสร้าง `transaction_fiat` ให้ใน endpoint info
- ถ้าตั้ง `WORLDPAYZ_WEBHOOK_URL` ไว้ การ confirm payment จะยิง webhook `PAYMENT_PAID` ให้อัตโนมัติ
- การสร้าง invoice payment จะถูก auto-complete เป็น `SUCCESS` หลัง 5 วินาที และยิง webhook `PAYMENT_PAID` อัตโนมัติ
- ตั้งเวลารอของขาฝากได้ด้วย `WORLDPAYZ_PAYMENT_WEBHOOK_DELAY_MS` (default `5000`)
- ถ้าไม่ได้ตั้ง `WORLDPAYZ_WEBHOOK_URL` ยังใช้งาน mock payment flow ได้ครบ แต่จะไม่ยิง webhook ออก
- smoke test จะตรวจ balance, bank config, chain list, payment fiat/crypto, และ withdrawal fiat/crypto แบบ end-to-end