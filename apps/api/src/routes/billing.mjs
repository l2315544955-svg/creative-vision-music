import { billingPolicy, buildPackagePreview, generateOrderNo, recommendedPackages } from "../lib/billing.mjs";
import { getOptionalAuth } from "../lib/auth.mjs";
import { buildCreditPrecheck, resolvePricingCodeForTask } from "../lib/creditsStore.mjs";
import { saveBillingOrder } from "../lib/orderStore.mjs";

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

export function registerBillingRoutes(app) {
  app.get("/api/billing/packages", (_req, res) => {
    res.json({
      success: true,
      data: {
        policy: billingPolicy,
        packages: recommendedPackages.map((item) => ({
          ...item,
          totalCredits: Number(item.credits || 0) + Number(item.bonusCredits || 0),
        })),
      },
    });
  });

  app.post("/api/billing/preview", (req, res) => {
    const packageCode = String(req.body?.packageCode || "").trim();

    if (!packageCode) {
      return badRequest(res, "packageCode 不能为空。");
    }

    const preview = buildPackagePreview(packageCode);

    if (!preview) {
      return badRequest(res, `未找到套餐：${packageCode}`);
    }

    return res.json({
      success: true,
      data: preview,
    });
  });

  app.post("/api/billing/precheck", (req, res) => {
    const auth = getOptionalAuth(req);

    if (auth?.invalid) {
      return res.status(401).json({
        success: false,
        message: "登录状态已失效，请重新登录。",
      });
    }

    if (!auth?.user) {
      return res.status(401).json({
        success: false,
        message: "请先登录。",
      });
    }

    const pricingCode = String(req.body?.pricingCode || "").trim();
    const provider = String(req.body?.provider || "").trim();
    const taskType = String(req.body?.taskType || "music").trim();
    const modelCode = String(req.body?.modelCode || "").trim();
    const resolvedPricingCode =
      pricingCode || resolvePricingCodeForTask({ provider, taskType, modelCode });

    if (!resolvedPricingCode) {
      return badRequest(res, "无法识别本次消耗的计费项。");
    }

    try {
      return res.json({
        success: true,
        data: buildCreditPrecheck({
          userId: auth.user.id,
          pricingCode: resolvedPricingCode,
        }),
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  app.post("/api/billing/orders", (req, res) => {
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

    const orderNo = generateOrderNo();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const order = {
      orderNo,
      orderType: "topup",
      source: "personal",
      provider: "manual_confirm",
      userId: auth?.user?.id,
      packageCode,
      packageName: preview.package.name,
      amount: preview.amount,
      totalCredits: preview.totalCredits,
      status: "PENDING_PAYMENT",
      checkoutMode: billingPolicy.checkoutMode,
      settlementMode: billingPolicy.settlementMode,
      channels: billingPolicy.channels,
      expiresAt,
      payUrl: `/checkout/mock/${orderNo}`,
      instructions: [
        "当前阶段先生成订单号与支付指引，适合快速上线人工确认流程。",
        "支付完成后由本项目后台给用户或组织发放积分，不直连供应商账号充值。",
        `订单保留到 ${expiresAt}，过期后需重新创建。`,
      ],
      createdAt: now,
      updatedAt: now,
    };

    try {
      saveBillingOrder(order);

      return res.json({
        success: true,
        data: {
          orderNo: order.orderNo,
          status: order.status,
          packageCode: order.packageCode,
          packageName: order.packageName,
          amount: order.amount,
          totalCredits: order.totalCredits,
          checkoutMode: order.checkoutMode,
          settlementMode: order.settlementMode,
          channels: order.channels,
          expiresAt: order.expiresAt,
          payUrl: order.payUrl,
          instructions: order.instructions,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "订单保存失败。",
      });
    }
  });
}
