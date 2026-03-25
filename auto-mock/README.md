# Autobank API Mock Server

Mock server สำหรับทดสอบการเชื่อมต่อ Autobank API ด้วย Node.js (Express)

## วิธีใช้งาน (ภาษาไทย)
1. ติดตั้ง dependencies:
   ```sh
   cd mock-server
   npm install
   ```
2. เริ่มเซิร์ฟเวอร์:
   ```sh
   npm run dev
   # หรือ
   npm start
   ```
3. API จะรันที่ http://localhost:3100

## Usage (English)
1. Install dependencies:
   ```sh
   cd mock-server
   npm install
   ```
2. Start the server:
   ```sh
   npm run dev
   # or
   npm start
   ```
3. The API will be available at http://localhost:3100

## Endpoints
- GET    /api/v2/autobank/me
- POST   /api/v2/autobank/customer/create
- POST   /api/v2/autobank/register
- GET    /api/v2/autobank/list
- PUT    /api/v2/autobank/update
- DELETE /api/v2/autobank/delete
- POST   /api/v2/autobank/payout
- POST   /webhook/deposit
- POST   /webhook/withdrawal
- GET    /api/v2/autobank/deposit/status?deposit_id=xxx

Mock response ตามตัวอย่างใน AUTOBANK-INTEGRATION.md

## Payout Auto-Complete + Withdrawal Webhook
- `POST /api/v2/autobank/payout` จะตอบกลับสถานะ `pending` ทันที
- หลังจากนั้นระบบจะรอ 5 วินาที (ค่า default)
- อัปเดตสถานะ payout ในฐานข้อมูลเป็น `success`
- ส่ง webhook ถอนเงินอัตโนมัติด้วย payload:

```json
{
   "trace_id": "abc123xyz",
   "withdraw_auto_id": 45678,
   "status": "success",
   "amount": 1000.0,
   "member_username": "customer01",
   "message": "Withdrawal completed successfully"
}
```

ตั้งค่าได้ผ่าน environment variables:
- `AUTOBANK_WITHDRAW_WEBHOOK_DELAY_MS` (default `5000`)
- `AUTOBANK_WITHDRAW_WEBHOOK_URL` (fallback URL สำหรับ callback)

หรือส่ง `callback_url` มาใน body ของ `/api/v2/autobank/payout` เพื่อ override ต่อ request
