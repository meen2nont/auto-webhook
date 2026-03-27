const express = require('express');
const http = require('http');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const db = require('./payonexDb');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ─── Credentials ────────────────────────────────────────────────────────────
const ACCESS_KEY = 'aa6f90f9-c5c9-4cb5-ac59-b502f80d89e6';
const SECRET_KEY = '777cb628-a875-4e66-b197-c5416a51bf35';

// In-memory token store: token → expiry timestamp
const tokens = new Map();

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEPOSIT_WEBHOOK_DELAY_MS = Number(process.env.PAYONEX_DEPOSIT_WEBHOOK_DELAY_MS || 5000);
const WITHDRAW_WEBHOOK_DELAY_MS = Number(process.env.PAYONEX_WITHDRAW_WEBHOOK_DELAY_MS || 5000);
const PAYONEX_WEBHOOK_URL = 'https://stadev-api.huayteenoi.com/payonex/webhook'; // Set this to your actual webhook URL if you want to receive callbacks

// ─── Auth Middleware ─────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  const auth = req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Missing Authorization header', code: '40100' });
  }
  const expiry = tokens.get(token);
  if (!expiry || Date.now() > expiry) {
    tokens.delete(token);
    return res.status(401).json({ success: false, message: 'Token invalid or expired', code: '40101' });
  }
  next();
};

// ─── Helper ──────────────────────────────────────────────────────────────────
const ok = (res, data, message = 'successfully') =>
  res.json({ success: true, message, code: '20000', data });

const fail = (res, message, code = '40000', status = 400) =>
  res.status(status).json({ success: false, message, code });

