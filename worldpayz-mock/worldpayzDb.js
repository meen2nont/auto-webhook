const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'worldpayz.db');
const db = new sqlite3.Database(dbPath);
const BASE_TREASURY_THB = 100000;

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizePayment = (row) => {
  if (!row) return null;
  return {
    ...row,
    additional_data: parseJson(row.additional_data, {}),
    payer_pay_network_fee: Boolean(row.payer_pay_network_fee),
    is_completed: Boolean(row.is_completed)
  };
};

const normalizeWithdrawal = (row) => {
  if (!row) return null;
  return {
    ...row,
    fx_rate: parseJson(row.fx_rate, {}),
    exchange_rate_raw: parseJson(row.exchange_rate_raw, null),
    callback_data: parseJson(row.callback_data, null),
    request_data: parseJson(row.request_data, null),
    response_data: parseJson(row.response_data, null),
    transfer_payloads: parseJson(row.transfer_payloads, null),
    additional: parseJson(row.additional, {}),
    transaction_history: parseJson(row.transaction_history, []),
    is_settlement: Boolean(row.is_settlement)
  };
};

const normalizeMerchant = (row) => {
  if (!row) return null;
  return {
    ...row,
    is_active: Boolean(row.is_active),
    metadata: parseJson(row.metadata, {})
  };
};

const init = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      merchant_code TEXT UNIQUE,
      name TEXT,
      provider TEXT,
      bank_code TEXT,
      bank_account_number TEXT,
      bank_account_name TEXT,
      callback_url TEXT,
      webhook_secret TEXT,
      api_key TEXT,
      secret_key TEXT,
      is_active INTEGER DEFAULT 1,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      seq_num INTEGER,
      source_id TEXT,
      order_id TEXT UNIQUE,
      order_user_reference TEXT,
      order_display_mode TEXT,
      payment_method_type TEXT,
      payment_provider TEXT,
      invoice_type TEXT,
      from_currency TEXT,
      to_currency TEXT,
      chain TEXT,
      network TEXT,
      amount TEXT,
      payment_amount REAL,
      payer_pay_network_fee INTEGER DEFAULT 0,
      payer_bank_provider TEXT,
      payer_bank_account_number TEXT,
      payer_bank_account_name TEXT,
      payment_domain TEXT,
      payment_url TEXT,
      payment_qr TEXT,
      url_return TEXT,
      url_success TEXT,
      url_failed TEXT,
      additional_data TEXT,
      exchange_rate REAL,
      payment_status TEXT,
      payment_match_type TEXT,
      is_completed INTEGER DEFAULT 0,
      status TEXT,
      lifetime INTEGER,
      expired_at TEXT,
      cancelled_at TEXT,
      failed_reason TEXT,
      created_at TEXT,
      updated_at TEXT,
      webhook_sent_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions_fiat (
      id TEXT PRIMARY KEY,
      seq_num INTEGER,
      source_id TEXT,
      type TEXT,
      status TEXT,
      reference TEXT,
      currency TEXT,
      from_bank TEXT,
      from_address TEXT,
      from_name TEXT,
      to_bank TEXT,
      to_address TEXT,
      to_name TEXT,
      amount REAL,
      tx_date TEXT,
      detail TEXT,
      alt_text TEXT,
      tx_unix_time INTEGER,
      message_time INTEGER,
      fee REAL,
      fee_amount REAL,
      realized_amount REAL,
      payment_id TEXT UNIQUE,
      created_at TEXT,
      updated_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      seq_num INTEGER,
      source_id TEXT,
      unique_hash TEXT,
      order_id TEXT UNIQUE,
      order_user_reference TEXT,
      request_platform TEXT,
      request_ip TEXT,
      withdrawal_mode TEXT,
      receiver_bank TEXT,
      receiver_name TEXT,
      currency TEXT,
      address TEXT,
      amount TEXT,
      withdrawal_amount REAL,
      fee_model_type TEXT,
      fee REAL,
      fee_amount REAL,
      extra_fee_network REAL,
      realized_amount REAL,
      tx_value REAL,
      fx_rate TEXT,
      exchange_rate REAL,
      exchange_rate_raw TEXT,
      operator_id TEXT,
      operator_type TEXT,
      approved_at TEXT,
      completed_at TEXT,
      callback_url TEXT,
      callback_data TEXT,
      lifetime INTEGER,
      http_status INTEGER,
      request_data TEXT,
      response_data TEXT,
      whitelist_address_id TEXT,
      ebank_account_id TEXT,
      transfer_payloads TEXT,
      admin_notes TEXT,
      rejected_reason TEXT,
      additional TEXT,
      last_updated_by TEXT,
      last_updated_at TEXT,
      withdrawal_status TEXT,
      pending_transaction_id TEXT,
      is_settlement INTEGER DEFAULT 0,
      webhook_request_id TEXT,
      sequence_time TEXT,
      created_at TEXT,
      updated_at TEXT,
      organization_id TEXT,
      agent_id TEXT,
      transaction_history TEXT,
      status TEXT,
      transaction_reference TEXT
    )`);

    const now = new Date().toISOString();
    const seedCallbackUrl = process.env.WORLDPAYZ_WEBHOOK_URL || null;
    const seedWebhookSecret = process.env.WORLDPAYZ_WEBHOOK_SECRET || null;
    db.run(
      `INSERT OR IGNORE INTO merchants (
        id, merchant_code, name, provider, bank_code, bank_account_number,
        bank_account_name, callback_url, webhook_secret, api_key, secret_key,
        is_active, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'merchant-worldpayz-mock',
        'WPMOCK001',
        'Worldpayz Mock Merchant',
        'SCB',
        'SCB',
        '6123013742',
        'Worldpayz Mock Merchant',
        seedCallbackUrl,
        seedWebhookSecret,
        'WORLDPAYZ_MOCK_API_KEY',
        'WORLDPAYZ_MOCK_SECRET_KEY',
        1,
        JSON.stringify({ source: 'seed' }),
        now,
        now
      ]
    );

    db.run(
      `UPDATE merchants
       SET api_key = COALESCE(api_key, ?),
           secret_key = COALESCE(secret_key, ?),
           updated_at = ?
       WHERE merchant_code = 'WPMOCK001'`,
      ['WORLDPAYZ_MOCK_API_KEY', 'WORLDPAYZ_MOCK_SECRET_KEY', now]
    );

    if (seedCallbackUrl) {
      db.run(
        `UPDATE merchants SET callback_url = ?, updated_at = ? WHERE merchant_code = 'WPMOCK001'`,
        [seedCallbackUrl, now]
      );
    }
    if (seedWebhookSecret) {
      db.run(
        `UPDATE merchants SET webhook_secret = ?, updated_at = ? WHERE merchant_code = 'WPMOCK001'`,
        [seedWebhookSecret, now]
      );
    }
  });
};

