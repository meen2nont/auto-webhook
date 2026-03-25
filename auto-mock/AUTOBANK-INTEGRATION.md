=====================================
รายละเอียดการเชื่อมต่อนะครับอันนี้เป็น key สำหรับทดสอบครับถ้ากรณีนำไปขายจริงพี่ต้องมาแจ้งขอเปิด key เพิ่มอีกทีนะครับ

X-API-Key: 1DE8FEF2BFE950C1B5B5ACF9506C418B222DE75D3B3406F84AAEAC56E9B2BB4B
X-Merchant-ID: EXT-2026-A4AF29964BC3

===================================== Autobank API Integration Guide =============================

Welcome to the Autobank API! This guide will help you connect, authenticate, and interact with our Autobank system securely and efficiently.

----------------------------------------
1. Authentication
----------------------------------------
All API requests require authentication using two HTTP headers:

- X-API-Key: Your unique API key
- X-Merchant-ID: Your unique merchant ID

Example (in HTTP headers):
X-API-Key: YOUR_API_KEY
X-Merchant-ID: YOUR_MERCHANT_ID

----------------------------------------
2. Base URL
----------------------------------------
All endpoints are prefixed with:

https://backoffice-api.941a6cfd74cab52b1d17a3e092756e86.me/api/v2/autobank

----------------------------------------
3. Connection Test
----------------------------------------
Check if your credentials are valid and the API is reachable:

GET /me

Response:
{
  "status": "success",
  "message": "connect success"
}

----------------------------------------
4. Customer Management
----------------------------------------
Before making a payout, you must register your customer (recipient):

POST /customer/create

Body (JSON):
{
  "member_username": "customer01",
  "member_name": "John Doe",
  "member_bank": "SCB",
  "member_accid": "1234567890",
  "member_tmnid": "tmn123456" // optional
}

Response:
{
  "status": "success",
  "message": "Customer created successfully",
  "data": {
    "member_bank_id": 12345,
    "custom_username": "customer01",
    "member_name": "John Doe",
    "member_bank": "SCB",
    "member_accid": "1234567890",
    "member_tmnid": "tmn123456"
  }
}

Error Response:
{
  "status": "error",
  "message": "Customer already exists"
}

----------------------------------------
5. Bank Account Management
----------------------------------------
Register a new bank account for your merchant:

POST /register
Body (JSON):
{
  "system": "bank",
  "bank_type": 1, 
  "agent_type": "withdraw", // ฝาก = "deposit", ถอน = "withdraw", ถ้าเป็น ออมสิน ทรู = all
  "agent_bank": "SCB", trumoney = TMN
  "agent_accid": "1234567890", // เลขบัญชีของ merchant
  "agent_accname": "Merchant Account", // ชื่อบัญชีของ merchant
  "agent_userbank": "username",
  "agent_passbank": "password",
  "mobile_no": "0812345678"
}

Response:
{
  "status": "success",
  "message": "Bank account registered successfully",
  "data": {
    "bank_id": 24779,
    "payment_id": "d48851ad-82b0-4469-8a78-89d87d5432c4",
    "payment_auth_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "auth_ip": "143.198.216.122",
    "message": "Account already registered and activated"
  }
}

List all your bank accounts:
GET /list

