import { buildPackagePreview, generateOrderNo } from "../lib/billing.mjs";
import { getOptionalAuth } from "../lib/auth.mjs";
import { getBillingOrder, saveBillingOrder, updateBillingOrder } from "../lib/orderStore.mjs";
import {
  createAlipayPageCheckout,
  getAlipayRuntimeStatus,
  queryAlipayTrade,
  verifyAlipayNotification,
} from "../providers/alipay.mjs";

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

function mapTradeStatus(status) {
  switch (status) {
    case "TRADE_SUCCESS":
    case "TRADE_FINISHED":
      return "PAID";
    case "WAIT_BUYER_PAY":
      return "PENDING_PAYMENT";
    case "TRADE_CLOSED":
      return "CLOSED";
    default:
      return status || "UNKNOWN";
  }
}

function normalizeOrder(order) {
  if (!order) {
    return null;
  }

  return {
    orderNo: order.orderNo,
    provider: order.provider,
    packageCode: order.packageCode,
    packageName: order.packageName,
    amount: order.amount,
    totalCredits: order.totalCredits,
    status: order.status,
    tradeStatus: order.tradeStatus,
    tradeNo: order.tradeNo,
    paymentMethod: order.paymentMethod,
    buyerId: order.buyerId,
    buyerPayAmount: order.buyerPayAmount,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    updatedAt: order.updatedAt,
  };
}

function applyTradeResult(orderNo, payload) {
  const next = updateBillingOrder(orderNo, {
    status: mapTradeStatus(payload.trade_status),
    tradeStatus: payload.trade_status,
    tradeNo: payload.trade_no,
    paymentMethod: payload.fund_bill_list?.[0]?.fund_channel || "alipay",
    buyerId: payload.buyer_user_id,
    buyerPayAmount: payload.buyer_pay_amount,
    paidAt: payload.send_pay_date || undefined,
    gatewayPayload: payload,
  });

  return next;
}

export function registerPaymentRoutes(app) {
  app.get("/api/payments/runtime", (_req, res) => {
    res.json({
      success: true,
      data: {
        alipayPage: getAlipayRuntimeStatus(),
      },
    });
  });

  app.post("/api/payments/alipay/page/create", (req, res) => {
    const auth = getOptionalAuth(req);

    if (auth?.invalid) {
      return res.status(401).json({
        success: false,
        message: "登录状态已失效，请重新登录。",
      });
    }

    const packageCode = String(req.body?.packageCode || "").trim();

    if (!packageCode) {
      return badRequest(res, "packageCode 不能为空。");
    }

    const preview = buildPackagePreview(packageCode);

    if (!preview) {
      return badRequest(res, `未找到套餐：${packageCode}`);
    }

    try {
      const orderNo = generateOrderNo("CVMPAY");
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const localOrder = {
        orderNo,
        orderType: "topup",
        source: "personal",
        provider: "alipay_page",
        userId: auth?.user?.id,
        packageCode,
        packageName: preview.package.name,
        amount: preview.amount,
        totalCredits: preview.totalCredits,
        status: "PENDING_PAYMENT",
        tradeStatus: "WAIT_BUYER_PAY",
        createdAt: now,
        updatedAt: now,
        expiresAt,
      };

      saveBillingOrder(localOrder);

      const checkout = createAlipayPageCheckout({
        orderNo,
        amount: preview.amount,
        subject: `Creative Vision Music - ${preview.package.name}`,
        body: `${preview.package.name} ${preview.totalCredits} 积分`,
      });

      return res.json({
        success: true,
        data: {
          provider: "alipay_page",
          openMode: "new_tab",
          checkoutUrl: checkout.checkoutUrl,
          order: normalizeOrder(localOrder),
        },
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        detail: error.payload,
      });
    }
  });

  app.post("/api/payments/alipay/notify", (req, res) => {
    try {
      const valid = verifyAlipayNotification(req.body || {});

      if (!valid) {
        return res.status(400).send("failure");
      }

      const orderNo = String(req.body?.out_trade_no || "").trim();

      if (!orderNo) {
        return res.status(400).send("failure");
      }

      applyTradeResult(orderNo, req.body);
      return res.type("text/plain").send("success");
    } catch {
      return res.status(500).send("failure");
    }
  });

  app.get("/api/payments/orders/:orderNo", (req, res) => {
    const orderNo = String(req.params.orderNo || "").trim();

    if (!orderNo) {
      return badRequest(res, "orderNo 不能为空。");
    }

    const order = getBillingOrder(orderNo);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "订单不存在。",
      });
    }

    return res.json({
      success: true,
      data: normalizeOrder(order),
    });
  });

  app.post("/api/payments/orders/:orderNo/reconcile", async (req, res) => {
    const orderNo = String(req.params.orderNo || "").trim();

    if (!orderNo) {
      return badRequest(res, "orderNo 不能为空。");
    }

    const order = getBillingOrder(orderNo);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "订单不存在。",
      });
    }

    try {
      const payload = await queryAlipayTrade({
        orderNo,
        tradeNo: order.tradeNo,
      });

      const next = applyTradeResult(orderNo, payload);

      return res.json({
        success: true,
        data: normalizeOrder(next),
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        detail: error.payload,
      });
    }
  });
}
