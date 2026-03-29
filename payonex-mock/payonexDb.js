const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'payonex.db');
const db = new sqlite3.Database(dbPath);

const DEFAULT_DEPOSIT_FEE = 1.6;
const DEFAULT_WITHDRAW_FEE = 0;

const ensureMerchantFeeColumns = () => {
  db.all(`PRAGMA table_info(merchant)`, [], (err, columns) => {
    if (err) return;

    const columnNames = new Set((columns || []).map((column) => column.name));
    if (!columnNames.has('deposit_fee')) {
      db.run(`ALTER TABLE merchant ADD COLUMN deposit_fee REAL DEFAULT ${DEFAULT_DEPOSIT_FEE}`);
    }
    if (!columnNames.has('withdraw_fee')) {
      db.run(`ALTER TABLE merchant ADD COLUMN withdraw_fee REAL DEFAULT ${DEFAULT_WITHDRAW_FEE}`);
    }
  });
};

const init = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      partner TEXT,
      clientCode TEXT,
      name TEXT,
      accountNo TEXT,
      bankCode TEXT,
      status TEXT DEFAULT 'SUCCESS',
      createdAt INTEGER,
      updatedAt INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      partner TEXT,
      customerUuid TEXT,
      clientCode TEXT,
      type TEXT,
      settlement TEXT DEFAULT 'FALSE',
      reconcile TEXT DEFAULT 'FALSE',
      qrCode TEXT,
      status TEXT,
      amount REAL,
      currency TEXT DEFAULT 'THB',
      settleAmount REAL,
      settleCurrency TEXT DEFAULT 'THB',
      fee REAL,
      rate REAL,
      referenceId TEXT,
      merchantOrderId TEXT,
      platformOrderId TEXT,
      note TEXT,
      remark TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS merchant (
      id INTEGER PRIMARY KEY,
      partner TEXT,
      clientCode TEXT,
      balance REAL DEFAULT 100000,
      settleBalance REAL DEFAULT 100000,
      minDeposit REAL DEFAULT 100,
      maxWithdraw REAL DEFAULT 200000,
      deposit_fee REAL DEFAULT ${DEFAULT_DEPOSIT_FEE},
      withdraw_fee REAL DEFAULT ${DEFAULT_WITHDRAW_FEE}
    )`);

    ensureMerchantFeeColumns();

    // Seed merchant row if not exists
    db.get(`SELECT id FROM merchant WHERE id = 1`, [], (err, row) => {
      if (!row) {
        db.run(`INSERT INTO merchant (id, partner, clientCode, balance, settleBalance, minDeposit, maxWithdraw, deposit_fee, withdraw_fee)
                VALUES (1, 'PARTNER-MOCK', 'CLIENT-MOCK', 100000, 100000, 100, 200000, ?, ?)`,
        [DEFAULT_DEPOSIT_FEE, DEFAULT_WITHDRAW_FEE]);
      }
    });
  });
};

// --- Customers ---
const createCustomer = (data, cb) => {
  const now = Date.now();
  const uuid = uuidv4();
  db.run(
    `INSERT INTO customers (uuid, partner, clientCode, name, accountNo, bankCode, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid, 'PARTNER-MOCK', 'CLIENT-MOCK', data.name, data.accountNo, data.bankCode, 'SUCCESS', now, now],
    function (err) {
      if (err) return cb(err);
      cb(null, { uuid, partner: 'PARTNER-MOCK', clientCode: 'CLIENT-MOCK', name: data.name, accountNo: data.accountNo, bankCode: data.bankCode, status: 'SUCCESS', createdAt: now, updatedAt: now });
    }
  );
};

const findCustomerByUuid = (uuid, cb) => {
  db.get(`SELECT * FROM customers WHERE uuid = ?`, [uuid], cb);
};

const updateCustomerStatus = (uuid, status, cb) => {
  const now = Date.now();
  db.run(`UPDATE customers SET status = ?, updatedAt = ? WHERE uuid = ?`, [status, now, uuid], function (err) {
    cb(err, this ? this.changes : 0);
  });
};

const updateCustomerInfo = (uuid, data, cb) => {
  const now = Date.now();
  db.run(
    `UPDATE customers SET name = ?, bankCode = ?, accountNo = ?, updatedAt = ? WHERE uuid = ?`,
    [data.name, data.bankCode, data.accountNo, now, uuid],
    function (err) {
      cb(err, this ? this.changes : 0);
    }
  );
};

// --- Transactions ---
const resolveFeeRateForType = (type, feeRateOverride, cb) => {
  const parsedOverride = Number(feeRateOverride);
  if (Number.isFinite(parsedOverride)) {
    return cb(null, parsedOverride);
  }

  db.get(`SELECT deposit_fee, withdraw_fee FROM merchant WHERE id = 1`, [], (err, merchant) => {
    if (err) return cb(err);

    const merchantRate = type === 'deposit'
      ? Number(merchant && merchant.deposit_fee)
      : Number(merchant && merchant.withdraw_fee);
    const fallbackRate = type === 'deposit' ? DEFAULT_DEPOSIT_FEE : DEFAULT_WITHDRAW_FEE;

    cb(null, Number.isFinite(merchantRate) ? merchantRate : fallbackRate);
  });
};

