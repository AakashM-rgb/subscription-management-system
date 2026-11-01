// Razorpay HTTP stub for e2e tests ONLY. It replaces api.razorpay.com at the network boundary so the
// backend's real adapter, collections, webhook and ledger code all run unchanged. Nothing here is part
// of the application. Start it, then start the backend with RAZORPAY_BASE_URL=http://127.0.0.1:<port>/v1
// and dummy rzp_test_ keys.
//
//   node e2e/razorpay-stub.mjs            (port from RAZORPAY_STUB_PORT, default 8199)
//
// Tests steer outcomes through POST /__control {"tokenStatus": "confirmed"|"rejected", "chargeMode": "accept"|"decline"}.
// Endpoint shapes follow backend/app/providers/razorpay.py and tests/test_razorpay_adapter.py.
import http from "node:http";

const port = Number(process.env.RAZORPAY_STUB_PORT ?? 8199);
const state = { tokenStatus: "confirmed", chargeMode: "accept", seq: 0, orders: new Map(), requests: [] };
// A per-run prefix keeps ids unique across stub restarts, as Razorpay ids are globally unique.
const run = Date.now().toString(36);
const next = (prefix) => `${prefix}_e2e${run}${(++state.seq).toString().padStart(5, "0")}`;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function token(id) {
  return {
    id,
    entity: "token",
    method: "card",
    recurring: true,
    recurring_details: { status: state.tokenStatus, failure_reason: state.tokenStatus === "rejected" ? "Mandate rejected by the bank (stub)" : null },
    card: { last4: "4242", network: "Visa" },
  };
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, "http://stub");
    const path = url.pathname;
    state.requests.push({ method: req.method, path, body });

    // ------------------------------------------------------------ test control (not Razorpay)
    if (path === "/__control" && req.method === "POST") {
      Object.assign(state, { tokenStatus: body.tokenStatus ?? state.tokenStatus, chargeMode: body.chargeMode ?? state.chargeMode });
      return send(res, 200, { tokenStatus: state.tokenStatus, chargeMode: state.chargeMode });
    }
    if (path === "/__state") return send(res, 200, { ...state, orders: [...state.orders.values()], requests: state.requests.slice(-50) });
    if (path === "/__health") return send(res, 200, { ok: true });

    // ------------------------------------------------------------ Razorpay v1
    // Like Razorpay, every customer and every authorised token gets its own id.
    if (req.method === "POST" && path === "/v1/customers") return send(res, 200, { id: next("cust"), entity: "customer", email: body.email });

    if (req.method === "POST" && path === "/v1/orders") {
      const order = { id: next("order"), entity: "order", amount: body.amount, currency: body.currency, receipt: body.receipt ?? null, notes: body.notes ?? {}, customer_id: body.customer_id ?? null, status: "created" };
      state.orders.set(order.id, order);
      return send(res, 200, order);
    }

    let m;
    if (req.method === "GET" && (m = path.match(/^\/v1\/orders\/([^/]+)$/))) {
      const order = state.orders.get(m[1]);
      return order ? send(res, 200, order) : send(res, 404, { error: { description: "order not found" } });
    }
    // Reconciliation: outcomes arrive by webhook in these tests, so orders report no payment yet.
    if (req.method === "GET" && (m = path.match(/^\/v1\/orders\/([^/]+)\/payments$/))) return send(res, 200, { entity: "collection", count: 0, items: [] });

    // Checkout authorisation payment: the test names it pay_auth_<order id>, so the order is recoverable.
    if (req.method === "GET" && (m = path.match(/^\/v1\/payments\/(pay_auth_(.+))$/))) {
      const order = state.orders.get(m[2]);
      if (!order) return send(res, 404, { error: { description: "payment not found" } });
      return send(res, 200, { id: m[1], entity: "payment", order_id: order.id, token_id: `token_${order.id}`, customer_id: order.customer_id, status: "captured", method: "card" });
    }

    if (req.method === "GET" && (m = path.match(/^\/v1\/customers\/([^/]+)\/tokens\/([^/]+)$/))) return send(res, 200, token(m[2]));
    if ((req.method === "DELETE" && /^\/v1\/customers\/[^/]+\/tokens\/[^/]+$/.test(path)) || (req.method === "PUT" && /\/cancel$/.test(path))) {
      return send(res, 200, { deleted: true });
    }

    if (req.method === "POST" && path === "/v1/payments/create/recurring") {
      if (state.chargeMode === "decline") return send(res, 400, { error: { code: "BAD_REQUEST_ERROR", description: "Card declined by issuer (stub)" } });
      return send(res, 200, { razorpay_payment_id: next("pay"), razorpay_order_id: body.order_id });
    }

    send(res, 404, { error: { description: `stub: no route for ${req.method} ${path}` } });
  });
});

server.listen(port, "127.0.0.1", () => console.log(`razorpay stub listening on http://127.0.0.1:${port}`));
