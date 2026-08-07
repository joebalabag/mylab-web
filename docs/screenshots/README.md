# Screenshots for the user manual

Drop PNG/JPG captures here matching the filenames referenced in
`../../USER_MANUAL.md`. Suggested sizes:

- **Full-page** screens: capture at 1440 × 900 px, save at 100 % zoom.
- **Modal / dialog** captures: crop to the dialog with ~20 px of
  surrounding backdrop.
- **Toolbar / detail** captures: crop tight to the element in question.

File-naming convention: `<console>-<view>-<state>.png`, all lower-case,
kebab-case. Examples for MyLab:

- `staff-login.png`
- `staff-welcome.png`
- `staff-setup-readiness.png`
- `staff-dashboard.png`
- `staff-patients-list.png`
- `staff-patient-case-detail.png`
- `staff-cashier-unpaid-list.png`
- `staff-cashier-payment-modal.png`
- `staff-laboratory-eligible-list.png`
- `staff-laboratory-encoding-panel.png`
- `staff-laboratory-signing.png`
- `staff-test-items-list.png`
- `staff-item-categories-list.png`
- `staff-item-packages-modal.png`
- `staff-discounts-list.png`
- `staff-expenses-add-modal.png`
- `staff-users-assign-access.png`
- `staff-doctors-list.png`
- `staff-tenant-settings-branding.png`
- `staff-tenant-settings-receipt-preview.png`
- `staff-subscription-picker.png`
- `staff-subscription-receipt-modal.png`
- `staff-reports-summary.png`
- `staff-reports-test-analytics-tat.png`
- `public-lab-report-qr-view.png`
- `super-login.png`
- `super-dashboard.png`
- `super-tenants-list.png`
- `super-tenants-alter-subscription.png`
- `super-plans-list.png`
- `super-subscription-payments-list.png`

Automation:

- `npm run screenshots` runs `scripts/capture-screenshots.mjs`, a
  Playwright script that opens each URL and saves a canonical capture.
  If you add or rename a screen, update the script so future captures
  stay consistent.

If a screenshot is missing, the manual will still render — the browser
just shows the alt-text where the image would be.
