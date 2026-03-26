const express = require('express');
const http = require('http');
const https = require('https');
const autobankDb = require('./autobankDb');
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(express.json());


// Middleware ตรวจสอบ header
const API_KEY = '1DE8FEF2BFE950C1B5B5ACF9506C418B222DE75D3B3406F84AAEAC56E9B2BB4B';
const MERCHANT_ID = 'EXT-2026-A4AF29964BC3';
const AUTOBANK_WITHDRAW_WEBHOOK_DELAY_MS = Number(process.env.AUTOBANK_WITHDRAW_WEBHOOK_DELAY_MS || 5000);
const AUTOBANK_WITHDRAW_WEBHOOK_URL = 'https://api.gametester.win/autobank/webhook'; // Set this to your actual webhook URL if you want to receive callbacks
app.use((req, res, next) => {
  // ไม่ตรวจสอบ favicon
  if (req.path === '/favicon.ico') return next();
  const apiKey = req.header('X-API-Key');
  const merchantId = req.header('X-Merchant-ID');
  if (!apiKey || !merchantId) {
    return res.status(401).json({ status: 'error', message: 'Missing authentication headers' });
  }
  if (apiKey !== API_KEY || merchantId !== MERCHANT_ID) {
    return res.status(403).json({ status: 'error', message: 'Invalid API key or merchant ID' });
  }
  next();
});

