# Clinic Control: pilot setup

## What is enabled

- Direct owner entry: `admin.html` is a standalone page with its own owner login and full-page workspace. It does not load the clinic app, clinical database listeners or a modal. The legacy `index.html#platform` link redirects to this page.
- The owner login uses a named Firebase application and session persistence, separate from clinic login, with the same authorized owner credentials. The server still verifies owner claims on every request.
- A full-page owner console with Overview, Clinics, Trials, Subscriptions & payments, and Setup sections.
- Search and filters apply to loaded directory pages; summary counters are explicitly labeled as loaded counts, not global totals.
- Each clinic has a business-only detail view, private owner note, custom pilot date and 7/14/30-day extensions with a required reason. Extensions start from the later of the existing end date or today in UTC. They update tracking metadata, not application access or Stripe trials.
- Extension requests are transactionally deduplicated by request ID. Notes and date/status changes also produce server-side audit events. The clinic view displays the latest 50 entries from the new per-clinic history; older global audit entries are preserved but are not backfilled into this view.
- No payment failures, paid plans, revenue or debts are invented. The billing view shows unavailable states and links to the owner's Stripe dashboard until integration is completed.

- Public product homepage, separate sign-in and pilot registration views.
- English by default, English/Spanish switch, saved preference per browser.
- Local editorial catalog for system copy, form labels, validation, invoices and payment report headings. No online machine-translation service receives patient data.
- Patient-room interface has a separate language preference and preserves entered responses and the drawn signature when switching.
- A metadata-only platform directory for a trusted owner: practice name, owner email, pilot status and tracking end date. Updates are audited.
- Existing clinics are reconciled from `clinics/*/settings/clinic`, including missing parent documents, during backend deployment. A Firestore trigger synchronizes new/updated clinic settings automatically and a daily reconciliation retries missing entries and refreshes owner emails. Sign-in synchronization remains a fallback, with a visible error if it fails. Only name/email metadata is synchronized; owner notes, pilot dates/statuses, and clinical records are preserved. Deleted settings never delete an existing directory entry.
- Subscription screen is separate from patient payments. Checkout is deliberately disabled on both client and server. No trial automatically converts to paid.

## Activate the platform owner

The designated account is `njdesignprint@gmail.com`. No email address is hardcoded as an authorization bypass in the website.

1. Verify that email in Firebase Authentication. The grant script refuses unverified accounts; do not bypass that check.
2. In GitHub Actions, run **Manage platform owner access** on `main`, entering the exact email and choosing `dry-run`. Review the project, UID and email returned.
3. Run the same workflow with `apply`. It preserves all unrelated custom claims. Only a trusted repository administrator with access to the existing Firebase deployment secret can run this operation.
4. Sign out of Clinic Control and sign in again. **My platform** appears only when the signed token contains `platformAdmin: true`.
5. Use `revoke` to remove the role and revoke refresh tokens. The backend also checks revoked tokens on each request.

The platform claim does not grant access to other practices' patient records. Browser writes to platform metadata and audit collections are always denied. Protect GitHub, Google Cloud and the owner account with MFA before handling real data. MFA enforcement in the application still requires authentication-provider configuration.

## Stripe — intentionally not connected

Having a Stripe account alone does not configure billing. This release does **not** contain an active Stripe Checkout/webhook integration. Buttons explain that billing is unavailable; the backend cannot create a subscription or charge a card. `billingEnabled: false` is descriptive, not a client-side security switch.

Before enabling paid subscriptions:

1. Agree on prices, included providers, limits, taxes, cancellation and retention terms.
2. Choose the production hosting/domain. GitHub Pages is only the present pilot host; review its commercial-use restrictions before launch.
3. Implement and test Stripe Checkout, Billing Portal and signature-verified webhooks in test mode. Store secret keys and webhook secrets in server-side secret storage only.
4. Persist Stripe customer/subscription IDs, derive entitlements from verified events, and test duplicate/out-of-order webhooks, failed payments, cancellation and refunds.
5. Verify live mode separately and only then replace the disabled billing handlers. Never enable access based on a success URL.

## Translation boundaries

The system's own interface and generated document labels use the selected language. Patient names, clinical notes, service descriptions, custom invoice footers, responses and uploaded documents remain exactly as authored. The built-in invoice footer is localized, but edited footers are preserved.

An uploaded PDF is not rewritten or silently machine-translated, especially if it contains clinical consent or a signature. Upload professionally reviewed English and Spanish source documents separately and assign the appropriate document. Form questions are authored by the practice and must likewise be supplied in the appropriate language. The staff member should choose the patient's communication language separately from their own interface language.

Scheduled communications recognize the existing `Inglés` value and `en`/`English`. Delivery still requires configured mail/SMS credentials and patient consent; changing the interface language never changes that consent.

## Still required before a commercial launch

Live billing integration, finalized plans and terms, MFA enforcement, privacy/security and jurisdiction-specific compliance review, proven backup restoration, support delivery, operational monitoring and production end-to-end testing. The owner screen explicitly identifies services that are not connected; it does not show invented revenue, backup health or availability metrics.

## Verification

`npm test` covers the existing registration, accounting and room portal regressions plus localization and platform authorization. `npm run test:rules` validates tenant isolation and denies direct platform writes, including from a token with the platform-owner claim.

For a read-only local preview: `node scripts/preview.cjs`, then open `http://127.0.0.1:3033`. It does not open or migrate the SQLite database.

Reference documentation: [Firebase custom claims](https://firebase.google.com/docs/auth/admin/custom-claims), [Stripe Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions), [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).
