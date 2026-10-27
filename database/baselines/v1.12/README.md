# Database V1.12

V1.12 is additive to the immutable V1.11 baseline. It adds the `demo` provider value to `payment_transactions.provider`; it does not alter the real MoMo/ZaloPay integrations or existing transactions. Demo payment routes are available only outside production. Successful demo attempts are persisted as transactions and atomically transition the matching finalized unpaid Invoice to paid. Failed demo attempts remain failed history and do not change Invoice status.

Migration: `migrations/V1_11_to_V1_12_demo_payment.sql`. V1.11 and earlier artifacts remain unchanged.