const postJson = (targetUrl, payload) => new Promise((resolve, reject) => {
  try {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const request = transport.request({
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      let chunks = '';
      response.on('data', (chunk) => {
        chunks += chunk;
      });
      response.on('end', () => {
        resolve({ statusCode: response.statusCode, body: chunks });
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  } catch (error) {
    reject(error);
  }
});

const buildWithdrawalWebhookPayload = (payout) => ({
  trace_id: payout.trace_id,
  withdraw_auto_id: payout.withdraw_auto_id,
  status: 'success',
  amount: payout.amount,
  member_username: payout.custom_username,
  message: 'Withdrawal completed successfully'
});

const sendWithdrawalWebhookIfConfigured = async (payout, callbackUrl) => {
  const destination = callbackUrl || AUTOBANK_WITHDRAW_WEBHOOK_URL;
  if (!destination) {
    return { sent: false, reason: 'callback_url and AUTOBANK_WITHDRAW_WEBHOOK_URL are not configured' };
  }

  const payload = buildWithdrawalWebhookPayload(payout);
  console.log('[OUTGOING WEBHOOK][AUTOBANK][WITHDRAWAL]', JSON.stringify({
    destination,
    trace_id: payout.trace_id,
    payload
  }));

  const result = await postJson(destination, payload);
  return { sent: true, destination, result };
};

const schedulePayoutAutoComplete = (payout, callbackUrl) => {
  setTimeout(() => {
    autobankDb.updatePayoutStatus(payout.trace_id, 'success', async (statusErr) => {
      if (statusErr) {
        console.warn('[PAYOUT AUTO COMPLETE] update payout status failed', payout.trace_id, statusErr.message);
        return;
      }

      try {
        const webhookResult = await sendWithdrawalWebhookIfConfigured({ ...payout, status: 'success' }, callbackUrl);
        console.log('[PAYOUT WEBHOOK RESULT]', JSON.stringify({ trace_id: payout.trace_id, ...webhookResult }));
      } catch (webhookErr) {
        console.warn('[PAYOUT WEBHOOK ERROR]', payout.trace_id, webhookErr.message);
      }
    });
  }, AUTOBANK_WITHDRAW_WEBHOOK_DELAY_MS);
};

// 1. Connection Test
app.get('/api/v2/autobank/me', (req, res) => res.json({ status: 'success', message: 'connect success' }));

// 2. Customer Management
app.post('/api/v2/autobank/customer/create', (req, res) => {

  console.log({ body: req.body });

  const required = ["member_username", "member_name", "member_bank", "member_accid"];
  const missing = required.filter(k => !req.body[k]);
  if (missing.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: { missing }
    });
  }
  autobankDb.findCustomerByIdentity({
    member_username: req.body.member_username,
    member_name: req.body.member_name,
    member_bank: req.body.member_bank,
    member_accid: req.body.member_accid,
    member_tmnid: req.body.member_tmnid || null
  }, (err, row) => {

    console.log({ err, row });


    if (err) return res.status(500).json({ status: "error", message: "DB error", errors: err });
    if (row) {
      return res.json({ status: "error", message: "Customer already exists" });
    }
    const member_bank_id = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
    const customer = {
      member_bank_id,
      member_username: req.body.member_username,
      member_name: req.body.member_name,
      member_bank: req.body.member_bank,
      member_accid: req.body.member_accid,
      member_tmnid: req.body.member_tmnid || null,
      balance: 0
    };
    autobankDb.addCustomer(customer, (err2, data) => {
      if (err2) {
        if (err2.code === "SQLITE_CONSTRAINT") {
          return res.json({ status: "error", message: "Customer already exists (member_username)" });
        }
        return res.status(500).json({ status: "error", message: "DB error", errors: err2 });
      }
      const resp = {
        status: "success",
        message: "Customer created successfully",
        data: {
          member_bank_id: data.member_bank_id,
          custom_username: data.member_username,
          member_name: data.member_name,
          member_bank: data.member_bank,
          member_accid: data.member_accid,
          balance: 0
        }
      };
      if (data.member_tmnid) resp.data.member_tmnid = data.member_tmnid;

      console.log({ resp });
      res.json(resp);
    });
  });
});

// 3. Bank Account Management
app.post('/api/v2/autobank/register', (req, res) => {
  const required = ["system", "bank_type", "agent_type", "agent_bank", "agent_accid", "agent_accname", "agent_userbank", "agent_passbank", "mobile_no"];
  const missing = required.filter(k => !req.body[k]);
  if (missing.length > 0) {
    return res.status(400).json({ status: "error", message: "Validation failed", errors: { missing } });
  }
  // Add to merchant_banks
  const bank = {
    bank_type: req.body.bank_type,
    agent_bank: req.body.agent_bank,
    is_deposit: req.body.agent_type === "deposit" || req.body.agent_type === "all" ? 1 : 0,
    is_withdraw: req.body.agent_type === "withdraw" || req.body.agent_type === "all" ? 1 : 0,
    accid: req.body.agent_accid,
    accname: req.body.agent_accname,
    mobile: req.body.mobile_no,
    balance: 0
  };
  autobankDb.addMerchantBank(bank, (err, data) => {
    if (err) return res.status(500).json({ status: "error", message: "DB error", errors: err });
    res.json({
      status: "success",
      message: "Bank account registered successfully",
      data: {
        bank_id: data.bank_id,
        payment_id: data.payment_id,
        payment_auth_token: data.payment_auth_token,
        auth_ip: "143.198.216.122",
        message: "Account already registered and activated"
      }
    });
  });
});


app.get('/api/v2/autobank/list', (req, res) => {
  autobankDb.listMerchantBanks((err, rows) => {
    if (err) return res.status(500).json({ status: "error", message: "DB error", errors: err });
    res.json({
      status: "success",
      message: "Bank accounts retrieved successfully",
      data: rows,
      meta: {
        current_page: 1,
        last_page: 1,
        per_page: 25,
        total: rows.length
      }
    });
  });
});


app.put('/api/v2/autobank/update', (req, res) => {
  const { bank_id, agent_accname, mobile_no } = req.body;
  if (!bank_id || !agent_accname || !mobile_no) {
    return res.status(400).json({ status: "error", message: "Validation failed", errors: { missing: [!bank_id ? "bank_id" : null, !agent_accname ? "agent_accname" : null, !mobile_no ? "mobile_no" : null].filter(Boolean) } });
  }
  autobankDb.updateMerchantBank(bank_id, { accname: agent_accname, mobile: mobile_no }, (err, changes) => {
    if (err) return res.status(500).json({ status: "error", message: "DB error", errors: err });
    if (changes === 0) return res.status(404).json({ status: "error", message: "Bank account not found" });
    res.json({ status: "success", message: "Bank account updated successfully" });
  });
});


app.delete('/api/v2/autobank/delete', (req, res) => {
  const { bank_id } = req.body;
  if (!bank_id) return res.status(400).json({ status: "error", message: "Validation failed", errors: { missing: ["bank_id"] } });
  autobankDb.deleteMerchantBank(bank_id, (err, changes) => {
    if (err) return res.status(500).json({ status: "error", message: "DB error", errors: err });
    if (changes === 0) return res.status(404).json({ status: "error", message: "Bank account not found" });
    res.json({ status: "success", message: "Bank account deleted successfully" });
  });
});

// 5. Webhook Notifications
app.post('/webhook/deposit', (req, res) => {
  // รับ payload deposit แล้วบันทึกลง db
  const required = ["deposit_id", "status", "amount", "member_username", "bank", "account_id", "transaction_date", "create_date"];
  const missing = required.filter(k => !req.body[k]);
  if (missing.length > 0) {
    return res.status(400).json({ status: "error", message: "Validation failed", errors: { missing } });
  }
  autobankDb.addDeposit(req.body, (err, data) => {
    if (err) return res.status(500).json({ status: "error", message: "DB error", errors: err });
    autobankDb.updateCustomerBalance(req.body.member_username, req.body.amount, (err2) => {
      if (err2) return res.status(500).json({ status: "error", message: "DB error", errors: err2 });
      res.json(data);
    });
  });
});

app.post('/webhook/withdrawal', (req, res) => {
  // รับ payload withdrawal แล้วตอบกลับ (mock ไม่บันทึก)
  res.json(req.body);
});

// 6. Check Deposit Status
app.post('/api/v2/autobank/payout', (req, res) => {
  const { merchant_bank_id, custom_username, amount, callback_url } = req.body;
  if (!merchant_bank_id || !custom_username || !amount) {
    return res.status(400).json({ status: "error", message: "Validation failed", errors: { missing: [!merchant_bank_id ? "merchant_bank_id" : null, !custom_username ? "custom_username" : null, !amount ? "amount" : null].filter(Boolean) } });
  }
  autobankDb.findCustomerByUsername(custom_username, (err, customer) => {
    if (err) return res.status(500).json({ status: "error", message: "DB error", errors: err });
    if (!customer) return res.json({ status: "error", message: "Customer not found for this merchant" });
    // Simulate payout
    const trace_id = uuidv4();
    const withdraw_auto_id = Math.floor(Math.random() * 100000);
    const payout = {
      trace_id,
      withdraw_auto_id,
      status: "pending",
      merchant_bank_id,
      custom_username,
      amount
    };
    autobankDb.updateCustomerBalance(custom_username, -amount, (err2) => {
      if (err2) return res.status(500).json({ status: "error", message: "DB error", errors: err2 });
      autobankDb.addPayout(payout, (err3) => {
        if (err3) return res.status(500).json({ status: "error", message: "DB error", errors: err3 });
        schedulePayoutAutoComplete(payout, callback_url);
        res.json({
          status: "success",
          message: "Withdrawal initiated",
          data: { trace_id, withdraw_auto_id, status: "pending" }
        });
      });
    });
  });
});

// 7. Default error
app.use((req, res) => res.status(404).json({ status: "error", message: "Not found" }));

autobankDb.init();
const PORT = process.env.PORT || 3100;
app.listen(PORT, () => console.log(`Mock Autobank API running on port ${PORT}`));