const createTransaction = (data, cb) => {
  resolveFeeRateForType(data.type, data.feeRate, (feeErr, feeRate) => {
    if (feeErr) return cb(feeErr);

    const now = Date.now();
    const uuid = uuidv4();
    const merchantOrderId = uuidv4().replace(/-/g, '').toUpperCase().substring(0, 32);
    const platformOrderId = uuidv4();
    const amount = Number(data.amount);
    const fee = parseFloat(((amount * feeRate) / 100).toFixed(2));
    const settleAmount = data.type === 'deposit'
      ? parseFloat((amount - fee).toFixed(2))
      : parseFloat((amount + fee).toFixed(2));
    const qrCode = data.type === 'deposit'
      ? `00020101021229370016A000000677010111011300666374052005802TH53037645407${amount}6304MOCK`
      : null;

    db.run(
      `INSERT INTO transactions
       (uuid, partner, customerUuid, clientCode, type, settlement, reconcile, qrCode, status, amount, currency, settleAmount, settleCurrency, fee, rate, referenceId, merchantOrderId, platformOrderId, note, remark, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid, 'PARTNER-MOCK', data.customerUuid, 'CLIENT-MOCK', data.type, 'FALSE', 'FALSE', qrCode, 'PROCESSING', amount, 'THB', settleAmount, 'THB', fee, feeRate, data.referenceId || '', merchantOrderId, platformOrderId, data.note || '', data.remark || '', now, now],
      function (err) {
        if (err) return cb(err);
        cb(null, { uuid, partner: 'PARTNER-MOCK', customerUuid: data.customerUuid, clientCode: 'CLIENT-MOCK', type: data.type, settlement: 'FALSE', reconcile: 'FALSE', qrCode, status: 'PROCESSING', amount, currency: 'THB', settleAmount, settleCurrency: 'THB', fee, rate: feeRate, referenceId: data.referenceId || '', merchantOrderId, platformOrderId, note: data.note || '', remark: data.remark || '', createdAt: now, updatedAt: now });
      }
    );
  });
};

const findTransactionByUuid = (uuid, cb) => {
  db.get(`SELECT * FROM transactions WHERE uuid = ?`, [uuid], cb);
};

const listTransactions = (page, size, filter, cb) => {
  const offset = (page - 1) * size;
  let where = '';
  const params = [];
  if (filter) {
    where = `WHERE type = ? OR status = ? OR customerUuid = ?`;
    params.push(filter, filter, filter);
  }
  db.all(`SELECT * FROM transactions ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`, [...params, size, offset], (err, rows) => {
    if (err) return cb(err);
    db.get(`SELECT COUNT(*) as count FROM transactions ${where}`, params, (err2, countRow) => {
      if (err2) return cb(err2);
      const total = countRow.count;
      cb(null, { data: rows, count: total, totalPages: Math.ceil(total / size) });
    });
  });
};

const updateTransactionStatus = (uuid, status, cb) => {
  const now = Date.now();
  db.run(`UPDATE transactions SET status = ?, updatedAt = ? WHERE uuid = ?`, [status, now, uuid], function (err) {
    cb(err, this ? this.changes : 0);
  });
};

// --- Merchant ---
const getMerchant = (cb) => {
  db.get(`SELECT * FROM merchant WHERE id = 1`, [], cb);
};

const updateMerchantSettings = (settings, cb) => {
  const fields = [];
  const values = [];

  if (settings.minDeposit !== undefined) {
    fields.push(`minDeposit = ?`);
    values.push(settings.minDeposit);
  }
  if (settings.maxWithdraw !== undefined) {
    fields.push(`maxWithdraw = ?`);
    values.push(settings.maxWithdraw);
  }
  if (settings.depositFee !== undefined) {
    fields.push(`deposit_fee = ?`);
    values.push(settings.depositFee);
  }
  if (settings.withdrawFee !== undefined) {
    fields.push(`withdraw_fee = ?`);
    values.push(settings.withdrawFee);
  }

  if (!fields.length) {
    return cb(null, 0);
  }

  db.run(`UPDATE merchant SET ${fields.join(', ')} WHERE id = 1`, values, function (err) {
    cb(err, this ? this.changes : 0);
  });
};

const updateMerchantBalance = (amount, cb) => {
  db.run(`UPDATE merchant SET balance = balance + ?, settleBalance = settleBalance + ? WHERE id = 1`, [amount, amount], function (err) {
    cb(err);
  });
};

module.exports = {
  db, init,
  createCustomer, findCustomerByUuid, updateCustomerStatus, updateCustomerInfo,
  createTransaction, findTransactionByUuid, listTransactions, updateTransactionStatus,
  getMerchant, updateMerchantSettings, updateMerchantBalance
};
