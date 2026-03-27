import { getDatabase } from "./database.mjs";

function toJson(value) {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function fromJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeOrder(order) {
  if (!order) {
    return null;
  }

  return {
    orderNo: order.order_no,
    orderType: order.order_type,
    source: order.source,
    provider: order.provider,
    userId: order.user_id || undefined,
    organizationId: order.organization_id || undefined,
    packageCode: order.package_code || undefined,
    packageName: order.package_name || undefined,
    amount: Number(order.amount || 0),
    totalCredits: Number(order.total_credits || 0),
    status: order.status,
    tradeStatus: order.trade_status || undefined,
    tradeNo: order.trade_no || undefined,
    paymentMethod: order.payment_method || undefined,
    buyerId: order.buyer_id || undefined,
    buyerPayAmount: order.buyer_pay_amount || undefined,
    checkoutMode: order.checkout_mode || undefined,
    settlementMode: order.settlement_mode || undefined,
    channels: fromJson(order.channels, []),
    payUrl: order.pay_url || undefined,
    instructions: fromJson(order.instructions, []),
    gatewayPayload: fromJson(order.gateway_payload, null),
    createdAt: order.created_at,
    expiresAt: order.expires_at || undefined,
    paidAt: order.paid_at || undefined,
    updatedAt: order.updated_at || undefined,
  };
}

function buildOrderRecord(order) {
  const now = new Date().toISOString();

  return {
    orderNo: String(order.orderNo || "").trim(),
    orderType: String(order.orderType || "topup"),
    source: String(order.source || "personal"),
    provider: String(order.provider || "manual_confirm"),
    userId: order.userId ? String(order.userId) : null,
    organizationId: order.organizationId ? String(order.organizationId) : null,
    packageCode: order.packageCode ? String(order.packageCode) : null,
    packageName: order.packageName ? String(order.packageName) : null,
    amount: Number(order.amount || 0),
    totalCredits: Number(order.totalCredits || 0),
    status: String(order.status || "PENDING_PAYMENT"),
    tradeStatus: order.tradeStatus ? String(order.tradeStatus) : null,
    tradeNo: order.tradeNo ? String(order.tradeNo) : null,
    paymentMethod: order.paymentMethod ? String(order.paymentMethod) : null,
    buyerId: order.buyerId ? String(order.buyerId) : null,
    buyerPayAmount:
      order.buyerPayAmount === undefined || order.buyerPayAmount === null
        ? null
        : String(order.buyerPayAmount),
    checkoutMode: order.checkoutMode ? String(order.checkoutMode) : null,
    settlementMode: order.settlementMode ? String(order.settlementMode) : null,
    channels: order.channels === undefined ? null : toJson(order.channels),
    payUrl: order.payUrl ? String(order.payUrl) : null,
    instructions: order.instructions === undefined ? null : toJson(order.instructions),
    gatewayPayload: order.gatewayPayload === undefined ? null : toJson(order.gatewayPayload),
    expiresAt: order.expiresAt ? String(order.expiresAt) : null,
    paidAt: order.paidAt ? String(order.paidAt) : null,
    createdAt: order.createdAt ? String(order.createdAt) : now,
    updatedAt: order.updatedAt ? String(order.updatedAt) : order.createdAt ? String(order.createdAt) : now,
  };
}

const upsertOrderStatement = `
  INSERT INTO billing_orders (
    order_no,
    order_type,
    source,
    provider,
    user_id,
    organization_id,
    package_code,
    package_name,
    amount,
    total_credits,
    status,
    trade_status,
    trade_no,
    payment_method,
    buyer_id,
    buyer_pay_amount,
    checkout_mode,
    settlement_mode,
    channels,
    pay_url,
    instructions,
    gateway_payload,
    expires_at,
    paid_at,
    created_at,
    updated_at
  ) VALUES (
    :orderNo,
    :orderType,
    :source,
    :provider,
    :userId,
    :organizationId,
    :packageCode,
    :packageName,
    :amount,
    :totalCredits,
    :status,
    :tradeStatus,
    :tradeNo,
    :paymentMethod,
    :buyerId,
    :buyerPayAmount,
    :checkoutMode,
    :settlementMode,
    :channels,
    :payUrl,
    :instructions,
    :gatewayPayload,
    :expiresAt,
    :paidAt,
    :createdAt,
    :updatedAt
  )
  ON CONFLICT(order_no) DO UPDATE SET
    order_type = excluded.order_type,
    source = excluded.source,
    provider = excluded.provider,
    user_id = excluded.user_id,
    organization_id = excluded.organization_id,
    package_code = excluded.package_code,
    package_name = excluded.package_name,
    amount = excluded.amount,
    total_credits = excluded.total_credits,
    status = excluded.status,
    trade_status = excluded.trade_status,
    trade_no = excluded.trade_no,
    payment_method = excluded.payment_method,
    buyer_id = excluded.buyer_id,
    buyer_pay_amount = excluded.buyer_pay_amount,
    checkout_mode = excluded.checkout_mode,
    settlement_mode = excluded.settlement_mode,
    channels = excluded.channels,
    pay_url = excluded.pay_url,
    instructions = excluded.instructions,
    gateway_payload = excluded.gateway_payload,
    expires_at = excluded.expires_at,
    paid_at = excluded.paid_at,
    updated_at = excluded.updated_at
`;

export function saveBillingOrder(order) {
  const database = getDatabase();
  const record = buildOrderRecord(order);

  if (!record.orderNo) {
    throw new Error("orderNo 不能为空。");
  }

  database.prepare(upsertOrderStatement).run(record);
  return getBillingOrder(record.orderNo);
}

export function getBillingOrder(orderNo) {
  const database = getDatabase();
  const row = database
    .prepare("SELECT * FROM billing_orders WHERE order_no = ? LIMIT 1")
    .get(String(orderNo || "").trim());

  return normalizeOrder(row);
}

export function updateBillingOrder(orderNo, patch) {
  const current = getBillingOrder(orderNo);

  if (!current) {
    return null;
  }

  return saveBillingOrder({
    ...current,
    ...patch,
    orderNo: current.orderNo,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });
}
