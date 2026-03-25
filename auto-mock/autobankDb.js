const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'autobank.db');
const db = new sqlite3.Database(dbPath);

const ensureColumn = (tableName, columnName, columnDefinition) => {
    db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
        if (err) return;
        const exists = rows.some((col) => col.name === columnName);
        if (!exists) {
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
        }
    });
};

const migrateCustomersTableIfNeeded = () => {
    db.all(`PRAGMA index_list(customers)`, [], (err, indexes) => {
        if (err || !indexes || indexes.length === 0) return;

        const uniqueIndexes = indexes.filter((idx) => idx.unique === 1);
        if (uniqueIndexes.length === 0) return;

        let pending = uniqueIndexes.length;
        let needsMigration = false;

        uniqueIndexes.forEach((idx) => {
            db.all(`PRAGMA index_info(${idx.name})`, [], (err2, columns) => {
                if (!err2) {
                    const names = (columns || []).map((col) => col.name).filter(Boolean);
                    if (names.length === 1 && names[0] === 'member_username') {
                        needsMigration = true;
                    }
                }

                pending -= 1;
                if (pending === 0 && needsMigration) {
                    db.serialize(() => {
                        db.run(`CREATE TABLE IF NOT EXISTS customers_new (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          member_bank_id INTEGER,
                          member_username TEXT,
                          member_name TEXT,
                          member_bank TEXT,
                          member_accid TEXT,
                          member_tmnid TEXT,
                          balance REAL DEFAULT 0,
                          created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )`);
                        db.run(`INSERT INTO customers_new (id, member_bank_id, member_username, member_name, member_bank, member_accid, member_tmnid, balance, created_at)
                                SELECT id, member_bank_id, member_username, member_name, member_bank, member_accid, member_tmnid, COALESCE(balance, 0), COALESCE(created_at, CURRENT_TIMESTAMP)
                                FROM customers`);
                        db.run(`DROP TABLE customers`);
                        db.run(`ALTER TABLE customers_new RENAME TO customers`);
                        db.run(`CREATE INDEX IF NOT EXISTS idx_customers_username ON customers (member_username)`);
                        db.run(`CREATE INDEX IF NOT EXISTS idx_customers_identity ON customers (member_username, member_name, member_bank, member_accid, member_tmnid)`);
                    });
                }
            });
        });
    });
};

// Create tables if not exists
const init = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_bank_id INTEGER,
            member_username TEXT,
      member_name TEXT,
      member_bank TEXT,
      member_accid TEXT,
      member_tmnid TEXT,
      balance REAL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
        db.run(`CREATE TABLE IF NOT EXISTS merchant_banks (
      bank_id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_type TEXT,
      agent_bank TEXT,
      is_deposit INTEGER,
      is_withdraw INTEGER,
      accid TEXT,
      accname TEXT,
      mobile TEXT,
      active INTEGER,
      balance REAL,
      payment_id TEXT,
      payment_auth_token TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )`);
        db.run(`CREATE TABLE IF NOT EXISTS payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT,
      withdraw_auto_id INTEGER,
      status TEXT,
      merchant_bank_id INTEGER,
      custom_username TEXT,
      amount REAL,
      created_at TEXT
    )`);
        db.run(`CREATE TABLE IF NOT EXISTS deposits (
      deposit_id INTEGER PRIMARY KEY,
      status TEXT,
      amount REAL,
      member_username TEXT,
      bank TEXT,
      account_id TEXT,
      transaction_date TEXT,
      create_date TEXT DEFAULT CURRENT_TIMESTAMP,
      message TEXT
    )`);

        // Backfill missing columns for existing db files from older schema versions.
        ensureColumn('customers', 'balance', 'REAL DEFAULT 0');
        ensureColumn('customers', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
        ensureColumn('merchant_banks', 'payment_id', 'TEXT');
        ensureColumn('merchant_banks', 'payment_auth_token', 'TEXT');
        ensureColumn('merchant_banks', 'balance', 'REAL DEFAULT 0');

        // Older DB files had a UNIQUE constraint on member_username; remove it to allow
        // duplicate usernames when other customer fields differ.
        migrateCustomersTableIfNeeded();

        db.run(`CREATE INDEX IF NOT EXISTS idx_customers_username ON customers (member_username)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_customers_identity ON customers (member_username, member_name, member_bank, member_accid, member_tmnid)`);
    });
};