const postJson = (targetUrl, payload) => new Promise((resolve, reject) => {
  try {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const data = JSON.stringify(payload);
    const req = transport.request({
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let chunks = '';
      res.on('data', (chunk) => {
        chunks += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: chunks });
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  } catch (err) {
    reject(err);
  }
});

const buildWithdrawWebhookPayload = (tx, customer) => ({
  success: true,
  message: 'successfully',
  code: '20000',
  data: {
    uuid: tx.uuid,
    customerUuid: tx.customerUuid,
    channelName: 'MOCK_CHANNEL',
    merchantOrderId: tx.merchantOrderId,
    platformOrderId: tx.platformOrderId,
    accountName: customer ? customer.name : '',
    bankCode: customer ? customer.bankCode : '',
    accountNo: customer ? customer.accountNo : '',
    amount: tx.amount,
    fee: tx.fee,
    settleAmount: tx.settleAmount,
    type: tx.type,
    status: 'SUCCESS',
    referenceId: tx.referenceId || ''
  }
});

const buildDepositWebhookPayload = (tx, customer) => ({
  success: true,
  message: 'successfully',
  code: '20000',
  data: {
    uuid: tx.uuid,
    customerUuid: tx.customerUuid,
    channelName: 'MOCK_CHANNEL',
    merchantOrderId: tx.merchantOrderId,
    platformOrderId: tx.platformOrderId,
    accountName: customer ? customer.name : '',
    bankCode: customer ? customer.bankCode : '',
    accountNo: customer ? customer.accountNo : '',
    amount: tx.amount,
    fee: tx.fee,
    settleAmount: tx.settleAmount,
    type: tx.type,
    status: 'SUCCESS',
    referenceId: tx.referenceId || ''
  }
});

const sendWithdrawWebhookIfConfigured = async (tx, customer, callbackUrl) => {
  const destination = callbackUrl || PAYONEX_WEBHOOK_URL;
  if (!destination) {
    return { sent: false, reason: 'callbackUrl and PAYONEX_WEBHOOK_URL are not configured' };
  }

  const payload = buildWithdrawWebhookPayload(tx, customer);
  console.log('[OUTGOING WEBHOOK][PAYONEX][WITHDRAW]', JSON.stringify({
    destination,
    tx_uuid: tx.uuid,
    payload
  }));

  const result = await postJson(destination, payload);
  return { sent: true, destination, result };
};

const sendDepositWebhookIfConfigured = async (tx, customer, callbackUrl) => {
  const destination = callbackUrl || PAYONEX_WEBHOOK_URL;
  if (!destination) {
    return { sent: false, reason: 'callbackUrl and PAYONEX_WEBHOOK_URL are not configured' };
  }

  const payload = buildDepositWebhookPayload(tx, customer);
  console.log('[OUTGOING WEBHOOK][PAYONEX][DEPOSIT]', JSON.stringify({
    destination,
    tx_uuid: tx.uuid,
    payload
  }));

  const result = await postJson(destination, payload);
  return { sent: true, destination, result };
};

const scheduleDepositAutoComplete = (txUuid, callbackUrl) => {
  setTimeout(() => {
    db.findTransactionByUuid(txUuid, (findErr, tx) => {
      if (findErr || !tx) {
        console.warn('[DEPOSIT AUTO COMPLETE] transaction not found', txUuid);
        return;
      }

      if (tx.status === 'SUCCESS') {
        return;
      }

      db.updateTransactionStatus(txUuid, 'SUCCESS', (updateErr) => {
        if (updateErr) {
          console.warn('[DEPOSIT AUTO COMPLETE] update status failed', txUuid, updateErr.message);
          return;
        }

        db.updateMerchantBalance(tx.settleAmount, () => {});

        db.findCustomerByUuid(tx.customerUuid, async (customerErr, customer) => {
          if (customerErr) {
            console.warn('[DEPOSIT WEBHOOK] find customer failed', txUuid, customerErr.message);
            return;
          }

          try {
            const webhookResult = await sendDepositWebhookIfConfigured({ ...tx, status: 'SUCCESS' }, customer, callbackUrl);
            console.log('[DEPOSIT WEBHOOK RESULT]', JSON.stringify({ tx_uuid: txUuid, ...webhookResult }));
          } catch (webhookErr) {
            console.warn('[DEPOSIT WEBHOOK ERROR]', txUuid, webhookErr.message);
          }
        });
      });
    });
  }, DEPOSIT_WEBHOOK_DELAY_MS);
};

const scheduleWithdrawAutoComplete = (txUuid, callbackUrl) => {
  setTimeout(() => {
    db.findTransactionByUuid(txUuid, (findErr, tx) => {
      if (findErr || !tx) {
        console.warn('[WITHDRAW AUTO COMPLETE] transaction not found', txUuid);
        return;
      }

      if (tx.status === 'SUCCESS') {
        return;
      }

      db.updateTransactionStatus(txUuid, 'SUCCESS', (updateErr) => {
        if (updateErr) {
          console.warn('[WITHDRAW AUTO COMPLETE] update status failed', txUuid, updateErr.message);
          return;
        }

        db.findCustomerByUuid(tx.customerUuid, async (customerErr, customer) => {
          if (customerErr) {
            console.warn('[WITHDRAW WEBHOOK] find customer failed', txUuid, customerErr.message);
            return;
          }

          try {
            const webhookResult = await sendWithdrawWebhookIfConfigured({ ...tx, status: 'SUCCESS' }, customer, callbackUrl);
            console.log('[WITHDRAW WEBHOOK RESULT]', JSON.stringify({ tx_uuid: txUuid, ...webhookResult }));
          } catch (webhookErr) {
            console.warn('[WITHDRAW WEBHOOK ERROR]', txUuid, webhookErr.message);
          }
        });
      });
    });
  }, WITHDRAW_WEBHOOK_DELAY_MS);
};

// ─── Bank code list ──────────────────────────────────────────────────────────
const BANK_CODES = [
  { bank_code: 'KBANK', bank_name_th: 'ธนาคารกสิกรไทย', bank_name_en: 'Kasikorn Bank' },
  { bank_code: 'SCB', bank_name_th: 'ธนาคารไทยพาณิชย์', bank_name_en: 'Siam Commercial Bank' },
  { bank_code: 'BBL', bank_name_th: 'ธนาคารกรุงเทพ', bank_name_en: 'Bangkok Bank' },
  { bank_code: 'KTB', bank_name_th: 'ธนาคารกรุงไทย', bank_name_en: 'Krungthai Bank' },
  { bank_code: 'BAY', bank_name_th: 'ธนาคารกรุงศรีอยุธยา', bank_name_en: 'Bank of Ayudhya' },
  { bank_code: 'TMB', bank_name_th: 'ธนาคารทีเอ็มบีธนชาต', bank_name_en: 'TMB Thanachart Bank' },
  { bank_code: 'GSB', bank_name_th: 'ธนาคารออมสิน', bank_name_en: 'Government Savings Bank' },
  { bank_code: 'BAAC', bank_name_th: 'ธนาคารเพื่อการเกษตรและสหกรณ์', bank_name_en: 'Bank for Agriculture and Agricultural Cooperatives' },
  { bank_code: 'UOB', bank_name_th: 'ธนาคารยูโอบี', bank_name_en: 'United Overseas Bank' },
  { bank_code: 'CIMB', bank_name_th: 'ธนาคารซีไอเอ็มบี ไทย', bank_name_en: 'CIMB Thai Bank' },
];

// ════════════════════════════════════════════════════════════════════════════
// 1. AUTHENTICATION
// ════════════════════════════════════════════════════════════════════════════

// POST /authenticate
app.post('/authenticate', (req, res) => {
  const { accessKey, secretKey } = req.body || {};
  if (!accessKey || !secretKey) {
    return fail(res, 'accessKey and secretKey are required', '40001');
  }
  if (accessKey !== ACCESS_KEY || secretKey !== SECRET_KEY) {
    return res.status(400).json({ success: false, code: '40502', data: 'Credential not found' });
  }
  const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  ok(res, { token });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. CUSTOMERS
// ════════════════════════════════════════════════════════════════════════════

// POST /v2/customers
app.post('/v2/customers', requireAuth, (req, res) => {
  const { name, bankCode, accountNo } = req.body || {};
  const missing = ['name', 'bankCode', 'accountNo'].filter(k => !req.body[k]);
  if (missing.length > 0) {
    return fail(res, `Missing required fields: ${missing.join(', ')}`, '40001');
  }
  db.createCustomer({ name, bankCode, accountNo }, (err, customer) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    ok(res, {
      partner: customer.partner,
      customerUuid: customer.uuid,
      clientCode: customer.clientCode,
      name: customer.name,
      searchName: [customer.name],
      accountNo: customer.accountNo,
      bankCode: customer.bankCode,
      status: customer.status,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    });
  });
});

// PUT /customers/:uuid/status
app.put('/customers/:uuid/status', requireAuth, (req, res) => {
  const { uuid } = req.params;
  const { status } = req.body || {};
  if (!status || !['SUCCESS', 'BLOCK'].includes(status)) {
    return fail(res, 'status must be SUCCESS or BLOCK', '40001');
  }
  db.findCustomerByUuid(uuid, (err, customer) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    if (!customer) return fail(res, 'Customer not found', '40400', 400);
    db.updateCustomerStatus(uuid, status, (err2) => {
      if (err2) return fail(res, 'Internal error', '50000', 500);
      ok(res, {
        partner: customer.partner,
        customerUuid: customer.uuid,
        clientCode: customer.clientCode,
        name: customer.name,
        searchName: [customer.name],
        accountNo: customer.accountNo,
        bankCode: customer.bankCode,
        status,
        createdAt: customer.createdAt,
        updatedAt: Date.now()
      });
    });
  });
});

// PUT /v2/customers/:uuid
app.put('/v2/customers/:uuid', requireAuth, (req, res) => {
  const { uuid } = req.params;
  const { name, bankCode, accountNo } = req.body || {};
  const missing = ['name', 'bankCode', 'accountNo'].filter(k => !req.body[k]);
  if (missing.length > 0) {
    return fail(res, `Missing required fields: ${missing.join(', ')}`, '40001');
  }
  db.findCustomerByUuid(uuid, (err, customer) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    if (!customer) return fail(res, 'Customer not found', '40400', 400);
    db.updateCustomerInfo(uuid, { name, bankCode, accountNo }, (err2) => {
      if (err2) return fail(res, 'Internal error', '50000', 500);
      const now = Date.now();
      ok(res, {
        partner: customer.partner,
        customerUuid: customer.uuid,
        clientCode: customer.clientCode,
        name,
        searchName: [name],
        accountNo,
        bankCode,
        status: customer.status,
        createdAt: customer.createdAt,
        updatedAt: now
      });
    });
  });
});

// GET /customers/options/bank-codes
app.get('/customers/options/bank-codes', (req, res) => {
  ok(res, BANK_CODES);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. MERCHANT
// ════════════════════════════════════════════════════════════════════════════

// GET /profile/balance
app.get('/profile/balance', requireAuth, (req, res) => {
  db.getMerchant((err, merchant) => {
    if (err || !merchant) return fail(res, 'Internal error', '50000', 500);
    ok(res, { balance: merchant.balance, settleBalance: merchant.settleBalance });
  });
});

// PUT /profile/settings
app.put('/profile/settings', requireAuth, (req, res) => {
  const { minDeposit, maxWithdraw } = req.body || {};
  if (minDeposit === undefined || maxWithdraw === undefined) {
    return fail(res, 'minDeposit and maxWithdraw are required', '40001');
  }
  if (minDeposit < 20 || minDeposit > 1000000) {
    return fail(res, 'minDeposit must be between 20 and 1000000', '40001');
  }
  if (maxWithdraw < 100 || maxWithdraw > 1000000) {
    return fail(res, 'maxWithdraw must be between 100 and 1000000', '40001');
  }
  db.updateMerchantSettings(minDeposit, maxWithdraw, (err) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    db.getMerchant((err2, merchant) => {
      if (err2 || !merchant) return fail(res, 'Internal error', '50000', 500);
      ok(res, {
        partner: merchant.partner,
        clientCode: merchant.clientCode,
        minDeposit: merchant.minDeposit,
        maxWithdraw: merchant.maxWithdraw
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. TRANSACTIONS (Statements)
// ════════════════════════════════════════════════════════════════════════════

// GET /transactions?page=1&size=10&filter=
app.get('/transactions', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const size = parseInt(req.query.size) || 10;
  const filter = req.query.filter || '';
  db.listTransactions(page, size, filter, (err, result) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    ok(res, result);
  });
});

// GET /transactions/:uuid  (must be before /transactions/:uuid/status)
app.get('/transactions/:uuid', requireAuth, (req, res) => {
  db.findTransactionByUuid(req.params.uuid, (err, tx) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    if (!tx) return fail(res, 'Transaction not found', '40400', 400);
    ok(res, tx);
  });
});

// PUT /transactions/:uuid/status
app.put('/transactions/:uuid/status', requireAuth, (req, res) => {
  const { uuid } = req.params;
  const { status } = req.body || {};
  if (!status || !['SUCCESS', 'REJECTED'].includes(status)) {
    return fail(res, 'status must be SUCCESS or REJECTED', '40001');
  }
  db.findTransactionByUuid(uuid, (err, tx) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    if (!tx) return fail(res, 'Transaction not found', '40400', 400);
    if (tx.status !== 'ON_HOLD') {
      return fail(res, 'Transaction is not in ON_HOLD status', '40002');
    }
    db.updateTransactionStatus(uuid, status, (err2) => {
      if (err2) return fail(res, 'Internal error', '50000', 500);
      // Add credit to merchant if approved
      if (status === 'SUCCESS') {
        db.updateMerchantBalance(tx.settleAmount, () => {});
      }
      ok(res, { ...tx, status, updatedAt: Date.now() });
    });
  });
});

// POST /transactions/:uuid/refund
app.post('/transactions/:uuid/refund', requireAuth, (req, res) => {
  const { uuid } = req.params;
  db.findTransactionByUuid(uuid, (err, tx) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    if (!tx) return fail(res, 'Transaction not found', '40400', 400);
    if (tx.status !== 'REJECTED') {
      return fail(res, 'Transaction must be in REJECTED status to refund', '40002');
    }
    db.findCustomerByUuid(tx.customerUuid, (err2, customer) => {
      if (err2) return fail(res, 'Internal error', '50000', 500);
      db.updateTransactionStatus(uuid, 'REFUNDED', (err3) => {
        if (err3) return fail(res, 'Internal error', '50000', 500);
        ok(res, {
          uuid: tx.uuid,
          status: 'REFUNDED',
          refundInfo: {
            accountNo: customer ? customer.accountNo : '',
            bankCode: customer ? customer.bankCode : '',
            bankName: customer
              ? (BANK_CODES.find(b => b.bank_code === customer.bankCode) || {})
              : {}
          }
        });
      });
    });
  });
});

// POST /transactions/deposit/request  (Payin)
app.post('/transactions/deposit/request', requireAuth, (req, res) => {
  const { customerUuid, amount, referenceId, note, remark, callbackUrl } = req.body || {};
  if (!customerUuid || !amount) {
    return fail(res, 'customerUuid and amount are required', '40001');
  }
  db.findCustomerByUuid(customerUuid, (err, customer) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    if (!customer) return fail(res, 'Customer not found', '40400', 400);
    if (customer.status === 'BLOCK') return fail(res, 'Customer is blocked', '40003');

    db.getMerchant((err2, merchant) => {
      if (err2 || !merchant) return fail(res, 'Internal error', '50000', 500);
      if (amount < merchant.minDeposit) {
        return fail(res, `Amount below minimum deposit of ${merchant.minDeposit}`, '40004');
      }
      db.createTransaction({ customerUuid, amount, type: 'deposit', referenceId, note, remark }, (err3, tx) => {
        if (err3) return fail(res, 'Internal error', '50000', 500);
        console.log('[DEPOSIT REQUEST RECEIVED]', JSON.stringify({
          tx_uuid: tx.uuid,
          customerUuid,
          amount,
          callbackUrl: callbackUrl || PAYONEX_WEBHOOK_URL || null
        }));
        scheduleDepositAutoComplete(tx.uuid, callbackUrl);
        const port = process.env.PORT || 3101;
        ok(res, {
          uuid: tx.uuid,
          link: `https://stadev-play.huayteenoi.com/pay/${tx.uuid}${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`,
          qrCode: tx.qrCode,
          qrBase64: 'data:image/png;base64,MOCK_QR_BASE64'
        });
      });
    });
  });
});

// POST /transactions/withdraw/request  (Payout)
app.post('/transactions/withdraw/request', requireAuth, (req, res) => {
  const { customerUuid, amount, referenceId, note, remark, callbackUrl } = req.body || {};
  if (!customerUuid || !amount) {
    return fail(res, 'customerUuid and amount are required', '40001');
  }
  db.findCustomerByUuid(customerUuid, (err, customer) => {
    if (err) return fail(res, 'Internal error', '50000', 500);
    if (!customer) return fail(res, 'Customer not found', '40400', 400);
    if (customer.status === 'BLOCK') return fail(res, 'Customer is blocked', '40003');

    db.getMerchant((err2, merchant) => {
      if (err2 || !merchant) return fail(res, 'Internal error', '50000', 500);
      if (amount > merchant.maxWithdraw) {
        return fail(res, `Amount exceeds maximum withdraw of ${merchant.maxWithdraw}`, '40005');
      }
      if (amount > merchant.balance) {
        return fail(res, 'Insufficient merchant balance', '40006');
      }
      db.createTransaction({ customerUuid, amount, type: 'withdraw', referenceId, note, remark }, (err3, tx) => {
        if (err3) return fail(res, 'Internal error', '50000', 500);
        // Deduct balance immediately on payout
        db.updateMerchantBalance(-amount, () => {});
        scheduleWithdrawAutoComplete(tx.uuid, callbackUrl);
        ok(res, { uuid: tx.uuid });
      });
    });
  });
});

// POST /transactions/upload-slip
app.post('/transactions/upload-slip', requireAuth, (req, res) => {
  const { base64 } = req.body || {};
  if (!base64) {
    return fail(res, 'base64 is required', '40001');
  }
  // Mock: accept any base64 and return success
  ok(res, { matched: true, message: 'Slip received and matched successfully' });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. PAYMENT PAGE (Mock redirect helper)
// ════════════════════════════════════════════════════════════════════════════

app.get('/pay/:uuid', (req, res) => {
  const { uuid } = req.params;
  const callbackUrl = req.query.callbackUrl;
  db.findTransactionByUuid(uuid, (err, tx) => {
    if (err || !tx) {
      return res.status(404).send('<h2>Payment not found</h2>');
    }
    res.send(`
      <!DOCTYPE html>
      <html lang="th">
      <head><meta charset="UTF-8"><title>PayoneX Mock Payment</title>
      <style>body{font-family:sans-serif;max-width:400px;margin:60px auto;padding:20px;border:1px solid #ddd;border-radius:8px;text-align:center}</style>
      </head>
      <body>
        <h2>PayoneX Mock Payment</h2>
        <p>Transaction: <code>${tx.uuid}</code></p>
        <p>Amount: <strong>${tx.amount} THB</strong></p>
        <p>Status: <strong>${tx.status}</strong></p>
        <form method="POST" action="/pay/${uuid}/confirm${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}">
          <button type="submit" style="padding:10px 30px;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer;font-size:16px">
            ยืนยันการโอน (Mock)
          </button>
        </form>
      </body>
      </html>
    `);
  });
});

app.post('/pay/:uuid/confirm', (req, res) => {
  const { uuid } = req.params;
  const callbackUrl = req.query.callbackUrl;
  db.findTransactionByUuid(uuid, (err, tx) => {
    if (err || !tx) return res.status(404).send('Not found');
    if (tx.status === 'SUCCESS') {
      return res.send(`<h2>Payment Already Confirmed</h2><p>Transaction ${uuid} is already SUCCESS</p>`);
    }
    db.updateTransactionStatus(uuid, 'SUCCESS', (err2) => {
      if (err2) return res.status(500).send('Error');
      db.updateMerchantBalance(tx.settleAmount, () => {});
      db.findCustomerByUuid(tx.customerUuid, async (customerErr, customer) => {
        if (customerErr) {
          console.warn('[DEPOSIT WEBHOOK] find customer failed', uuid, customerErr.message);
          return res.send(`<h2>Payment Confirmed ✓</h2><p>Transaction ${uuid} marked as SUCCESS</p>`);
        }

        try {
          const webhookResult = await sendDepositWebhookIfConfigured({ ...tx, status: 'SUCCESS' }, customer, callbackUrl);
          console.log('[DEPOSIT WEBHOOK RESULT]', JSON.stringify({ tx_uuid: uuid, ...webhookResult }));
        } catch (webhookErr) {
          console.warn('[DEPOSIT WEBHOOK ERROR]', uuid, webhookErr.message);
        }

        return res.send(`<h2>Payment Confirmed ✓</h2><p>Transaction ${uuid} marked as SUCCESS</p>`);
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. WEBHOOK RECEIVER (รับ callback จาก PayoneX จริง หรือ simulate)
// ════════════════════════════════════════════════════════════════════════════

app.post('/payonex/webhook', (req, res) => {
  const payload = req.body;
  console.log('[Webhook received]', JSON.stringify(payload, null, 2));
  // Store transaction if data is present
  if (payload && payload.data && payload.data.uuid) {
    const d = payload.data;
    // Upsert the transaction from webhook
    db.findTransactionByUuid(d.uuid, (err, existing) => {
      if (!existing) {
        // Try to create from webhook data
        db.createTransaction({
          customerUuid: d.customerUuid || '',
          amount: d.amount || 0,
          type: d.type || 'deposit',
          referenceId: d.referenceId || ''
        }, (err2, tx) => {
          if (tx) {
            db.updateTransactionStatus(tx.uuid, d.status || 'SUCCESS', () => {});
          }
        });
      } else {
        db.updateTransactionStatus(d.uuid, d.status || existing.status, () => {});
      }
    });
  }
  res.json({ success: true, message: 'webhook received', code: '20000' });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found', code: '40400' }));

// ─── Start ────────────────────────────────────────────────────────────────────
db.init();
const PORT = process.env.PORT || 3101;
app.listen(PORT, () => {
  console.log(`Mock PayoneX API running on port ${PORT}`);
  console.log(`  POST http://localhost:${PORT}/authenticate`);
  console.log(`  POST http://localhost:${PORT}/v2/customers`);
  console.log(`  GET  http://localhost:${PORT}/transactions`);
  console.log(`  POST http://localhost:${PORT}/transactions/deposit/request`);
  console.log(`  POST http://localhost:${PORT}/transactions/withdraw/request`);
  console.log(`  POST http://localhost:${PORT}/payonex/webhook`);
});
