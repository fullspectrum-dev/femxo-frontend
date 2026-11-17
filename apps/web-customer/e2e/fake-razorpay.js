/* eslint-disable @typescript-eslint/no-this-alias -- a plain-JS fake of a third-party script */
// A fake of Razorpay's Checkout.js for the end-to-end tests (served in place of https://checkout.razorpay.com/v1/checkout.js).
// What the "customer" does in the window is read, one entry per open, from window.__rzpModes: "success", "fail" (a failed attempt, then
// the window is closed) or "dismiss". The default is "success". Every open is recorded in window.__rzpOpened.
(function () {
  function Razorpay(options) {
    this.options = options;
    this.listeners = {};
  }
  Razorpay.prototype.on = function (event, callback) {
    this.listeners[event] = callback;
  };
  Razorpay.prototype.open = function () {
    var self = this;
    var o = this.options;
    window.__rzpOpened = (window.__rzpOpened || []).concat([{ key: o.key, order_id: o.order_id, amount: o.amount, currency: o.currency }]);
    var mode = (window.__rzpModes && window.__rzpModes.shift()) || "success";
    setTimeout(function () {
      if (mode === "success") {
        o.handler({ razorpay_order_id: o.order_id, razorpay_payment_id: "pay_TEST000001", razorpay_signature: "sig_TEST_0000000000" });
      } else if (mode === "fail") {
        if (self.listeners["payment.failed"]) self.listeners["payment.failed"]({ error: { code: "BAD_REQUEST_ERROR", description: "Your card was declined", reason: "payment_failed" } });
        o.modal.ondismiss();
      } else {
        o.modal.ondismiss();
      }
    }, 50);
  };
  window.Razorpay = Razorpay;
})();