Response:
{
  "status": "success",
  "message": "Bank accounts retrieved successfully",
  "data": [
    {
      "bank_id": 67890,
      "bank_type": "1",
      "agent_bank": "SCB",
      "is_deposit": 0,
      "is_withdraw": 1,
      "accid": "1234567890",
      "accname": "Merchant Account",
      "mobile": "0812345678",
      "active": 1,
      "balance": 50000.00,
      "created_at": "2024-01-20T10:30:00Z",
      "updated_at": "2024-01-20T10:30:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "last_page": 1,
    "per_page": 25,
    "total": 1
  }
}

Update a bank account:
PUT /update
Body (JSON):
{
  "bank_id": 24779,
  "agent_accname": "Updated Account Name",
  "mobile_no": "0855916657"
}

Response:
{
  "status": "success",
  "message": "Bank account updated successfully"
}

Delete a bank account:
DELETE /delete
Body (JSON):
{
  "bank_id": 67890
}

Response:
{
  "status": "success",
  "message": "Bank account deleted successfully"
}

----------------------------------------
6. Transaction Management
----------------------------------------

6.1 Payout (Withdraw) Transaction
To initiate a withdrawal to a customer:

POST /payout
Body (JSON):
{
  "merchant_bank_id": 123,         // Your merchant's bank account ID
  "custom_username": "customer01", // The customer username
  "amount": 1000.00                // Amount to withdraw
}

Response:
{
  "status": "success",
  "message": "Withdrawal initiated",
  "data": {
    "trace_id": "abc123xyz",
    "withdraw_auto_id": 45678,
    "status": "pending"
  }
}

Error Response:
{
  "status": "error",
  "message": "Customer not found for this merchant"
}

6.2 Deposit Processing
The system automatically processes deposit transactions from bank webhooks. When a deposit is processed, AutoBankMerchant customers will receive webhook notifications with the following format:

**Webhook Notification Format:**
```json
{
  "deposit_id": 78901,
  "status": "success",
  "amount": 100.00,
  "member_username": "customer01",
  "bank": "KTB",
  "account_id": "15xxxx2541",
  "transaction_date": "2025-07-09 05:58:20",
  "create_date": "2025-07-09T05:58:20Z",
  "message": ""
}
```

**Status Values:**
- `success`: Deposit processed successfully and credited to member account
- `wait`: Deposit requires manual review (e.g., duplicate accounts, time limit exceeded)
- `member_select`: Multiple members found with same account details

**Note:** Webhook notifications are sent AFTER all deposit processing is complete, including member matching, promotion calculation, and transaction processing.



6.3 Check Deposit Status
To check the status of a deposit transaction:

GET /api/v2/autobank/deposit/status?deposit_id=78901

Response:
{
  "status": "success",
  "data": {
    "deposit_id": 78901,
    "member_username": "customer01",
    "amount": 100.00,
    "status": "success",
    "bank": "KTB",
    "account_id": "15xxxx2541",
    "create_date": "2025-07-09T05:58:20Z",
    "update_date": "2025-07-09T05:58:20Z",
    "remark": ""
  }
}

Error Response:
{
  "status": "error",
  "message": "Deposit not found"
}

----------------------------------------
7. Webhook Notifications
----------------------------------------
When transactions are processed, webhook notifications will be sent to your configured webhook URL.

**Deposit Webhook Payload:**
```json
{
  "deposit_id": 78901,
  "status": "success",
  "amount": 100.00,
  "member_username": "customer01",
  "bank": "KTB",
  "account_id": "15xxxx2541",
  "transaction_date": "2025-07-09 05:58:20",
  "create_date": "2025-07-09T05:58:20Z",
  "message": ""
}
```

**Withdrawal Webhook Payload:**
```json
{
  "trace_id": "abc123xyz",
  "withdraw_auto_id": 45678,
  "status": "success",
  "amount": 1000.00,
  "member_username": "customer01",
  "message": "Withdrawal completed successfully"
}
```

**Status Values:**
- `success`: Transaction completed successfully
- `wait`: Transaction requires manual review
- `pending`: Transaction is being processed
- `error`: Transaction failed



----------------------------------------
7. Transaction Status
----------------------------------------
The following status values may be returned in API responses and webhook notifications:

- SUCCESS: Transaction completed successfully
- PENDING: Transaction is being processed (in queue)
- WAIT: Waiting for admin to process manually
- CANCEL: Transaction has been cancelled

Status flow:
PENDING → WAIT → SUCCESS (or CANCEL)

----------------------------------------
8. Example: cURL Request
----------------------------------------
curl -X POST "https://backoffice-api.941a6cfd74cab52b1d17a3e092756e86.me/api/v2/autobank/payout" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "X-Merchant-ID: YOUR_MERCHANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"merchant_bank_id":123,"custom_username":"customer01","amount":1000.00}'


// API Configuration
$baseUrl = 'https://backoffice-api.941a6cfd74cab52b1d17a3e092756e86.me/api/v2/autobank';
$apiKey = 'EBB0422FAEFA215A6CB7128144D254F9B39D630C206B5AEE3DEA47C5F7CF9C66';
$merchantId = 'EXT-2025-C23514E49B2A';

// Initialize cURL session
$ch = curl_init();

// Set cURL options
curl_setopt_array($ch, [
    CURLOPT_URL => $baseUrl . '/me',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'X-API-Key: ' . $apiKey,
        'X-Merchant-ID: ' . $merchantId,
        'Content-Type: application/json'
    ],
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2
]);

// Execute cURL request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);

// Close cURL session
curl_close($ch);

// Check for cURL errors
if ($error) {
    throw new \Exception('cURL Error: ' . $error);
}

// Decode JSON response
$responseData = json_decode($response, true);

// Check if JSON decode was successful
if (json_last_error() !== JSON_ERROR_NONE) {
    throw new \Exception('JSON decode error: ' . json_last_error_msg());
}

return response()->json([
    'success' => true,
    'data' => $responseData,
    'http_code' => $httpCode,
    'method' => 'PHP cURL'
]);
----------------------------------------
10. Error Handling
----------------------------------------
All error responses will be in this format:
{
  "status": "error",
  "message": "Error description",
  "errors": { ... } // optional
}

HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad request/validation error
- 401: Unauthorized
- 403: Forbidden
- 404: Not found
- 500: Server error

Common Error Messages:
- "Customer not found for this merchant"
- "Bank account not found"
- "Insufficient balance"
- "Invalid bank code"
- "Customer already exists"
- "Validation failed"

----------------------------------------
11. Supported Languages
----------------------------------------
You can use any programming language that supports HTTP requests and custom headers (Python, PHP, Node.js, Java, C#, Go, Ruby, etc.).

----------------------------------------
12. Bank Code Supported
----------------------------------------
BBL
KBANK
KTB
TTB
SCB
BAY
KKP
CMBT
TISCO
UOBT
CREDIT
LHB
ICBCT
SME
BAAC
EXIM
GSB
GHB
ISBT
TMN
LH
----------------------------------------
Thank you for using Autobank API!

