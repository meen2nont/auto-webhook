const crypto = require('crypto');

const baseUrl = process.env.WORLDPAYZ_BASE_URL || 'http://localhost:3102';
const apiKey = process.env.WORLDPAYZ_API_KEY || 'WORLDPAYZ_MOCK_API_KEY';
const secretKey = process.env.WORLDPAYZ_SECRET_KEY || 'WORLDPAYZ_MOCK_SECRET_KEY';

const sign = (method, fullUrl, body, timestamp) => {
  const bodyString = JSON.stringify(body && Object.keys(body).length > 0 ? body : '');
  const content = `${timestamp}|${method}|${fullUrl}|${bodyString}`;
  return crypto.createHmac('sha256', secretKey).update(content).digest('hex');
};

const request = async (method, path, body) => {
  const fullUrl = `${baseUrl}${path}`;
  const timestamp = Date.now().toString();
  const headers = {
    'x-api-key': apiKey,
    'x-timestamp': timestamp,
    'x-signature': sign(method, fullUrl, body, timestamp)
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(fullUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  try {
    return {
      status: response.status,
      json: JSON.parse(text)
    };
  } catch (error) {
    throw new Error(`${method} ${path} returned non-JSON response: ${text.slice(0, 120)}`);
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  const suffix = Date.now();
  const createBody = {
    order_id: `ORDER-SMOKE-${suffix}`,
    order_user_reference: `USER-${suffix}`,
    payment_method_type: 'PROMPTPAY_QR',
    amount: '500.00',
    from_currency: 'THB',
    to_currency: 'THB',
    payer_bank_provider: 'SCB',
    payer_bank_account_number: '4052512594',
    payer_bank_account_name: 'Mock Customer',
    payment_domain: baseUrl,
    url_return: 'https://example.com/return',
    url_success: 'https://example.com/success',
    url_failed: 'https://example.com/failed',
    additional_data: {
      description: 'worldpayz smoke test'
    }
  };

  const confirmBody = {
    ...createBody,
    order_id: `ORDER-SMOKE-CONFIRM-${suffix}`,
    order_user_reference: `USER-CONFIRM-${suffix}`
  };

  const cryptoPaymentBody = {
    order_id: `ORDER-SMOKE-CRYPTO-${suffix}`,
    order_user_reference: `USER-CRYPTO-${suffix}`,
    payment_method_type: 'CRYPTO_TRANSFER',
    amount: '25.00',
    from_currency: 'USDT',
    to_currency: 'USDT',
    payment_domain: baseUrl,
    url_return: 'https://example.com/return',
    url_success: 'https://example.com/success',
    url_failed: 'https://example.com/failed',
    additional_data: {
      description: 'crypto payment smoke test'
    },
    chain: 'tron',
    network: 'testnet'
  };

  const fiatWithdrawalBody = {
    withdrawal_mode: 'FIAT',
    order_id: `WD-SMOKE-${suffix}`,
    amount: 100.5,
    currency: 'THB',
    receiver_bank: 'SCB',
    receiver_name: 'Mock Receiver',
    withdrawal_address: '9999999999',
    chain: 'offchain',
    asset_type: 'native',
    additional: {
      description: 'test withdrawal',
      reference_user_id: 123
    }
  };

  const cryptoWithdrawalBody = {
    withdrawal_mode: 'CRYPTO',
    order_id: `WD-SMOKE-CRYPTO-${suffix}`,
    amount: 50,
    currency: 'USDT',
    withdrawal_address: 'TRXMOCKADDRESS123456789',
    chain: 'tron',
    asset_type: 'trc20',
    additional: {
      description: 'test crypto withdrawal'
    }
  };

  const balance = await request('GET', '/v1/balance/query');
  assert(balance.status === 200, 'balance query failed');

  const bankConfig = await request('GET', '/v1/ebank/bankConfig');
  assert(bankConfig.status === 200, 'bank config failed');
  assert(bankConfig.json.data.SCB, 'SCB bank config missing');

  const chainList = await request('GET', '/v1/chain/list');
  assert(chainList.status === 200, 'chain list failed');
  assert(Array.isArray(chainList.json.data) && chainList.json.data.length > 0, 'chain list empty');

  const created = await request('POST', '/v1/payment/createInvoicePayment/fiat', createBody);
  assert(created.status === 200, 'create payment failed');
  assert(created.json.success === true, 'create payment returned unsuccessful response');

  const paymentId = created.json.data.id;
  const infoBefore = await request('GET', `/v1/payment/info?id=${paymentId}`);
  assert(infoBefore.status === 200, 'info before cancel failed');
  assert(infoBefore.json.data.payment.status === 'PENDING', 'payment should start as PENDING');

  const cancelled = await request('POST', '/v1/payment/cancel', { id: paymentId });
  assert(cancelled.status === 200, 'cancel payment failed');
  const infoAfter = await request('GET', `/v1/payment/info?id=${paymentId}`);
  assert(infoAfter.json.data.payment.status === 'CANCELLED', 'payment should become CANCELLED');

  const createdForConfirm = await request('POST', '/v1/payment/createInvoicePayment/fiat', confirmBody);
  assert(createdForConfirm.status === 200, 'create payment for confirm flow failed');
  const confirmPaymentId = createdForConfirm.json.data.id;
  const confirmResponse = await fetch(`${baseUrl}/mock/payments/${confirmPaymentId}/confirm`, { method: 'POST' });
  assert(confirmResponse.status === 200, 'mock confirm endpoint failed');
  const infoAfterConfirm = await request('GET', `/v1/payment/info?id=${confirmPaymentId}`);
  assert(infoAfterConfirm.json.data.payment.status === 'SUCCESS', 'payment should become SUCCESS');
  assert(infoAfterConfirm.json.data.transaction_fiat, 'transaction_fiat should exist after confirm');

  const createdCryptoPayment = await request('POST', '/v1/payment/createInvoicePayment/crypto', cryptoPaymentBody);
  assert(createdCryptoPayment.status === 200, 'create crypto payment failed');
  const cryptoPaymentId = createdCryptoPayment.json.data.id;
  const cryptoPaymentInfo = await request('GET', `/v1/payment/info?id=${cryptoPaymentId}`);
  assert(cryptoPaymentInfo.json.data.payment.invoice_type === 'CRYPTO', 'crypto payment invoice type mismatch');

  const createdWithdrawal = await request('POST', '/v1/withdrawal/createRequest/fiat', fiatWithdrawalBody);
  assert(createdWithdrawal.status === 200, 'create fiat withdrawal failed');
  const withdrawalId = createdWithdrawal.json.data.id;
  const withdrawalList = await request('GET', '/v1/withdrawal/list?skip=0&take=10');
  assert(withdrawalList.status === 200, 'withdrawal list failed');
  assert(withdrawalList.json.data.some((item) => item.id === withdrawalId), 'fiat withdrawal missing from list');
  const approveWithdrawal = await fetch(`${baseUrl}/mock/withdrawals/${withdrawalId}/approve`, { method: 'POST' });
  assert(approveWithdrawal.status === 200, 'withdrawal approve failed');
  const completeWithdrawal = await fetch(`${baseUrl}/mock/withdrawals/${withdrawalId}/complete`, { method: 'POST' });
  assert(completeWithdrawal.status === 200, 'withdrawal complete failed');
  const withdrawalInfo = await request('GET', `/v1/withdrawal/info?id=${withdrawalId}`);
  assert(withdrawalInfo.status === 200, 'withdrawal info failed');
  assert(withdrawalInfo.json.data.status === 'COMPLETED', 'withdrawal should become COMPLETED');

  const createdCryptoWithdrawal = await request('POST', '/v1/withdrawal/createRequest/crypto', cryptoWithdrawalBody);
  assert(createdCryptoWithdrawal.status === 200, 'create crypto withdrawal failed');

  console.log(JSON.stringify({
    balance,
    bankConfig,
    chainList,
    created,
    infoBefore,
    cancelled,
    infoAfter,
    createdForConfirm,
    infoAfterConfirm,
    createdCryptoPayment,
    cryptoPaymentInfo,
    createdWithdrawal,
    withdrawalList,
    withdrawalInfo,
    createdCryptoWithdrawal
  }, null, 2));
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});