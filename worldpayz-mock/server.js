const crypto = require('crypto');
const http = require('http');
const https = require('https');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./worldpayzDb');

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const hasBody = req.body && Object.keys(req.body).length > 0;
  const hasQuery = req.query && Object.keys(req.query).length > 0;
  if (hasBody || hasQuery) {
    console.log(`[INCOMING] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    if (hasQuery) {
      console.log('[INCOMING QUERY]', JSON.stringify(req.query));
    }
    if (hasBody) {
      console.log('[INCOMING BODY]', JSON.stringify(req.body));
    }
  }
  next();
});

const API_KEY = process.env.WORLDPAYZ_API_KEY || 'WORLDPAYZ_MOCK_API_KEY';
const SECRET_KEY = process.env.WORLDPAYZ_SECRET_KEY || 'WORLDPAYZ_MOCK_SECRET_KEY';
const PAYMENT_DOMAIN = process.env.WORLDPAYZ_PAYMENT_DOMAIN || 'https://worldpayz.huayteenoi.com/';
const WEBHOOK_URL = process.env.WORLDPAYZ_WEBHOOK_URL || '';
const PAYMENT_WEBHOOK_DELAY_MS = Number(process.env.WORLDPAYZ_PAYMENT_WEBHOOK_DELAY_MS || 5000);
const WITHDRAWAL_WEBHOOK_DELAY_MS = Number(process.env.WORLDPAYZ_WITHDRAWAL_WEBHOOK_DELAY_MS || 5000);
const PORT = Number(process.env.PORT || 3102);

const PAYMENT_FIELDS = [
  'order_id',
  'order_user_reference',
  'payment_method_type',
  'amount',
  'from_currency',
  'to_currency',
  'payment_domain',
  'url_return',
  'url_success',
  'url_failed',
  'additional_data'
];

const PAYMENT_FIAT_FIELDS = [
  'payer_bank_provider',
  'payer_bank_account_number',
  'payer_bank_account_name'
];

const WITHDRAWAL_FIELDS = [
  'withdrawal_mode',
  'order_id',
  'amount',
  'currency',
  'withdrawal_address',
  'chain',
  'asset_type',
  'additional'
];

const WITHDRAWAL_FIAT_FIELDS = ['receiver_bank', 'receiver_name'];

const BANK_CONFIGS = {
  KBANK: { name_th: 'กสิกรไทย', fullname_th: 'ธนาคารกสิกรไทย', name_en: 'Kasikorn Bank', bank_code: 'KBANK', bank_number: '004' },
  SCB: { name_th: 'ไทยพาณิชย์', fullname_th: 'ธนาคารไทยพาณิชย์', name_en: 'The Siam Commercial Bank', bank_code: 'SCB', bank_number: '014' },
  KTB: { name_th: 'กรุงไทย', fullname_th: 'ธนาคารกรุงไทย', name_en: 'Krungthai Bank', bank_code: 'KTB', bank_number: '006' },
  BBL: { name_th: 'กรุงเทพ', fullname_th: 'ธนาคารกรุงเทพ', name_en: 'Bangkok Bank', bank_code: 'BBL', bank_number: '002' },
  BAY: { name_th: 'กรุงศรีอยุธยา', fullname_th: 'ธนาคารกรุงศรีอยุธยา', name_en: 'Krungsri Bank', bank_code: 'BAY', bank_number: '025' },
  TTB: { name_th: 'ทีเอ็มบีธนชาต', fullname_th: 'ธนาคารทีเอ็มบีธนชาต', name_en: 'TMBThanachart Bank', bank_code: 'TTB', bank_number: '011' },
  UOB: { name_th: 'ยูโอบี', fullname_th: 'ธนาคารยูโอบี', name_en: 'United Overseas Bank', bank_code: 'UOB', bank_number: '024' },
  KKP: { name_th: 'เกียรตินาคิน', fullname_th: 'ธนาคารเกียรตินาคินภัทร', name_en: 'Kiatnakin Phatra Bank', bank_code: 'KKP', bank_number: '069' },
  GSB: { name_th: 'ออมสิน', fullname_th: 'ธนาคารออมสิน', name_en: 'Government Savings Bank', bank_code: 'GSB', bank_number: '030' },
  BAAC: { name_th: 'ธ.ก.ส.', fullname_th: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร', name_en: 'Bank for Agriculture and Agricultural Cooperatives', bank_code: 'BAAC', bank_number: '034' },
  CIMB: { name_th: 'ซีไอเอ็มบี', fullname_th: 'ธนาคารซีไอเอ็มบี', name_en: 'CIMB Thai Bank', bank_code: 'CIMB', bank_number: '022' },
  PromptPay: { name_th: 'พร้อมเพย์', fullname_th: 'พร้อมเพย์', name_en: 'PromptPay', bank_code: 'PromptPay', bank_number: '000' },
  TrueMoney: { name_th: 'ทรูมันนี่', fullname_th: 'ทรูมันนี่', name_en: 'True Money', bank_code: 'TrueMoney', bank_number: '000' }
};

const CHAIN_LIST = [
  { id: '0ff1f448-db53-48f0-9e9d-40dd3751efcc', name: 'Ethereum', chain: 'ethereum', native_asset: 'ETH', standard_token: 'erc20', gas_min: 0.0030625, gas_airdrop: 0, gas_convert: 0, gas_unit: '', is_actived: true, metadata: { chain_id: 3 }, created_at: '2024-12-07T16:20:23.803Z' },
  { id: '1d44e285-c020-42df-8237-4c555b2687d4', name: 'Polygon', chain: 'polygon', native_asset: 'MATIC', standard_token: 'erc20', gas_min: 13.315579, gas_airdrop: 0, gas_convert: 0, gas_unit: '', is_actived: true, metadata: { chain_id: 80001 }, created_at: '2024-12-07T16:20:23.803Z' },
  { id: '29ebef1f-ee46-44e9-9324-6a89ab18d986', name: 'Litecoin', chain: 'litecoin', native_asset: 'LTC', standard_token: 'litecoin', gas_min: 0.038931, gas_airdrop: 0, gas_convert: 0, gas_unit: '', is_actived: true, metadata: { chain_id: 1 }, created_at: '2024-12-07T16:20:23.803Z' },
  { id: '97b8e001-a65e-4f2c-9d7d-bc4055f521fa', name: 'Binance Smart Chain', chain: 'bsc', native_asset: 'BNB', standard_token: 'bep20', gas_min: 0.006906, gas_airdrop: 0, gas_convert: 0, gas_unit: '', is_actived: true, metadata: { chain_id: 97 }, created_at: '2024-12-07T16:20:23.803Z' },
  { id: '97ba8e57-ffcf-4f1d-b8e5-574021d50352', name: 'Bitcoin', chain: 'bitcoin', native_asset: 'BTC', standard_token: 'bitcoin', gas_min: 0.00003126, gas_airdrop: 0, gas_convert: 0, gas_unit: '', is_actived: true, metadata: { chain_id: 0 }, created_at: '2024-12-07T16:20:23.803Z' },
  { id: 'fa9878a5-243e-44cd-8d1c-b3378eddf607', name: 'Dogecoin', chain: 'dogecoin', native_asset: 'DOGE', standard_token: 'dogecoin', gas_min: 4.05358843, gas_airdrop: 0, gas_convert: 0, gas_unit: '', is_actived: true, metadata: { chain_id: 2 }, created_at: '2024-12-07T16:20:23.803Z' },
  { id: 'd28f040c-521e-42bb-a2fc-adc68bdafc3f', name: 'Tron', chain: 'tron', native_asset: 'TRX', standard_token: 'trc20', gas_min: 3.398395, gas_airdrop: 0, gas_convert: 0, gas_unit: '', is_actived: true, metadata: { chain_id: 195 }, created_at: '2024-12-07T16:20:23.803Z' }
];

const RATE_USD = {
  ETH: '4318.90925577',
  USDT: '0.99996938',
  THB: '0.030829',
  BNB: '1023.02695597',
  BTC: '117408.334404',
  SOL: '218.98311802',
  DOGE: '0.2445081',
  TRX: '0.34045182',
  MATIC: '0.23477916',
  LINK: '22.37655349',
  LTC: '111.19119246'
};

const FALLBACK_MERCHANT = {
  id: 'merchant-fallback',
  merchant_code: 'WPMOCK001',
  name: 'Worldpayz Mock Merchant',
  provider: 'SCB',
  bank_code: 'SCB',
  bank_account_number: '6123013742',
  bank_account_name: 'Worldpayz Mock Merchant',
  callback_url: 'https://api.gametester.win/worldpayz/webhook',
  webhook_secret: 'https://api.gametester.win/worldpayz/webhook/verification-stats',
  api_key: 'WORLDPAYZ_MOCK_API_KEY',
  secret_key: 'WORLDPAYZ_MOCK_SECRET_KEY',
  is_active: true,
  metadata: {}
};

const createResponse = (res, data, message = 'success') => {
  res.json({ success: true, code: 0, message, data });
};

const failResponse = (res, status, message, code = 1000, details) => {
  const payload = {
    success: false,
    code,
    message,
    timestamp: new Date().toISOString(),
    status_code: status
  };
  if (details) payload.details = details;
  return res.status(status).json(payload);
};

const withActiveMerchant = (cb) => {
  db.findActiveMerchant((err, merchant) => {
    if (err) return cb(err);
    return cb(null, merchant || FALLBACK_MERCHANT);
  });
};

const resolveMerchantFromRequest = (req, cb) => {
  if (req.authMerchant) return cb(null, req.authMerchant);
  return withActiveMerchant(cb);
};

const decimalString = (value, digits = 8) => {
  const result = Number(value || 0).toFixed(digits);
  return result.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
};

const fixedTimeCompare = (left, right) => {
  const leftBuffer = Buffer.from(left || '', 'utf8');
  const rightBuffer = Buffer.from(right || '', 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const bodyForSignature = (body) => {
  const parsedBody = body && Object.keys(body).length > 0 ? body : '';
  return JSON.stringify(parsedBody);
};

const buildFullUrl = (req) => `${req.protocol}://${req.get('host')}${req.originalUrl}`;

const generateSignature = (secretKey, method, fullUrl, body, timestamp) => {
  const content = `${timestamp}|${method.toUpperCase()}|${fullUrl}|${bodyForSignature(body)}`;
  return crypto.createHmac('sha256', secretKey).update(content).digest('hex');
};

const requireSignatureAuth = (req, res, next) => {
  const apiKey = req.header('x-api-key');
  const signature = req.header('x-signature');
  const timestamp = req.header('x-timestamp');
  const authLogPrefix = `[AUTH][${new Date().toISOString()}][${req.method} ${req.originalUrl}]`;

  console.log(`${authLogPrefix} Incoming auth check`);
  console.log(`${authLogPrefix} Headers snapshot`, JSON.stringify({
    ApiKey: apiKey,
    Signature: signature,
    Timestamp: timestamp,
    SignatureLength: signature ? signature.length : 0,
    TimestampValue: timestamp
  }));

  if (!apiKey || !signature || !timestamp) {
    console.log(`${authLogPrefix} Missing required auth headers`);
    return failResponse(res, 401, 'Missing authentication headers', 1401, {
      required: ['x-api-key', 'x-signature', 'x-timestamp']
    });
  }

  if (!/^\d+$/.test(timestamp)) {
    console.log(`${authLogPrefix} Invalid timestamp format`, JSON.stringify({ TimestampValue: timestamp }));
    return failResponse(res, 400, 'x-timestamp must be milliseconds', 1400);
  }

  console.log(`${authLogPrefix} Looking up merchant by API key`);

  db.findMerchantByApiKey(apiKey, (merchantErr, merchantFromDb) => {
    if (merchantErr) {
      console.error(`${authLogPrefix} Merchant lookup failed`, merchantErr.message);
      return failResponse(res, 500, 'Database error', 1500);
    }

    const merchant = merchantFromDb || (apiKey === API_KEY ? {
      ...FALLBACK_MERCHANT,
      api_key: API_KEY,
      secret_key: SECRET_KEY,
      callback_url: WEBHOOK_URL || FALLBACK_MERCHANT.callback_url
    } : null);

    console.log(`${authLogPrefix} Merchant resolved`, JSON.stringify({
      source: merchantFromDb ? 'database' : 'fallback',
      merchantId: merchant?.id || null,
      merchantCode: merchant?.merchant_code || null,
      isActive: merchant?.is_active
    }));

    if (!merchant || merchant.is_active === false) {
      console.log(`${authLogPrefix} API key rejected`, JSON.stringify({ ApiKey: apiKey }));
      return failResponse(res, 403, 'Invalid API key', 1403);
    }

    const secretKeyUsed = merchant.secret_key || SECRET_KEY;
    const fullUrl = buildFullUrl(req);
    const bodyForSig = bodyForSignature(req.body);

    const expected = generateSignature(
      secretKeyUsed,
      req.method,
      fullUrl,
      req.body,
      timestamp
    );

    // Try alternative URL formats if signature doesn't match (for flexibility)
    let signatureValid = fixedTimeCompare(signature, expected);
    let urlUsedForMatch = fullUrl;

    if (!signatureValid) {
      // Try with localhost:3102 variant
      const localhostUrl = `http://localhost:3102${req.originalUrl}`;
      const expectedLocalhost = generateSignature(
        secretKeyUsed,
        req.method,
        localhostUrl,
        req.body,
        timestamp
      );
      if (fixedTimeCompare(signature, expectedLocalhost)) {
        signatureValid = true;
        urlUsedForMatch = localhostUrl;
      }
    }

    if (!signatureValid) {
      // Try with https variant
      const httpsUrl = `https://worldpayz.huayteenoi.com${req.originalUrl}`;
      const expectedHttps = generateSignature(
        secretKeyUsed,
        req.method,
        httpsUrl,
        req.body,
        timestamp
      );
      if (fixedTimeCompare(signature, expectedHttps)) {
        signatureValid = true;
        urlUsedForMatch = httpsUrl;
      }
    }

    console.log(`${authLogPrefix} Signature generation details`, JSON.stringify({
      secretKeyUsed,
      method: req.method,
      fullUrl,
      body: bodyForSig,
      timestamp,
      expected,
      provided: signature,
      signatureValid,
      urlUsedForMatch
    }));

    if (!signatureValid) {
      console.log(`${authLogPrefix} Signature validation failed`);
      return failResponse(res, 401, 'Invalid signature', 1402, { expectedForMock: expected });
    }

    console.log(`${authLogPrefix} Auth success`, JSON.stringify({ merchantId: merchant.id }));
    req.authMerchant = merchant;
    next();
  });
};

const buildPromptPayQr = (amount) => {
  const sanitizedAmount = Number(amount).toFixed(2).replace('.', '');
  return `00020101021229370016A000000677010111021307755680032235303764540${sanitizedAmount}5802TH6304MOCK`;
};

const getMode = (mode) => {
  const normalized = String(mode || '').toLowerCase();
  return ['fiat', 'crypto'].includes(normalized) ? normalized : null;
};

const validateRequired = (body, fields) => fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');

const getPaymentAddress = (payment) => {
  if (payment.invoice_type !== 'CRYPTO') {
    return payment.status === 'SUCCESS' ? '0x00' : null;
  }
  return `TMock${payment.id.replace(/-/g, '').slice(0, 24)}`;
};

const paymentSummary = (payment, merchant = FALLBACK_MERCHANT) => {
  const fee = Number((payment.payment_amount * 0.014).toFixed(6));
  const merchantAmount = Number((payment.payment_amount - fee).toFixed(6));
  const bankInfo = BANK_CONFIGS[payment.payer_bank_provider];
  const isFiat = payment.invoice_type === 'FIAT';
  const merchantInfo = merchant || FALLBACK_MERCHANT;
  return {
    id: payment.id,
    seq_num: payment.seq_num,
    source_id: payment.source_id,
    order_id: payment.order_id,
    order_user_reference: payment.order_user_reference,
    order_display_mode: payment.order_display_mode,
    payment_method_type: payment.payment_method_type,
    payment_provider: payment.payment_provider,
    invoice_type: payment.invoice_type,
    from_currency: payment.from_currency,
    to_currency: payment.to_currency,
    chain: payment.chain,
    network: payment.network,
    amount: payment.amount,
    payment_amount: payment.payment_amount,
    payer_pay_network_fee: payment.payer_pay_network_fee,
    payer_bank_provider: isFiat ? payment.payer_bank_provider : null,
    payer_bank_account_number: isFiat ? payment.payer_bank_account_number : null,
    payer_bank_account_name: isFiat ? payment.payer_bank_account_name : null,
    one_time_address: false,
    lifetime: payment.lifetime,
    expired_at: payment.expired_at,
    fee_subtract: 0,
    fee_model: 'PERCENTAGE',
    fee_percent: 1.4,
    fee_amount: fee,
    merchant_amount: merchantAmount,
    discount_percent: 0,
    discount_amount: 0,
    payment_url: payment.payment_url,
    payment_qr: payment.payment_qr,
    payment_domain: payment.payment_domain,
    url_return: payment.url_return,
    url_success: payment.url_success,
    url_failed: payment.url_failed,
    additional_data: payment.additional_data,
    auto_convert: false,
    convert_to: 'USDT',
    exchange_rate: payment.exchange_rate,
    exchange_rate_source: 'MOCK_FIXED',
    payment_status: payment.payment_status,
    payment_match_type: payment.payment_match_type,
    is_completed: payment.is_completed,
    status: payment.status,
    failed_reason: payment.failed_reason,
    cancelled_at: payment.cancelled_at,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
    merchant_detail: {
      merchant_id: merchantInfo.id,
      merchant_code: merchantInfo.merchant_code,
      name: merchantInfo.name,
      provider: merchantInfo.provider || merchantInfo.bank_code,
      account_number: merchantInfo.bank_account_number,
      amount_received: merchantAmount,
      fee_deducted: fee
    },
    payer_detail: {
      bank_provider: payment.payer_bank_provider,
      bank_name: bankInfo ? bankInfo.fullname_th : 'Unknown Bank',
      bank_code: bankInfo ? bankInfo.bank_code : 'UNKNOWN',
      account_number: payment.payer_bank_account_number,
      account_name: payment.payer_bank_account_name,
      amount_paid: payment.payment_amount
    },
    fee_breakdown: {
      type: 'PERCENTAGE',
      percent: 1.4,
      amount: fee,
      charge_to: 'MERCHANT'
    },
    txid: payment.status === 'SUCCESS' ? `mock-${payment.id}` : '0x00',
    address: getPaymentAddress(payment)
  };
};

const buildWebhookPayload = (payment, transaction) => ({
  event: 'PAYMENT_PAID',
  type: payment.invoice_type,
  data: {
    payment: {
      id: payment.id,
      txid: `mock-${payment.id}`,
      chain: payment.chain,
      amount: payment.amount,
      status: payment.status,
      address: getPaymentAddress(payment) || '0x00',
      fx_rate: {
        THB: payment.payment_amount,
        USD: Number((payment.payment_amount / 31.5).toFixed(3))
      },
      network: payment.network,
      seq_num: payment.seq_num,
      agent_id: 'WORLDPAYZ-MOCK-AGENT',
      lifetime: payment.lifetime,
      order_id: payment.order_id,
      source_id: payment.source_id,
      created_at: payment.created_at,
      expired_at: payment.expired_at,
      updated_at: payment.updated_at,
      to_currency: payment.to_currency,
      from_currency: payment.from_currency,
      failed_reason: payment.failed_reason || 'UNKNOWN',
      payment_amount: payment.payment_amount,
      payment_status: payment.payment_status,
      merchant_amount: Number((payment.payment_amount * 0.986).toFixed(6)),
      payer_paid_amount: payment.payment_amount,
      payer_bank_provider: payment.payer_bank_provider,
      payer_paid_currency: payment.to_currency,
      payer_bank_account_name: payment.payer_bank_account_name,
      payer_bank_account_number: payment.payer_bank_account_number,
      order_user_reference: payment.order_user_reference
    },
    transaction: transaction ? {
      id: transaction.id,
      fee: transaction.fee,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      to_bank: transaction.to_bank,
      tx_date: transaction.tx_date,
      currency: transaction.currency,
      order_id: payment.order_id,
      from_bank: transaction.from_bank,
      from_name: transaction.from_name,
      reference: transaction.reference,
      source_id: transaction.source_id,
      created_at: transaction.created_at,
      fee_amount: transaction.fee_amount,
      payment_id: transaction.payment_id,
      updated_at: transaction.updated_at,
      from_address: transaction.from_address,
      realized_amount: transaction.realized_amount,
      order_user_reference: payment.order_user_reference
    } : null
  }
});

const postJson = (urlString, payload, extraHeaders = {}) => new Promise((resolve, reject) => {
  const target = new URL(urlString);
  const transport = target.protocol === 'https:' ? https : http;
  const data = JSON.stringify(payload);
  const req = transport.request({
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: `${target.pathname}${target.search}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      ...extraHeaders
    }
  }, (res) => {
    let chunks = '';
    res.on('data', (chunk) => {
      chunks += chunk;
    });
    res.on('end', () => resolve({ statusCode: res.statusCode, body: chunks }));
  });
  req.on('error', reject);
  req.write(data);
  req.end();
});

const buildWebhookHeaders = (merchant, payload, webhookUrl) => {
  const webhookSecret = merchant?.webhook_secret;
  const apiKey = merchant?.api_key;

  if (!webhookSecret || !apiKey) return {};

  const timestamp = Date.now().toString();
  const payloadString = JSON.stringify(payload);
  // Signature format: timestamp|method|fullUrl|bodyString
  const signatureContent = `${timestamp}|POST|${webhookUrl}|${payloadString}`;
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signatureContent)
    .digest('hex');

  return {
    'x-api-key': apiKey,
    'x-timestamp': timestamp,
    'x-signature': signature
  };
};

const sendWebhookIfConfigured = async (payment, transaction, merchant) => {
  const destination = merchant?.callback_url || WEBHOOK_URL;
  if (!destination) {
    return { sent: false, reason: 'merchant callback_url and WORLDPAYZ_WEBHOOK_URL are not configured' };
  }
  const payload = buildWebhookPayload(payment, transaction);
  console.log('[OUTGOING WEBHOOK][PAYMENT]', JSON.stringify({
    destination,
    event: payload.event,
    payment_id: payment.id,
    payload
  }));
  const result = await postJson(destination, payload, buildWebhookHeaders(merchant, payload, destination));
  await new Promise((resolve) => {
    db.updatePaymentState(payment.id, { webhook_sent_at: new Date().toISOString() }, () => resolve());
  });
  return { sent: true, destination, result };
};

const buildWithdrawalWebhookPayload = (withdrawal) => ({
  event: 'WITHDRAWAL_COMPLETED',
  type: withdrawal.withdrawal_mode,
  data: {
    withdrawal: withdrawalDetail(withdrawal),
    callback_sent_at: new Date().toISOString()
  }
});

const sendWithdrawalWebhookIfConfigured = async (withdrawal, merchant) => {
  const destination = withdrawal.callback_url || WEBHOOK_URL;
  if (!destination) {
    return { sent: false, reason: 'callback_url and WORLDPAYZ_WEBHOOK_URL are not configured' };
  }

  const payload = buildWithdrawalWebhookPayload(withdrawal);
  console.log('[OUTGOING WEBHOOK][WITHDRAWAL]', JSON.stringify({
    destination,
    event: payload.event,
    withdrawal_id: withdrawal.id,
    payload
  }));
  const result = await postJson(destination, payload, buildWebhookHeaders(merchant, payload, destination));
  const webhookRequestId = uuidv4();
  await new Promise((resolve) => {
    db.updateWithdrawalState(withdrawal.id, {
      callback_data: {
        destination,
        event: payload.event,
        response: result,
        sent_at: new Date().toISOString()
      },
      http_status: result.statusCode || null,
      webhook_request_id: webhookRequestId,
      last_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, () => resolve());
  });
  return { sent: true, destination, request_id: webhookRequestId, result };
};

const getPaymentWithTransaction = (id, cb) => {
  db.findPaymentById(id, (paymentErr, payment) => {
    if (paymentErr) return cb(paymentErr);
    if (!payment) return cb(null, null, null);
    db.findTransactionByPaymentId(id, (txErr, transaction) => cb(txErr, payment, transaction || null));
  });
};

const buildPaymentRecord = (body, mode) => {
  const now = new Date();
  const createdAt = now.toISOString();
  const expiredAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const amount = Number(body.amount);
  const isFiat = mode === 'fiat';
  const paymentId = uuidv4();

  return {
    id: paymentId,
    seq_num: Math.floor(Date.now() / 1000),
    source_id: 'wpayz',
    order_id: body.order_id,
    order_user_reference: body.order_user_reference,
    order_display_mode: isFiat ? 'FIAT' : 'CRYPTO',
    payment_method_type: body.payment_method_type,
    payment_provider: isFiat ? 'EBANK' : 'BLOCKCHAIN',
    invoice_type: isFiat ? 'FIAT' : 'CRYPTO',
    from_currency: body.from_currency,
    to_currency: body.to_currency,
    chain: body.chain || (isFiat ? 'offchain' : 'tron'),
    network: body.network || 'testnet',
    amount: String(body.amount),
    payment_amount: Number(amount.toFixed(2)),
    payer_pay_network_fee: false,
    payer_bank_provider: body.payer_bank_provider || null,
    payer_bank_account_number: body.payer_bank_account_number || null,
    payer_bank_account_name: body.payer_bank_account_name || null,
    payment_domain: body.payment_domain || PAYMENT_DOMAIN,
    payment_url: `${body.payment_domain || PAYMENT_DOMAIN}/pay/${paymentId}`,
    payment_qr: isFiat ? buildPromptPayQr(amount) : null,
    url_return: body.url_return,
    url_success: body.url_success,
    url_failed: body.url_failed,
    additional_data: body.additional_data,
    exchange_rate: 1,
    payment_status: 'PAYMENT_CHECKING',
    payment_match_type: 'PENDING',
    is_completed: false,
    status: 'PENDING',
    lifetime: 900,
    expired_at: expiredAt,
    created_at: createdAt,
    updated_at: createdAt
  };
};

const appendHistory = (history, entry) => [...(history || []), entry];

const buildWithdrawalFxRate = (amount) => ({
  AED: Number((amount * 0.1138).toFixed(3)),
  CNY: Number((amount * 0.22058).toFixed(3)),
  EUR: Number((amount * 0.02643).toFixed(3)),
  GBP: Number((amount * 0.023).toFixed(3)),
  HKD: Number((amount * 0.2411).toFixed(3)),
  IDR: Number((amount * 516.14692).toFixed(3)),
  INR: Number((amount * 2.74661).toFixed(3)),
  JPY: Number((amount * 4.56108).toFixed(3)),
  KRW: Number((amount * 43.45123).toFixed(3)),
  RUB: Number((amount * 2.556).toFixed(3)),
  SGD: Number((amount * 0.03992).toFixed(3)),
  THB: Number((amount * 1.005).toFixed(3)),
  USD: Number((amount * 1.005).toFixed(3))
});

const buildWithdrawalRecord = (body, mode, requestIp) => {
  const now = new Date().toISOString();
  const amount = Number(body.amount);
  const isFiat = mode === 'fiat';
  const exchangeRate = body.currency === 'THB' ? 0.030829 : 1;
  return {
    id: uuidv4(),
    seq_num: Math.floor(Date.now() / 1000),
    source_id: 'wpayz',
    unique_hash: crypto.createHash('sha256').update(`${body.order_id}|${now}`).digest('hex'),
    order_id: body.order_id,
    order_user_reference: body.order_user_reference || null,
    request_platform: 'API',
    request_ip: requestIp || null,
    withdrawal_mode: (body.withdrawal_mode || mode).toUpperCase(),
    receiver_bank: body.receiver_bank || (isFiat ? 'SCB' : null),
    receiver_name: body.receiver_name || null,
    currency: body.currency,
    address: body.withdrawal_address,
    amount: String(body.amount),
    withdrawal_amount: amount,
    fee_model_type: 'PERCENTAGE',
    fee: 0,
    fee_amount: 0,
    extra_fee_network: 0,
    realized_amount: amount,
    tx_value: Number((amount * exchangeRate).toFixed(7)),
    fx_rate: buildWithdrawalFxRate(amount),
    exchange_rate: exchangeRate,
    exchange_rate_raw: {
      id: uuidv4(),
      route_path: crypto.createHash('sha1').update(body.currency).digest('hex'),
      symbol: 'USD',
      base_pair: body.currency,
      value: decimalString(exchangeRate),
      timestamp: now,
      source: 'MockRate',
      type: isFiat ? 'FIAT' : 'CRYPTO',
      created_at: now
    },
    operator_id: null,
    operator_type: 'NO_OPERATOR',
    approved_at: null,
    completed_at: null,
    callback_url: body.callback_url || null,
    callback_data: null,
    lifetime: 300,
    http_status: null,
    request_data: body,
    response_data: null,
    whitelist_address_id: null,
    ebank_account_id: null,
    transfer_payloads: null,
    admin_notes: null,
    rejected_reason: 'UNKNOWN',
    additional: body.additional,
    last_updated_by: null,
    last_updated_at: now,
    withdrawal_status: 'PENDING',
    pending_transaction_id: null,
    is_settlement: false,
    webhook_request_id: null,
    sequence_time: now,
    created_at: now,
    updated_at: now,
    organization_id: '7686e9f3-1b6f-4100-9060-a0afb39b3541',
    agent_id: 'aacc3472-f3c3-49bb-9040-d5a6aff283bf',
    transaction_history: [
      {
        timestamp: now,
        status: 'WITHDRAWAL_PENDING',
        description: 'สร้างคำขอถอนเงิน'
      }
    ],
    status: 'PENDING',
    transaction_reference: null,
    chain: body.chain,
    asset_type: body.asset_type,
    network: body.network || 'testnet'
  };
};

const withdrawalSummary = (withdrawal) => {
  const requestData = withdrawal.request_data || {};
  const bankInfo = BANK_CONFIGS[withdrawal.receiver_bank];
  const statusMap = {
    'COMPLETED': 'WITHDRAWAL_COMPLETE',
    'APPROVED': 'WITHDRAWAL_APPROVED',
    'REJECTED': 'WITHDRAWAL_REJECTED',
    'PENDING': 'WITHDRAWAL_PENDING'
  };
  return {
    id: withdrawal.id,
    seq_num: withdrawal.seq_num,
    source_id: withdrawal.source_id,
    unique_hash: withdrawal.unique_hash,
    order_id: withdrawal.order_id,
    order_user_reference: withdrawal.order_user_reference,
    request_platform: withdrawal.request_platform,
    request_ip: withdrawal.request_ip,
    withdrawal_mode: withdrawal.withdrawal_mode,
    currency: withdrawal.currency,
    amount: withdrawal.amount,
    withdrawal_amount: withdrawal.withdrawal_amount,
    fee_model_type: withdrawal.fee_model_type,
    fee_amount: withdrawal.fee_amount,
    extra_fee_network: withdrawal.extra_fee_network,
    realized_amount: withdrawal.realized_amount,
    net_amount: withdrawal.realized_amount,
    tx_value: withdrawal.tx_value,
    exchange_rate: withdrawal.exchange_rate,
    recipient_detail: {
      type: withdrawal.withdrawal_mode,
      bank_code: withdrawal.receiver_bank,
      bank_name: bankInfo ? bankInfo.fullname_th : 'Unknown Bank',
      account_number: withdrawal.address,
      account_name: withdrawal.receiver_name,
      chain: requestData.chain || 'offchain',
      network: requestData.network || 'mainnet',
      asset_type: requestData.asset_type || 'native'
    },
    fee_breakdown: {
      model: withdrawal.fee_model_type,
      network_fee: withdrawal.extra_fee_network,
      total_fee: withdrawal.fee_amount
    },
    exchange_rate_raw: withdrawal.exchange_rate_raw,
    fx_rate: withdrawal.fx_rate,
    operator_id: withdrawal.operator_id,
    operator_type: withdrawal.operator_type,
    approved_at: withdrawal.approved_at,
    callback_url: withdrawal.callback_url,
    callback_data: withdrawal.callback_data,
    lifetime: withdrawal.lifetime,
    http_status: withdrawal.http_status,
    request_data: withdrawal.request_data,
    response_data: withdrawal.response_data,
    whitelist_address_id: withdrawal.whitelist_address_id,
    ebank_account_id: withdrawal.ebank_account_id,
    transfer_payloads: withdrawal.transfer_payloads,
    admin_notes: withdrawal.admin_notes,
    rejected_reason: withdrawal.rejected_reason,
    additional: withdrawal.additional,
    last_updated_by: withdrawal.last_updated_by,
    last_updated_at: withdrawal.last_updated_at,
    withdrawal_status: statusMap[withdrawal.status] || 'WITHDRAWAL_PENDING',
    is_completed: ['COMPLETED', 'REJECTED'].includes(withdrawal.status),
    status: withdrawal.status,
    pending_transaction_id: withdrawal.pending_transaction_id,
    is_settlement: withdrawal.is_settlement,
    webhook_request_id: withdrawal.webhook_request_id,
    sequence_time: withdrawal.sequence_time,
    created_at: withdrawal.created_at,
    updated_at: withdrawal.updated_at,
    organization_id: withdrawal.organization_id,
    agent_id: withdrawal.agent_id,
    transaction_history: (withdrawal.transaction_history || []).map(tx => ({
      timestamp: tx.timestamp,
      status: tx.status,
      description: tx.description,
      transaction_reference: tx.transaction_reference || null
    }))
  };
};

const withdrawalDetail = (withdrawal) => {
  const requestData = withdrawal.request_data || {};
  const bankInfo = BANK_CONFIGS[withdrawal.receiver_bank];
  const statusMap = {
    'COMPLETED': 'WITHDRAWAL_COMPLETE',
    'APPROVED': 'WITHDRAWAL_APPROVED',
    'REJECTED': 'WITHDRAWAL_REJECTED',
    'PENDING': 'WITHDRAWAL_PENDING'
  };

  return {
    id: withdrawal.id,
    seq_num: withdrawal.seq_num,
    order_id: withdrawal.order_id,
    order_user_reference: withdrawal.order_user_reference,
    amount: withdrawal.amount,
    withdrawal_amount: withdrawal.withdrawal_amount,
    currency: withdrawal.currency,
    fee: withdrawal.fee_amount,
    fee_model: withdrawal.fee_model_type,
    net_amount: withdrawal.realized_amount,
    from_currency: withdrawal.currency,
    to_currency: withdrawal.currency,
    recipient_detail: {
      type: withdrawal.withdrawal_mode.toUpperCase(),
      bank_code: withdrawal.receiver_bank,
      bank_name: bankInfo ? bankInfo.fullname_th : 'Unknown Bank',
      bank_en_name: bankInfo ? bankInfo.name_en : 'Unknown',
      account_number: withdrawal.address,
      account_name: withdrawal.receiver_name,
      address: withdrawal.address,
      chain: requestData.chain || 'offchain',
      network: requestData.network || 'mainnet',
      asset_type: requestData.asset_type || 'native'
    },
    network_detail: withdrawal.exchange_rate_raw ? {
      chain: requestData.chain,
      network: requestData.network,
      token_address: null,
      gas_fee: withdrawal.extra_fee_network || 0,
      estimated_time_minutes: withdrawal.withdrawal_mode === 'FIAT' ? 10 : 30
    } : null,
    withdrawal_status: statusMap[withdrawal.status] || 'WITHDRAWAL_PENDING',
    is_completed: ['COMPLETED', 'REJECTED'].includes(withdrawal.status),
    status: withdrawal.status,
    requested_at: withdrawal.created_at,
    approved_at: withdrawal.approved_at,
    completed_at: withdrawal.completed_at,
    created_at: withdrawal.created_at,
    updated_at: withdrawal.updated_at,
    organization_id: withdrawal.organization_id,
    agent_id: withdrawal.agent_id,
    transaction_reference: withdrawal.transaction_reference,
    transaction_history: (withdrawal.transaction_history || []).map(tx => ({
      timestamp: tx.timestamp,
      status: tx.status,
      description: tx.description,
      transaction_reference: tx.transaction_reference || null,
      details: tx.details || null
    }))
  };
};

const applyWithdrawalState = (withdrawal, nextState, cb) => {
  const now = new Date().toISOString();
  const history = Array.isArray(withdrawal.transaction_history) ? withdrawal.transaction_history : [];
  const transactionReference = `TXN${Date.now()}`;
  let patch;

  if (nextState === 'approve') {
    patch = {
      status: 'APPROVED',
      withdrawal_status: 'WITHDRAWAL_APPROVED',
      approved_at: now,
      last_updated_at: now,
      updated_at: now,
      operator_type: 'MOCK_OPERATOR',
      transaction_history: appendHistory(history, {
        timestamp: now,
        status: 'WITHDRAWAL_APPROVED',
        description: 'อนุมัติการถอนเงิน'
      })
    };
  } else if (nextState === 'complete') {
    patch = {
      status: 'COMPLETED',
      withdrawal_status: 'WITHDRAWAL_COMPLETE',
      completed_at: now,
      last_updated_at: now,
      updated_at: now,
      transaction_reference: transactionReference,
      response_data: { completed_at: now, reference: transactionReference },
      transaction_history: appendHistory(history, {
        timestamp: now,
        status: 'WITHDRAWAL_COMPLETE',
        description: 'ถอนเงินสำเร็จ',
        transaction_reference: transactionReference
      })
    };
  } else {
    patch = {
      status: 'REJECTED',
      withdrawal_status: 'WITHDRAWAL_REJECTED',
      rejected_reason: 'REJECTED_BY_MOCK',
      last_updated_at: now,
      updated_at: now,
      transaction_history: appendHistory(history, {
        timestamp: now,
        status: 'WITHDRAWAL_REJECTED',
        description: 'ปฏิเสธการถอนเงิน'
      })
    };
  }

  db.updateWithdrawalState(withdrawal.id, patch, (err) => {
    if (err) return cb(err);
    db.findWithdrawalById(withdrawal.id, cb);
  });
};

const scheduleWithdrawalAutoComplete = (withdrawalId) => {
  setTimeout(() => {
    db.findWithdrawalById(withdrawalId, (findErr, latestWithdrawal) => {
      if (findErr || !latestWithdrawal) {
        if (findErr) {
          console.error('[withdrawal-auto-complete] find error:', findErr.message);
        }
        return;
      }

      if (latestWithdrawal.status !== 'PENDING') {
        return;
      }

      applyWithdrawalState(latestWithdrawal, 'complete', async (updateErr, completedWithdrawal) => {
        if (updateErr) {
          console.error('[withdrawal-auto-complete] update error:', updateErr.message);
          return;
        }

        withActiveMerchant(async (merchantErr, merchant) => {
          if (merchantErr) {
            console.error('[withdrawal-auto-complete] merchant lookup error:', merchantErr.message);
            return;
          }

          try {
            const webhookResult = await sendWithdrawalWebhookIfConfigured(completedWithdrawal, merchant);
            console.log('[withdrawal-auto-complete] webhook result:', JSON.stringify({
              withdrawal_id: completedWithdrawal.id,
              sent: webhookResult.sent,
              destination: webhookResult.destination || null,
              reason: webhookResult.reason || null,
              request_id: webhookResult.request_id || null
            }));
          } catch (webhookErr) {
            console.error('[withdrawal-auto-complete] webhook error:', webhookErr.message);
          }
        });
      });
    });
  }, WITHDRAWAL_WEBHOOK_DELAY_MS);
};

const schedulePaymentAutoComplete = (paymentId, merchant) => {
  setTimeout(() => {
    getPaymentWithTransaction(paymentId, (findErr, payment, existingTransaction) => {
      if (findErr || !payment) {
        if (findErr) {
          console.error('[payment-auto-complete] find error:', findErr.message);
        }
        return;
      }

      if (payment.status !== 'PENDING') {
        return;
      }

      const now = new Date().toISOString();
      const saveSuccessState = (callback) => {
        db.updatePaymentState(payment.id, {
          payment_status: 'PAYMENT_PAID',
          payment_match_type: 'EXACTLY',
          is_completed: 1,
          status: 'SUCCESS',
          failed_reason: null,
          updated_at: now
        }, callback);
      };

      const finalize = async (transaction) => {
        const paymentState = {
          ...payment,
          status: 'SUCCESS',
          payment_status: 'PAYMENT_PAID',
          payment_match_type: 'EXACTLY',
          is_completed: true,
          updated_at: now
        };

        try {
          const webhookResult = await sendWebhookIfConfigured(paymentState, transaction, merchant);
          console.log('[payment-auto-complete] webhook result:', JSON.stringify({
            payment_id: payment.id,
            sent: webhookResult.sent,
            destination: webhookResult.destination || null,
            reason: webhookResult.reason || null
          }));
        } catch (webhookErr) {
          console.error('[payment-auto-complete] webhook error:', webhookErr.message);
        }
      };

      if (payment.invoice_type === 'CRYPTO') {
        return saveSuccessState((updateErr) => {
          if (updateErr) {
            console.error('[payment-auto-complete] update error:', updateErr.message);
            return;
          }
          finalize(null);
        });
      }

      if (existingTransaction) {
        return saveSuccessState((updateErr) => {
          if (updateErr) {
            console.error('[payment-auto-complete] update error:', updateErr.message);
            return;
          }
          finalize(existingTransaction);
        });
      }

      saveSuccessState((updateErr) => {
        if (updateErr) {
          console.error('[payment-auto-complete] update error:', updateErr.message);
          return;
        }
        db.createTransactionFromPayment(payment, merchant, (txErr, transaction) => {
          if (txErr) {
            console.error('[payment-auto-complete] create transaction error:', txErr.message);
            return;
          }
          finalize(transaction);
        });
      });
    });
  }, PAYMENT_WEBHOOK_DELAY_MS);
};

const buildBalancePayload = (ledger) => {
  const makeAsset = (symbol) => {
    const isThb = symbol === 'THB';
    const available = isThb ? ledger.available : 0;
    const freeze = isThb ? ledger.freeze : 0;
    const total = isThb ? ledger.total : 0;
    const rate = Number(RATE_USD[symbol] || 0);
    return {
      available: decimalString(available),
      freeze: decimalString(freeze),
      total: decimalString(total),
      total_value: decimalString(total * rate),
      available_value: decimalString(available * rate),
      freeze_value: decimalString(freeze * rate),
      rate_usd: RATE_USD[symbol] || '0',
      rate_pair: '1',
      pair: 'USD'
    };
  };

  const result = Object.keys(RATE_USD).reduce((accumulator, symbol) => {
    accumulator[symbol] = makeAsset(symbol);
    return accumulator;
  }, {});

  const thbRate = Number(RATE_USD.THB || 0);
  const btcRate = Number(RATE_USD.BTC || 1);

  return {
    error: null,
    result,
    summary: {
      total_thb: decimalString(ledger.total),
      available_thb: decimalString(ledger.available),
      pending_thb: decimalString(ledger.freeze),
      incoming_thb: decimalString(ledger.incoming),
      completed_outgoing_thb: decimalString(ledger.completed),
      base_treasury_thb: decimalString(ledger.baseTreasury)
    },
    conversion: {
      total_usd_equity: decimalString(ledger.total * thbRate),
      total_btc_equity: decimalString((ledger.total * thbRate) / btcRate),
      exchange_rate_thb_usd: decimalString(thbRate),
      last_updated: new Date().toISOString()
    },
    id: Number(`${Date.now()}0000`),
    uulid: String(Date.now() - 123456),
    agent_id: 'c5688e45-584f-4d54-8fbe-b07179034917'
  };
};

app.get('/', (req, res) => {
  res.json({
    service: 'worldpayz-mock',
    port: PORT,
    apiKey: API_KEY,
    secretKey: SECRET_KEY,
    endpoints: [
      'GET /v1/balance/query',
      'GET /v1/ebank/bankConfig',
      'GET /v1/chain/list',
      'POST /v1/payment/createInvoicePayment/fiat',
      'POST /v1/payment/createInvoicePayment/crypto',
      'GET /v1/payment/info?id=<invoice_id>',
      'POST /v1/payment/cancel',
      'POST /v1/withdrawal/createRequest/fiat',
      'POST /v1/withdrawal/createRequest/crypto',
      'GET /v1/withdrawal/list?skip=0&take=10',
      'GET /v1/withdrawal/info?id=<withdrawal_id>',
      'GET /pay/:id',
      'POST /mock/payments/:id/confirm',
      'POST /mock/payments/:id/cancel',
      'POST /mock/payments/:id/webhook',
      'POST /mock/withdrawals/:id/approve',
      'POST /mock/withdrawals/:id/complete',
      'POST /mock/withdrawals/:id/reject',
      'POST /mock/webhook/receive'
    ]
  });
});

app.get('/v1/balance/query', requireSignatureAuth, (req, res) => {
  db.calculateLedger((err, ledger) => {
    if (err) return failResponse(res, 500, 'Database error', 2500);
    return createResponse(res, buildBalancePayload(ledger));
  });
});

app.get('/v1/ebank/bankConfig', requireSignatureAuth, (req, res) => {
  createResponse(res, BANK_CONFIGS);
});

app.get('/v1/chain/list', requireSignatureAuth, (req, res) => {
  createResponse(res, CHAIN_LIST);
});

app.get('/v1/merchant/list', requireSignatureAuth, (req, res) => {
  db.listMerchants((err, merchants) => {
    if (err) return failResponse(res, 500, 'Database error', 4500);
    return createResponse(res, merchants);
  });
});

app.get('/v1/merchant/info', requireSignatureAuth, (req, res) => {
  const id = req.query.id;
  const merchantCode = req.query.merchant_code;

  if (!id && !merchantCode) {
    return failResponse(res, 400, 'id or merchant_code is required', 4400);
  }

  const handler = id ? db.findMerchantById : db.findMerchantByCode;
  const lookupValue = id || merchantCode;

  handler(lookupValue, (err, merchant) => {
    if (err) return failResponse(res, 500, 'Database error', 4500);
    if (!merchant) return failResponse(res, 404, 'Merchant not found', 4404);
    return createResponse(res, merchant);
  });
});

app.post('/v1/merchant/update', requireSignatureAuth, (req, res) => {
  const { id, merchant_code: merchantCode } = req.body || {};
  const lookupValue = id || merchantCode;
  const findHandler = id ? db.findMerchantById : db.findMerchantByCode;

  if (!lookupValue) {
    return failResponse(res, 400, 'id or merchant_code is required', 4400);
  }

  const patch = {};
  const updatable = [
    'name',
    'provider',
    'bank_code',
    'bank_account_number',
    'bank_account_name',
    'callback_url',
    'webhook_secret',
    'api_key',
    'secret_key',
    'is_active',
    'metadata'
  ];

  updatable.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      patch[key] = req.body[key];
    }
  });

  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 1 && patch.updated_at) {
    return failResponse(res, 400, 'No updatable fields provided', 4401);
  }

  findHandler(lookupValue, (findErr, merchant) => {
    if (findErr) return failResponse(res, 500, 'Database error', 4500);
    if (!merchant) return failResponse(res, 404, 'Merchant not found', 4404);

    db.updateMerchant(merchant.id, patch, (updateErr) => {
      if (updateErr) return failResponse(res, 500, 'Database error', 4500);
      db.findMerchantById(merchant.id, (refetchErr, updatedMerchant) => {
        if (refetchErr) return failResponse(res, 500, 'Database error', 4500);
        return createResponse(res, updatedMerchant, 'merchant updated');
      });
    });
  });
});

app.post('/v1/payment/createInvoicePayment/:mode', requireSignatureAuth, (req, res) => {
  const mode = getMode(req.params.mode);
  if (!mode) return failResponse(res, 404, 'Unsupported payment mode', 2404);

  const required = mode === 'fiat' ? [...PAYMENT_FIELDS, ...PAYMENT_FIAT_FIELDS] : PAYMENT_FIELDS;
  const missing = validateRequired(req.body, required);
  if (missing.length > 0) return failResponse(res, 400, 'Validation failed', 2400, { missing });

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return failResponse(res, 400, 'amount must be a positive number', 2401);

  db.findPaymentByOrderId(req.body.order_id, (existingErr, existingPayment) => {
    if (existingErr) return failResponse(res, 500, 'Database error', 2500);
    if (existingPayment) {
      return resolveMerchantFromRequest(req, (merchantErr, merchant) => {
        if (merchantErr) return failResponse(res, 500, 'Database error', 2500);
        return createResponse(res, paymentSummary(existingPayment, merchant), 'existing order_id returned');
      });
    }

    const payment = buildPaymentRecord(req.body, mode);
    db.createPayment(payment, (createErr, createdPayment) => {
      if (createErr) return failResponse(res, 500, 'Database error', 2500, { cause: createErr.message });
      return resolveMerchantFromRequest(req, (merchantErr, merchant) => {
        if (merchantErr) return failResponse(res, 500, 'Database error', 2500);
        schedulePaymentAutoComplete(createdPayment.id, merchant);
        return createResponse(res, paymentSummary(createdPayment, merchant));
      });
    });
  });
});

app.get('/v1/payment/info', requireSignatureAuth, (req, res) => {
  const invoiceId = req.query.id || req.query.invoice_id;
  if (!invoiceId) return failResponse(res, 400, 'invoice_id is required', 2402);

  getPaymentWithTransaction(invoiceId, (err, payment, transaction) => {
    if (err) return failResponse(res, 500, 'Database error', 2500);
    if (!payment) return failResponse(res, 404, 'Invoice not found', 2404);

    return resolveMerchantFromRequest(req, (merchantErr, merchant) => {
      if (merchantErr) return failResponse(res, 500, 'Database error', 2500);
      return createResponse(res, {
        payment: paymentSummary(payment, merchant),
        transaction: payment.invoice_type === 'CRYPTO' ? {
          id: payment.status === 'SUCCESS' ? `tx-${payment.id}` : null,
          txid: payment.status === 'SUCCESS' ? `mock-${payment.id}` : null,
          chain: payment.chain,
          network: payment.network,
          amount: payment.payment_amount,
          status: payment.status === 'SUCCESS' ? 'COMPLETED' : 'PENDING'
        } : null,
        transaction_fiat: transaction
      });
    });
  });
});

app.post('/v1/payment/cancel', requireSignatureAuth, (req, res) => {
  const { id } = req.body || {};
  if (!id) return failResponse(res, 400, 'id is required', 2403);

  getPaymentWithTransaction(id, (err, payment, transaction) => {
    if (err) return failResponse(res, 500, 'Database error', 2500);
    if (!payment) return failResponse(res, 404, 'Payment not found', 2404);
    if (payment.status === 'CANCELLED') {
      return res.json({ success: true, message: 'Payment cancelled successfully', data: { id: payment.id, status: 'cancelled', cancelled_at: payment.cancelled_at } });
    }
    if (transaction || (payment.is_completed && payment.status !== 'PENDING')) {
      return failResponse(res, 409, 'Payment already completed and cannot be cancelled', 2409);
    }

    const cancelledAt = new Date().toISOString();
    db.updatePaymentState(id, {
      payment_status: 'PAYMENT_CANCELLED',
      payment_match_type: 'CANCELLED',
      is_completed: 1,
      status: 'CANCELLED',
      cancelled_at: cancelledAt,
      failed_reason: 'CANCELLED_BY_USER',
      updated_at: cancelledAt
    }, (updateErr) => {
      if (updateErr) return failResponse(res, 500, 'Database error', 2500);
      return res.json({ success: true, message: 'Payment cancelled successfully', data: { id, status: 'cancelled', cancelled_at: cancelledAt } });
    });
  });
});

app.post('/v1/withdrawal/createRequest/:mode', requireSignatureAuth, (req, res) => {
  const mode = getMode(req.params.mode);
  if (!mode) return failResponse(res, 404, 'Unsupported withdrawal mode', 3404);

  const required = mode === 'fiat' ? [...WITHDRAWAL_FIELDS, ...WITHDRAWAL_FIAT_FIELDS] : WITHDRAWAL_FIELDS;
  const missing = validateRequired(req.body, required);
  if (missing.length > 0) return failResponse(res, 400, 'Validation failed', 3400, { missing });

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return failResponse(res, 400, 'amount must be a positive number', 3401);

  db.findWithdrawalByOrderId(req.body.order_id, (findErr, existingWithdrawal) => {
    if (findErr) return failResponse(res, 500, 'Database error', 3500);
    if (existingWithdrawal) return createResponse(res, withdrawalSummary(existingWithdrawal), 'existing order_id returned');

    resolveMerchantFromRequest(req, (merchantErr, merchant) => {
      if (merchantErr) return failResponse(res, 500, 'Database error', 3500);

      const requestBody = {
        ...req.body,
        callback_url: req.body.callback_url || merchant.callback_url || null
      };
      const withdrawal = buildWithdrawalRecord(requestBody, mode, req.ip);
      db.createWithdrawal(withdrawal, (createErr, createdWithdrawal) => {
        if (createErr) return failResponse(res, 500, 'Database error', 3500, { cause: createErr.message });
        scheduleWithdrawalAutoComplete(createdWithdrawal.id);
        return createResponse(res, withdrawalSummary(createdWithdrawal));
      });
    });
  });
});

app.get('/v1/withdrawal/list', requireSignatureAuth, (req, res) => {
  const skip = Number(req.query.skip);
  const take = Number(req.query.take);
  if (!Number.isInteger(skip) || !Number.isInteger(take)) return failResponse(res, 400, 'skip and take are required numbers', 3402);

  db.listWithdrawals(skip, take, (err, result) => {
    if (err) return failResponse(res, 500, 'Database error', 3500);
    return createResponse(res, result.rows.map(withdrawalSummary));
  });
});

app.get('/v1/withdrawal/info', requireSignatureAuth, (req, res) => {
  const id = req.query.id;
  const orderId = req.query.order_id;
  if (!id && !orderId) return failResponse(res, 400, 'id or order_id is required', 3403);

  const handler = id ? db.findWithdrawalById : db.findWithdrawalByOrderId;
  handler(id || orderId, (err, withdrawal) => {
    if (err) return failResponse(res, 500, 'Database error', 3500);
    if (!withdrawal) return failResponse(res, 404, 'Withdrawal not found', 3404);
    return res.json({
      success: true,
      message: 'ดึงข้อมูลสำเร็จ',
      code: 0,
      data: withdrawalDetail(withdrawal),
      timestamp: new Date().toISOString()
    });
  });
});

app.get('/pay/:id', (req, res) => {
  getPaymentWithTransaction(req.params.id, (err, payment, transaction) => {
    if (err || !payment) return res.status(404).send('<h2>Payment not found</h2>');

    const isLocked = Boolean(transaction) || payment.status === 'CANCELLED';
    const actionButtons = isLocked
      ? '<p>รายการนี้ถูกสรุปสถานะแล้ว</p>'
      : `
        <form method="POST" action="/mock/payments/${payment.id}/confirm" style="display:inline-block;margin:0 8px;">
          <button type="submit" style="padding:12px 24px;border:none;border-radius:8px;background:#0f8b8d;color:#fff;cursor:pointer;">ยืนยันว่าจ่ายแล้ว</button>
        </form>
        <form method="POST" action="/mock/payments/${payment.id}/cancel" style="display:inline-block;margin:0 8px;">
          <button type="submit" style="padding:12px 24px;border:none;border-radius:8px;background:#d1495b;color:#fff;cursor:pointer;">ยกเลิกรายการ</button>
        </form>
      `;

    return res.send(`<!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8" />
        <title>Worldpayz Mock Payment</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f5f0e8; color: #1f2933; margin: 0; }
          .card { max-width: 520px; margin: 48px auto; background: #fffdf9; border: 1px solid #e2d7c5; border-radius: 16px; padding: 28px; box-shadow: 0 18px 50px rgba(0,0,0,0.08); }
          .muted { color: #52606d; }
          .row { margin: 10px 0; }
          code { background: #f0e7db; padding: 2px 6px; border-radius: 6px; }
          .qr { word-break: break-all; padding: 12px; background: #fcf7ef; border-radius: 10px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Worldpayz Mock Payment</h2>
          <div class="row">Invoice: <code>${payment.id}</code></div>
          <div class="row">Order: <strong>${payment.order_id}</strong></div>
          <div class="row">Mode: <strong>${payment.invoice_type}</strong></div>
          <div class="row">Amount: <strong>${payment.payment_amount} ${payment.to_currency}</strong></div>
          <div class="row">Status: <strong>${payment.status}</strong> / <span class="muted">${payment.payment_status}</span></div>
          <div class="row">Address/QR:</div>
          <div class="qr">${payment.payment_qr || getPaymentAddress(payment)}</div>
          <div class="row" style="margin-top:24px;">${actionButtons}</div>
          <div class="row" style="margin-top:16px;">
            <form method="POST" action="/mock/payments/${payment.id}/webhook">
              <button type="submit" style="padding:10px 20px;border:none;border-radius:8px;background:#6c7a89;color:#fff;cursor:pointer;">ส่ง webhook อีกครั้ง</button>
            </form>
          </div>
          <p class="muted" style="margin-top:20px;">Webhook target: ${WEBHOOK_URL || 'not configured'}</p>
        </div>
      </body>
      </html>`);
  });
});

app.post('/mock/payments/:id/confirm', (req, res) => {
  getPaymentWithTransaction(req.params.id, (err, payment, existingTransaction) => {
    if (err || !payment) return res.status(404).send('Payment not found');
    if (payment.status === 'CANCELLED') return res.status(409).send('Payment already cancelled');

    withActiveMerchant((merchantErr, merchant) => {
      if (merchantErr) return res.status(500).send('Database error');

      const now = new Date().toISOString();
      const finalize = (transaction) => {
        const paymentState = { ...payment, status: 'SUCCESS', payment_status: 'PAYMENT_PAID', payment_match_type: 'EXACTLY', is_completed: true, updated_at: now };
        sendWebhookIfConfigured(paymentState, transaction, merchant)
          .then((webhookResult) => {
            res.send(`<h2>Payment confirmed</h2><p>Invoice ${payment.id} marked as SUCCESS</p><pre>${JSON.stringify(webhookResult, null, 2)}</pre>`);
          })
          .catch((webhookErr) => {
            res.send(`<h2>Payment confirmed</h2><p>Invoice ${payment.id} marked as SUCCESS</p><pre>${JSON.stringify({ sent: false, error: webhookErr.message }, null, 2)}</pre>`);
          });
      };

      const saveSuccessState = (callback) => {
        db.updatePaymentState(payment.id, {
          payment_status: 'PAYMENT_PAID',
          payment_match_type: 'EXACTLY',
          is_completed: 1,
          status: 'SUCCESS',
          failed_reason: null,
          updated_at: now
        }, callback);
      };

      if (payment.invoice_type === 'CRYPTO') {
        return saveSuccessState((updateErr) => {
          if (updateErr) return res.status(500).send('Database error');
          return finalize(null);
        });
      }

      if (existingTransaction) {
        return saveSuccessState((updateErr) => {
          if (updateErr) return res.status(500).send('Database error');
          return finalize(existingTransaction);
        });
      }

      saveSuccessState((updateErr) => {
        if (updateErr) return res.status(500).send('Database error');
        db.createTransactionFromPayment(payment, merchant, (txErr, transaction) => {
          if (txErr) return res.status(500).send('Database error');
          return finalize(transaction);
        });
      });
    });
  });
});

app.post('/mock/payments/:id/cancel', (req, res) => {
  getPaymentWithTransaction(req.params.id, (err, payment, transaction) => {
    if (err || !payment) return res.status(404).send('Payment not found');
    if (transaction) return res.status(409).send('Completed payment cannot be cancelled');
    const cancelledAt = new Date().toISOString();
    db.updatePaymentState(payment.id, {
      payment_status: 'PAYMENT_CANCELLED',
      payment_match_type: 'CANCELLED',
      is_completed: 1,
      status: 'CANCELLED',
      cancelled_at: cancelledAt,
      failed_reason: 'CANCELLED_BY_USER',
      updated_at: cancelledAt
    }, (updateErr) => {
      if (updateErr) return res.status(500).send('Database error');
      return res.send(`<h2>Payment cancelled</h2><p>Invoice ${payment.id} marked as CANCELLED</p>`);
    });
  });
});

app.post('/mock/payments/:id/webhook', (req, res) => {
  getPaymentWithTransaction(req.params.id, async (err, payment, transaction) => {
    if (err || !payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status !== 'SUCCESS') return res.status(409).json({ success: false, message: 'Payment must be SUCCESS before sending webhook' });
    return withActiveMerchant(async (merchantErr, merchant) => {
      if (merchantErr) return res.status(500).json({ success: false, message: 'Database error' });
      try {
        const result = await sendWebhookIfConfigured(payment, transaction, merchant);
        return res.json({ success: true, data: result });
      } catch (webhookErr) {
        return res.status(500).json({ success: false, message: webhookErr.message });
      }
    });
  });
});

app.post('/mock/withdrawals/:id/approve', (req, res) => {
  db.findWithdrawalById(req.params.id, (err, withdrawal) => {
    if (err || !withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    applyWithdrawalState(withdrawal, 'approve', (updateErr, updated) => {
      if (updateErr) return res.status(500).json({ success: false, message: 'Database error' });
      return res.json({ success: true, data: withdrawalSummary(updated) });
    });
  });
});

app.post('/mock/withdrawals/:id/complete', (req, res) => {
  db.findWithdrawalById(req.params.id, (err, withdrawal) => {
    if (err || !withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    applyWithdrawalState(withdrawal, 'complete', (updateErr, updated) => {
      if (updateErr) return res.status(500).json({ success: false, message: 'Database error' });
      return res.json({ success: true, data: withdrawalSummary(updated) });
    });
  });
});

app.post('/mock/withdrawals/:id/reject', (req, res) => {
  db.findWithdrawalById(req.params.id, (err, withdrawal) => {
    if (err || !withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    applyWithdrawalState(withdrawal, 'reject', (updateErr, updated) => {
      if (updateErr) return res.status(500).json({ success: false, message: 'Database error' });
      return res.json({ success: true, data: withdrawalSummary(updated) });
    });
  });
});

app.post('/mock/webhook/receive', (req, res) => {
  console.log('[Worldpayz mock webhook received]', JSON.stringify(req.body, null, 2));
  return res.json({ success: true, message: 'Webhook received by mock receiver' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, code: 4040, message: 'Not found' });
});

db.init();
app.listen(PORT, () => {
  console.log(`Mock Worldpayz API running on port ${PORT}`);
  console.log(`API key: ${API_KEY}`);
  console.log(`Secret key: ${SECRET_KEY}`);
});
