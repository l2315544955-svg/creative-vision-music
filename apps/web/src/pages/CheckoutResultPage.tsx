import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { fetchPaymentOrder, reconcilePaymentOrder } from "../lib/api";
import type { PaymentOrderSnapshot } from "../types";

function getOrderTone(status: string) {
  if (status === "PAID") {
    return "success";
  }

  if (status === "PENDING_PAYMENT") {
    return "pending";
  }

  if (status === "CLOSED") {
    return "danger";
  }

  return "neutral";
}

export function CheckoutResultPage() {
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<PaymentOrderSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const orderNo =
    searchParams.get("orderNo") || searchParams.get("out_trade_no") || searchParams.get("outTradeNo") || "";

  useEffect(() => {
    if (!orderNo) {
      setMessage("缺少订单号，无法查询支付结果。");
      return;
    }

    setLoading(true);
    setMessage("");

    reconcilePaymentOrder(orderNo)
      .then((payload) => {
        setOrder(payload);
      })
      .catch(async () => {
        const payload = await fetchPaymentOrder(orderNo);
        setOrder(payload);
      })
      .catch((error: Error) => {
        setMessage(error.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [orderNo]);

  async function refreshStatus() {
    if (!orderNo) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const payload = await reconcilePaymentOrder(orderNo);
      setOrder(payload);
      setMessage(payload.status === "PAID" ? "支付已确认。" : "已刷新订单状态。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="checkout-shell">
      <section className="studio-card studio-card-large">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Payment Result</p>
            <h2>支付结果</h2>
          </div>
          <Link className="ghost-link" to="/create">
            返回创作台
          </Link>
        </div>

        {message ? <div className="status-banner">{message}</div> : null}

        {order ? (
          <div className="result-panel">
            <div className="result-hero">
              <div>
                <p className="eyebrow">Order Snapshot</p>
                <h3>{order.packageName}</h3>
              </div>
              <span className={`status-chip ${getOrderTone(order.status)}`}>{order.status}</span>
            </div>

            <div className="checkout-grid">
              <div className="checkout-stat">
                <span>订单号</span>
                <strong>{order.orderNo}</strong>
                <small>创建时间：{new Date(order.createdAt).toLocaleString()}</small>
              </div>
              <div className="checkout-stat">
                <span>订单金额</span>
                <strong>￥{order.amount}</strong>
                <small>到账积分：{order.totalCredits}</small>
              </div>
              <div className="checkout-stat">
                <span>支付宝流水</span>
                <strong>{order.tradeNo || "待支付后生成"}</strong>
                <small>交易状态：{order.tradeStatus || "WAIT_BUYER_PAY"}</small>
              </div>
              <div className="checkout-stat">
                <span>支付时间</span>
                <strong>{order.paidAt ? new Date(order.paidAt).toLocaleString() : "待支付"}</strong>
                <small>订单有效期：{new Date(order.expiresAt).toLocaleString()}</small>
              </div>
            </div>

            <div className="action-row">
              <button
                className="primary-button"
                disabled={loading}
                onClick={refreshStatus}
                type="button"
              >
                {loading ? "查询中..." : "刷新支付状态"}
              </button>
              <Link className="ghost-link" to="/works">
                前往任务与作品
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h3>{loading ? "正在查询订单..." : "暂无订单结果"}</h3>
            <p>请确认支付已完成，或回到充值弹窗重新发起支付。</p>
          </div>
        )}
      </section>
    </div>
  );
}