const createPayment = (payment, cb) => {
  const stmt = db.prepare(`INSERT INTO payments (
    id, seq_num, source_id, order_id, order_user_reference, order_display_mode,
    payment_method_type, payment_provider, invoice_type, from_currency, to_currency,
    chain, network, amount, payment_amount, payer_pay_network_fee,
    payer_bank_provider, payer_bank_account_number, payer_bank_account_name,
    payment_domain, payment_url, payment_qr, url_return, url_success, url_failed,
    additional_data, exchange_rate, payment_status, payment_match_type, is_completed,
    status, lifetime, expired_at, cancelled_at, failed_reason, created_at, updated_at,
    webhook_sent_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  stmt.run(
    payment.id,
    payment.seq_num,
    payment.source_id,
    payment.order_id,
    payment.order_user_reference,
    payment.order_display_mode,
    payment.payment_method_type,
    payment.payment_provider,
    payment.invoice_type,
    payment.from_currency,
    payment.to_currency,
    payment.chain,
    payment.network,
    payment.amount,
    payment.payment_amount,
    payment.payer_pay_network_fee ? 1 : 0,
    payment.payer_bank_provider,
    payment.payer_bank_account_number,
    payment.payer_bank_account_name,
    payment.payment_domain,
    payment.payment_url,
    payment.payment_qr,
    payment.url_return,
    payment.url_success,
    payment.url_failed,
    JSON.stringify(payment.additional_data || {}),
    payment.exchange_rate,
    payment.payment_status,
    payment.payment_match_type,
    payment.is_completed ? 1 : 0,
    payment.status,
    payment.lifetime,
    payment.expired_at,
    payment.cancelled_at || null,
    payment.failed_reason || null,
    payment.created_at,
    payment.updated_at,
    payment.webhook_sent_at || null,
    function (err) {
      stmt.finalize();
      if (err) return cb(err);
      cb(null, payment);
    }
  );
};

const findPaymentById = (id, cb) => {
  db.get(`SELECT * FROM payments WHERE id = ?`, [id], (err, row) => cb(err, normalizePayment(row)));
};

const findPaymentByOrderId = (orderId, cb) => {
  db.get(`SELECT * FROM payments WHERE order_id = ?`, [orderId], (err, row) => cb(err, normalizePayment(row)));
};

const updatePaymentState = (id, state, cb) => {
  const fields = [];
  const params = [];
  Object.entries(state).forEach(([key, value]) => {
    fields.push(`${key} = ?`);
    params.push(value);
  });
  params.push(id);
  db.run(`UPDATE payments SET ${fields.join(', ')} WHERE id = ?`, params, function (err) {
    cb(err, this ? this.changes : 0);
  });
};

const createTransactionFromPayment = (payment, merchant, cb) => {
  const now = new Date().toISOString();
  const nowDate = new Date();
  const txDate = nowDate.toLocaleString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok'
  }).replace(',', '');
  const fee = 1.4;
  const feeAmount = Number((payment.payment_amount * fee / 100).toFixed(6));
  const realizedAmount = Number((payment.payment_amount - feeAmount).toFixed(6));
  const merchantBank = merchant?.bank_code || merchant?.provider || 'SCB';
  const merchantAccountNumber = merchant?.bank_account_number || '6123013742';
  const merchantName = merchant?.bank_account_name || merchant?.name || 'Worldpayz Mock Merchant';
  const tx = {
    id: uuidv4(),
    seq_num: Math.floor(Date.now() / 1000),
    source_id: 'payment',
    type: 'RECEIVE',
    status: 'COMPLETED',
    reference: payment.id,
    currency: payment.to_currency,
    from_bank: payment.payer_bank_provider,
    from_address: payment.payer_bank_account_number,
    from_name: payment.payer_bank_account_name,
    to_bank: merchantBank,
    to_address: merchantAccountNumber,
    to_name: merchantName,
    amount: payment.payment_amount,
    tx_date: txDate,
    detail: `เพิ่มเงินจากสลิป ${payment.payment_amount} บาท เข้าบัญชี ${merchantAccountNumber} วันที่/เวลา ${txDate}`,
    alt_text: `${payment.payment_amount}/${merchantAccountNumber}/${payment.to_currency}/${txDate}`,
    tx_unix_time: nowDate.getTime(),
    message_time: nowDate.getTime(),
    fee,
    fee_amount: feeAmount,
    realized_amount: realizedAmount,
    payment_id: payment.id,
    created_at: now,
    updated_at: now
  };

  const stmt = db.prepare(`INSERT INTO transactions_fiat (
    id, seq_num, source_id, type, status, reference, currency, from_bank,
    from_address, from_name, to_bank, to_address, to_name, amount, tx_date,
    detail, alt_text, tx_unix_time, message_time, fee, fee_amount,
    realized_amount, payment_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  stmt.run(
    tx.id,
    tx.seq_num,
    tx.source_id,
    tx.type,
    tx.status,
    tx.reference,
    tx.currency,
    tx.from_bank,
    tx.from_address,
    tx.from_name,
    tx.to_bank,
    tx.to_address,
    tx.to_name,
    tx.amount,
    tx.tx_date,
    tx.detail,
    tx.alt_text,
    tx.tx_unix_time,
    tx.message_time,
    tx.fee,
    tx.fee_amount,
    tx.realized_amount,
    tx.payment_id,
    tx.created_at,
    tx.updated_at,
    function (err) {
      stmt.finalize();
      if (err) return cb(err);
      cb(null, tx);
    }
  );
};

const findTransactionByPaymentId = (paymentId, cb) => {
  db.get(`SELECT * FROM transactions_fiat WHERE payment_id = ?`, [paymentId], cb);
};

const createWithdrawal = (withdrawal, cb) => {
  const stmt = db.prepare(`INSERT INTO withdrawals (
    id, seq_num, source_id, unique_hash, order_id, order_user_reference,
    request_platform, request_ip, withdrawal_mode, receiver_bank, receiver_name,
    currency, address, amount, withdrawal_amount, fee_model_type, fee,
    fee_amount, extra_fee_network, realized_amount, tx_value, fx_rate,
    exchange_rate, exchange_rate_raw, operator_id, operator_type, approved_at,
    completed_at, callback_url, callback_data, lifetime, http_status, request_data,
    response_data, whitelist_address_id, ebank_account_id, transfer_payloads,
    admin_notes, rejected_reason, additional, last_updated_by, last_updated_at,
    withdrawal_status, pending_transaction_id, is_settlement, webhook_request_id,
    sequence_time, created_at, updated_at, organization_id, agent_id,
    transaction_history, status, transaction_reference
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  stmt.run(
    withdrawal.id,
    withdrawal.seq_num,
    withdrawal.source_id,
    withdrawal.unique_hash,
    withdrawal.order_id,
    withdrawal.order_user_reference,
    withdrawal.request_platform,
    withdrawal.request_ip,
    withdrawal.withdrawal_mode,
    withdrawal.receiver_bank,
    withdrawal.receiver_name,
    withdrawal.currency,
    withdrawal.address,
    withdrawal.amount,
    withdrawal.withdrawal_amount,
    withdrawal.fee_model_type,
    withdrawal.fee,
    withdrawal.fee_amount,
    withdrawal.extra_fee_network,
    withdrawal.realized_amount,
    withdrawal.tx_value,
    JSON.stringify(withdrawal.fx_rate || {}),
    withdrawal.exchange_rate,
    JSON.stringify(withdrawal.exchange_rate_raw || null),
    withdrawal.operator_id,
    withdrawal.operator_type,
    withdrawal.approved_at,
    withdrawal.completed_at,
    withdrawal.callback_url,
    JSON.stringify(withdrawal.callback_data || null),
    withdrawal.lifetime,
    withdrawal.http_status,
    JSON.stringify(withdrawal.request_data || null),
    JSON.stringify(withdrawal.response_data || null),
    withdrawal.whitelist_address_id,
    withdrawal.ebank_account_id,
    JSON.stringify(withdrawal.transfer_payloads || null),
    withdrawal.admin_notes,
    withdrawal.rejected_reason,
    JSON.stringify(withdrawal.additional || {}),
    withdrawal.last_updated_by,
    withdrawal.last_updated_at,
    withdrawal.withdrawal_status,
    withdrawal.pending_transaction_id,
    withdrawal.is_settlement ? 1 : 0,
    withdrawal.webhook_request_id,
    withdrawal.sequence_time,
    withdrawal.created_at,
    withdrawal.updated_at,
    withdrawal.organization_id,
    withdrawal.agent_id,
    JSON.stringify(withdrawal.transaction_history || []),
    withdrawal.status,
    withdrawal.transaction_reference,
    function (err) {
      stmt.finalize();
      if (err) return cb(err);
      cb(null, withdrawal);
    }
  );
};

const findWithdrawalById = (id, cb) => {
  db.get(`SELECT * FROM withdrawals WHERE id = ?`, [id], (err, row) => cb(err, normalizeWithdrawal(row)));
};

const findWithdrawalByOrderId = (orderId, cb) => {
  db.get(`SELECT * FROM withdrawals WHERE order_id = ?`, [orderId], (err, row) => cb(err, normalizeWithdrawal(row)));
};

const listWithdrawals = (skip, take, cb) => {
  db.all(`SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT ? OFFSET ?`, [take, skip], (err, rows) => {
    if (err) return cb(err);
    db.get(`SELECT COUNT(*) AS total FROM withdrawals`, [], (countErr, countRow) => {
      if (countErr) return cb(countErr);
      cb(null, {
        rows: rows.map(normalizeWithdrawal),
        total: countRow.total
      });
    });
  });
};

const updateWithdrawalState = (id, state, cb) => {
  const fields = [];
  const params = [];
  Object.entries(state).forEach(([key, value]) => {
    fields.push(`${key} = ?`);
    if (['fx_rate', 'exchange_rate_raw', 'callback_data', 'request_data', 'response_data', 'transfer_payloads', 'additional', 'transaction_history'].includes(key)) {
      params.push(JSON.stringify(value));
    } else if (key === 'is_settlement') {
      params.push(value ? 1 : 0);
    } else {
      params.push(value);
    }
  });
  params.push(id);
  db.run(`UPDATE withdrawals SET ${fields.join(', ')} WHERE id = ?`, params, function (err) {
    cb(err, this ? this.changes : 0);
  });
};

const calculateLedger = (cb) => {
  db.get(`SELECT COALESCE(SUM(payment_amount), 0) AS total FROM payments WHERE status = 'SUCCESS'`, [], (paymentErr, paymentRow) => {
    if (paymentErr) return cb(paymentErr);
    db.get(`SELECT COALESCE(SUM(withdrawal_amount), 0) AS total FROM withdrawals WHERE status = 'COMPLETED'`, [], (completedErr, completedRow) => {
      if (completedErr) return cb(completedErr);
      db.get(`SELECT COALESCE(SUM(withdrawal_amount), 0) AS total FROM withdrawals WHERE status IN ('PENDING', 'APPROVED')`, [], (pendingErr, pendingRow) => {
        if (pendingErr) return cb(pendingErr);
        const incoming = Number(paymentRow.total || 0);
        const completed = Number(completedRow.total || 0);
        const frozen = Number(pendingRow.total || 0);
        const total = BASE_TREASURY_THB + incoming - completed;
        const available = total - frozen;
        cb(null, {
          available,
          freeze: frozen,
          total,
          incoming,
          completed,
          baseTreasury: BASE_TREASURY_THB
        });
      });
    });
  });
};

const listMerchants = (cb) => {
  db.all(`SELECT * FROM merchants ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return cb(err);
    cb(null, rows.map(normalizeMerchant));
  });
};

const findMerchantById = (id, cb) => {
  db.get(`SELECT * FROM merchants WHERE id = ?`, [id], (err, row) => cb(err, normalizeMerchant(row)));
};

const findMerchantByCode = (merchantCode, cb) => {
  db.get(`SELECT * FROM merchants WHERE merchant_code = ?`, [merchantCode], (err, row) => cb(err, normalizeMerchant(row)));
};

const findMerchantByApiKey = (apiKey, cb) => {
  db.get(`SELECT * FROM merchants WHERE api_key = ?`, [apiKey], (err, row) => cb(err, normalizeMerchant(row)));
};

const findActiveMerchant = (cb) => {
  db.get(`SELECT * FROM merchants WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`, [], (err, row) => cb(err, normalizeMerchant(row)));
};

const updateMerchant = (id, state, cb) => {
  const fields = [];
  const params = [];

  Object.entries(state).forEach(([key, value]) => {
    fields.push(`${key} = ?`);
    if (key === 'metadata') {
      params.push(JSON.stringify(value || {}));
    } else if (key === 'is_active') {
      params.push(value ? 1 : 0);
    } else {
      params.push(value);
    }
  });

  if (fields.length === 0) {
    return cb(null, 0);
  }

  params.push(id);
  db.run(`UPDATE merchants SET ${fields.join(', ')} WHERE id = ?`, params, function (err) {
    cb(err, this ? this.changes : 0);
  });
};

module.exports = {
  db,
  init,
  createPayment,
  findPaymentById,
  findPaymentByOrderId,
  updatePaymentState,
  createTransactionFromPayment,
  findTransactionByPaymentId,
  createWithdrawal,
  findWithdrawalById,
  findWithdrawalByOrderId,
  listWithdrawals,
  updateWithdrawalState,
  calculateLedger,
  listMerchants,
  findMerchantById,
  findMerchantByCode,
  findMerchantByApiKey,
  findActiveMerchant,
  updateMerchant
};