// --- Customer ---
const addCustomer = (customer, cb) => {
    const stmt = db.prepare(`INSERT INTO customers (member_bank_id, member_username, member_name, member_bank, member_accid, member_tmnid, balance) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(
        customer.member_bank_id,
        customer.member_username,
        customer.member_name,
        customer.member_bank,
        customer.member_accid,
        customer.member_tmnid || null,
        customer.balance !== undefined ? customer.balance : 0,
        function (err) {
            if (err) return cb(err);
            cb(null, { id: this.lastID, ...customer });
        }
    );
    stmt.finalize();
};
const findCustomerByUsername = (username, cb) => {
    db.get(`SELECT * FROM customers WHERE member_username = ?`, [username], (err, row) => {
        cb(err, row);
    });
};
const findCustomerByIdentity = (identity, cb) => {
    db.get(
        `SELECT * FROM customers
         WHERE member_username = ?
           AND member_name = ?
           AND member_bank = ?
           AND member_accid = ?
           AND COALESCE(member_tmnid, '') = COALESCE(?, '')
         LIMIT 1`,
        [
            identity.member_username,
            identity.member_name,
            identity.member_bank,
            identity.member_accid,
            identity.member_tmnid || null
        ],
        (err, row) => {
            cb(err, row);
        }
    );
};

// --- Merchant Bank ---
const addMerchantBank = (bank, cb) => {
    const now = new Date().toISOString();
    // bank_id = 1, payment_id = uuid, payment_auth_token = random token
    const bank_id = 1;
    const payment_id = uuidv4();
    const payment_auth_token = crypto.randomBytes(32).toString('hex');
    const stmt = db.prepare(`INSERT OR REPLACE INTO merchant_banks (bank_id, bank_type, agent_bank, is_deposit, is_withdraw, accid, accname, mobile, active, balance, payment_id, payment_auth_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(
        bank_id,
        bank.bank_type,
        bank.agent_bank,
        bank.is_deposit,
        bank.is_withdraw,
        bank.accid,
        bank.accname,
        bank.mobile,
        1,
        bank.balance || 0,
        payment_id,
        payment_auth_token,
        now,
        now,
        function (err) {
            if (err) return cb(err);
            cb(null, { bank_id, ...bank, payment_id, payment_auth_token, created_at: now, updated_at: now });
        }
    );
    stmt.finalize();
};
const listMerchantBanks = (cb) => {
    db.all(`SELECT * FROM merchant_banks`, [], (err, rows) => cb(err, rows));
};
const updateMerchantBank = (bank_id, update, cb) => {
    const now = new Date().toISOString();
    db.run(`UPDATE merchant_banks SET accname = ?, mobile = ?, updated_at = ? WHERE bank_id = ?`, [update.accname, update.mobile, now, bank_id], function (err) {
        cb(err, this.changes);
    });
};
const deleteMerchantBank = (bank_id, cb) => {
    db.run(`DELETE FROM merchant_banks WHERE bank_id = ?`, [bank_id], function (err) {
        cb(err, this.changes);
    });
};

// --- Payout ---
const addPayout = (payout, cb) => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`INSERT INTO payouts (trace_id, withdraw_auto_id, status, merchant_bank_id, custom_username, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(
        payout.trace_id,
        payout.withdraw_auto_id,
        payout.status,
        payout.merchant_bank_id,
        payout.custom_username,
        payout.amount,
        now,
        function (err) {
            if (err) return cb(err);
            cb(null, { id: this.lastID, ...payout, created_at: now });
        }
    );
    stmt.finalize();
};

const updatePayoutStatus = (trace_id, status, cb) => {
    db.run(`UPDATE payouts SET status = ? WHERE trace_id = ?`, [status, trace_id], function (err) {
        cb(err, this ? this.changes : 0);
    });
};

// --- Deposit ---
const addDeposit = (deposit, cb) => {
    const stmt = db.prepare(`INSERT INTO deposits (deposit_id, status, amount, member_username, bank, account_id, transaction_date, create_date, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(
        deposit.deposit_id,
        deposit.status,
        deposit.amount,
        deposit.member_username,
        deposit.bank,
        deposit.account_id,
        deposit.transaction_date,
        deposit.create_date,
        deposit.message || "",
        function (err) {
            if (err) return cb(err);
            cb(null, { ...deposit });
        }
    );
    stmt.finalize();
};
const findDepositById = (deposit_id, cb) => {
    db.get(`SELECT * FROM deposits WHERE deposit_id = ?`, [deposit_id], (err, row) => cb(err, row));
};

const updateCustomerBalance = (member_username, amount, cb) => {
    db.run(
        `UPDATE customers SET balance = COALESCE(balance, 0) + ? WHERE member_username = ?`,
        [amount, member_username],
        function (err) {
            cb(err, this ? this.changes : 0);
        }
    );
};

module.exports = {
    db, init,
    addCustomer, findCustomerByUsername, findCustomerByIdentity,
    addMerchantBank, listMerchantBanks, updateMerchantBank, deleteMerchantBank,
    addPayout, updatePayoutStatus,
    addDeposit, findDepositById,
    updateCustomerBalance
};
