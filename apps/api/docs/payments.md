# Mercado Pago payments

V1 uses one Mercado Pago Checkout Pro preference per manual subscription renewal. The API creates a pending `commercial_payments` record using the server-side subscription price snapshot. Access is granted only after the signed webhook causes a server-side payment lookup and amount/currency validation.

Configure the variables in `.dev.vars` (see `.dev.vars.example`) or as Worker secrets. `PUBLIC_WEBHOOK_URL` must be a public HTTPS URL for Mercado Pago notifications. Return URLs are UX only and never confirm a payment. Refunds and chargebacks are recorded as payment statuses but do not revoke existing access periods in V1.
