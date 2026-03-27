import crypto from "node:crypto";

const ALIPAY_GATEWAY = "https://openapi.alipay.com/gateway.do";

function cleanKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function toPem(value, type) {
  const raw = cleanKey(value);

  if (!raw) {
    return "";
  }

  if (raw.includes("BEGIN")) {
    return raw;
  }

  const chunks = raw.replace(/\s+/g, "").match(/.{1,64}/g) || [];
  return [`-----BEGIN ${type}-----`, ...chunks, `-----END ${type}-----`].join("\n");
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
  ].join("");
}

function buildSignContent(params) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type")
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function compactParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function signParams(params, privateKey) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(buildSignContent(params), "utf8");
  return signer.sign(privateKey, "base64");
}

function verifyParams(params, publicKey) {
  const signature = String(params.sign || "");

  if (!signature) {
    return false;
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(buildSignContent(params), "utf8");
  return verifier.verify(publicKey, signature, "base64");
}

export function getAlipayRuntimeStatus() {
  const appId = String(process.env.ALIPAY_APP_ID || "").trim();
  const privateKey = toPem(process.env.ALIPAY_PRIVATE_KEY, "PRIVATE KEY");
  const publicKey = toPem(process.env.ALIPAY_PUBLIC_KEY, "PUBLIC KEY");
  const notifyUrl = String(process.env.ALIPAY_NOTIFY_URL || "").trim();
  const returnUrl = String(process.env.ALIPAY_RETURN_URL || "").trim();
  const gateway = String(process.env.ALIPAY_GATEWAY || ALIPAY_GATEWAY).trim();

  return {
    configured: Boolean(appId && privateKey && publicKey),
    appIdConfigured: Boolean(appId),
    privateKeyConfigured: Boolean(privateKey),
    publicKeyConfigured: Boolean(publicKey),
    notifyUrlConfigured: Boolean(notifyUrl),
    returnUrlConfigured: Boolean(returnUrl),
    gateway,
    mode: appId && privateKey && publicKey ? "real" : "manual",
  };
}

function assertAlipayConfigured() {
  const runtime = getAlipayRuntimeStatus();

  if (!runtime.configured) {
    const missing = [];

    if (!runtime.appIdConfigured) {
      missing.push("ALIPAY_APP_ID");
    }

    if (!runtime.privateKeyConfigured) {
      missing.push("ALIPAY_PRIVATE_KEY");
    }

    if (!runtime.publicKeyConfigured) {
      missing.push("ALIPAY_PUBLIC_KEY");
    }

    const error = new Error(`支付宝支付未配置完整，缺少：${missing.join("、")}`);
    error.statusCode = 501;
    throw error;
  }
}

function getConfig() {
  assertAlipayConfigured();

  return {
    appId: String(process.env.ALIPAY_APP_ID || "").trim(),
    privateKey: toPem(process.env.ALIPAY_PRIVATE_KEY, "PRIVATE KEY"),
    publicKey: toPem(process.env.ALIPAY_PUBLIC_KEY, "PUBLIC KEY"),
    notifyUrl: String(process.env.ALIPAY_NOTIFY_URL || "").trim(),
    returnUrl: String(process.env.ALIPAY_RETURN_URL || "").trim(),
    gateway: String(process.env.ALIPAY_GATEWAY || ALIPAY_GATEWAY).trim(),
  };
}

export function createAlipayPageCheckout(input) {
  const config = getConfig();

  const params = {
    app_id: config.appId,
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: formatTimestamp(),
    version: "1.0",
    notify_url: config.notifyUrl,
    return_url: config.returnUrl,
    biz_content: JSON.stringify({
      out_trade_no: input.orderNo,
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: Number(input.amount).toFixed(2),
      subject: input.subject,
      body: input.body,
      timeout_express: "30m",
    }),
  };
  const normalized = compactParams(params);

  const sign = signParams(normalized, config.privateKey);
  const query = new URLSearchParams({
    ...normalized,
    sign,
  });

  return {
    checkoutUrl: `${config.gateway}?${query.toString()}`,
    method: "GET",
  };
}

export function verifyAlipayNotification(params) {
  const config = getConfig();
  return verifyParams(params, config.publicKey);
}

export async function queryAlipayTrade({ orderNo, tradeNo }) {
  const config = getConfig();
  const bizContent = tradeNo
    ? { trade_no: tradeNo }
    : {
        out_trade_no: orderNo,
      };

  const params = {
    app_id: config.appId,
    method: "alipay.trade.query",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: formatTimestamp(),
    version: "1.0",
    biz_content: JSON.stringify(bizContent),
  };
  const normalized = compactParams(params);

  const sign = signParams(normalized, config.privateKey);
  const body = new URLSearchParams({
    ...normalized,
    sign,
  });

  const response = await fetch(config.gateway, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });

  const payload = await response.json();
  const result = payload?.alipay_trade_query_response;

  if (!response.ok || !result) {
    const error = new Error("支付宝订单查询失败。");
    error.statusCode = response.status || 500;
    error.payload = payload;
    throw error;
  }

  if (result.code !== "10000") {
    const error = new Error(result.sub_msg || result.msg || "支付宝订单查询失败。");
    error.statusCode = 400;
    error.payload = payload;
    throw error;
  }

  return result;
}
