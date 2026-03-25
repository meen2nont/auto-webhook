const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'payonex.db');
const db = new sqlite3.Database(dbPath);

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
      maxWithdraw REAL DEFAULT 200000
    )`);

    // Seed merchant row if not exists
    db.get(`SELECT id FROM merchant WHERE id = 1`, [], (err, row) => {
      if (!row) {
        db.run(`INSERT INTO merchant (id, partner, clientCode, balance, settleBalance, minDeposit, maxWithdraw)
                VALUES (1, 'PARTNER-MOCK', 'CLIENT-MOCK', 100000, 100000, 100, 200000)`);
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
const createTransaction = (data, cb) => {
  const now = Date.now();
  const uuid = uuidv4();
  const merchantOrderId = uuidv4().replace(/-/g, '').toUpperCase().substring(0, 32);
  const platformOrderId = uuidv4();
  const fee = data.type === 'deposit' ? parseFloat((data.amount * 0.016).toFixed(2)) : 0;
  const settleAmount = parseFloat((data.amount - fee).toFixed(2));
  const qrCode = data.type === 'deposit'
    ? `00020101021229370016A000000677010111011300666374052005802TH53037645407${data.amount}6304MOCK`
    : null;

  db.run(
    `INSERT INTO transactions
     (uuid, partner, customerUuid, clientCode, type, settlement, reconcile, qrCode, status, amount, currency, settleAmount, settleCurrency, fee, rate, referenceId, merchantOrderId, platformOrderId, note, remark, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid, 'PARTNER-MOCK', data.customerUuid, 'CLIENT-MOCK', data.type, 'FALSE', 'FALSE', qrCode, 'PROCESSING', data.amount, 'THB', settleAmount, 'THB', fee, 1.6, data.referenceId || '', merchantOrderId, platformOrderId, data.note || '', data.remark || '', now, now],
    function (err) {
      if (err) return cb(err);
      cb(null, { uuid, partner: 'PARTNER-MOCK', customerUuid: data.customerUuid, clientCode: 'CLIENT-MOCK', type: data.type, settlement: 'FALSE', reconcile: 'FALSE', qrCode, status: 'PROCESSING', amount: data.amount, currency: 'THB', settleAmount, settleCurrency: 'THB', fee, rate: 1.6, referenceId: data.referenceId || '', merchantOrderId, platformOrderId, note: data.note || '', remark: data.remark || '', createdAt: now, updatedAt: now });
    }
  );
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

const updateMerchantSettings = (minDeposit, maxWithdraw, cb) => {
  db.run(`UPDATE merchant SET minDeposit = ?, maxWithdraw = ? WHERE id = 1`, [minDeposit, maxWithdraw], function (err) {
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
