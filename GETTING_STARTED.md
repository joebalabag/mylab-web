# MyLab — Getting Started

MyLab is a laboratory management system for clinical labs. This guide walks
you through everything from creating your lab account to releasing your very
first signed lab report — no technical background required.

> **Prefer to read this in the app?** After signing in, open the **Help &
> Getting Started** overlay from the sidebar footer. New visitors can also
> open it from the login page's *Open the Getting Started guide* button.

> **Landing page.** The root URL (e.g. `https://mylab.example.com/`) opens
> the public marketing page. Sign-in lives at `/login`. Patients scanning
> the QR code on a printed report land on `/lab/view?…` — a read-only view
> of the finalized report.

**Table of contents**

1. [What you can do with MyLab](#what-you-can-do-with-mylab)
2. [Sign up your lab](#step-1--sign-up-your-lab)
3. [Confirm your email](#step-2--confirm-your-email)
4. [First sign-in](#step-3--first-sign-in)
5. [Set up your lab profile](#step-4--set-up-your-lab-profile)
6. [Load the pre-loaded catalog](#step-5--load-the-pre-loaded-catalog)
7. [Add your doctors](#step-6--add-your-doctors-pathologist--medtech)
8. [Add your team](#step-7--add-your-team)
9. [Open a case & release a report](#step-8--open-a-case--release-a-report)
10. [Track expenses (optional)](#track-expenses-optional)
11. [Understand your reports](#understand-your-reports)
12. [Install as an app (PWA)](#install-as-an-app-pwa)
13. [Keeping your subscription active](#keeping-your-subscription-active)
14. [Common questions](#common-questions)

---

## What you can do with MyLab

| | | |
|---|---|---|
| **Take requests fast** | **Collect payment** | **Release signed reports** |
| Pick a patient (or add them in the same modal), build a requisition from the pre-loaded catalog, apply discounts. | Cashier finalises the requisition and collects payment — cash, e-wallet, bank transfer, A/R, insurance, or waived. | Medtech encodes results, pathologist signs, MyLab prints a QR-linked report the patient can verify online. |

💡 The whole first-time journey — sign up, verify, release your first
report — takes about **20 minutes** if you already have your lab profile,
signatories, and staff list ready.

---

## Step 1 · Sign up your lab

Create your lab account so MyLab knows who you are.

1. On the sign-in page, click **Create a lab account →**.
2. Fill in the form:
   - **Lab name** — what patients will see on their reports.
   - **Contact email** — this is where we'll send the verification link and
     your admin login.
   - **Contact number**, **Owner name**, and your **City / Province /
     Country**.
3. Click **Create account**. You'll be shown a "Check your email" screen
   next.

> 📌 Use an email you check regularly — the verification link expires and
> you'll need to receive credentials there.

---

## Step 2 · Confirm your email

One click to prove the address is yours.

1. Open your inbox — look for an email from **MyLab**.
2. Click the **Verify email** button inside.
3. You'll land on a "You're all set!" page. Behind the scenes we've
   activated your **14-day free trial** and prepared your admin login.
4. Check your inbox again for a second email with your **username and
   password**.

> 💡 Didn't get the email? Check your spam folder first. Still nothing?
> Open the sign-in page, click **"Didn't get the verification email?
> Resend →"**, and re-enter your address — we'll drop a fresh link in
> your inbox. If the address itself was a typo, register again with the
> correct one.

---

## Step 3 · First sign-in

Get inside and secure your account.

1. Go to the **Sign in** page and enter the username + password from the
   second email.
2. Click your initials in the top-right corner → **Change password**.
3. Set a strong password that only you know. Do this **before** adding
   staff so the temporary one is out of circulation.

> 📌 As the owner, you get access to **every module**. When you add staff
> later, you decide exactly what each person can see and do.

You'll land on **Welcome** (`/home`). From there, the **Setup Readiness**
tile walks you through the same steps in-app — every remaining task in this
guide is deep-linked from there.

---

## Step 4 · Set up your lab profile

Give MyLab your lab details so reports and receipts look right.

Open **Company Settings** from the sidebar and fill in:

- **Lab identity** — Lab name, legal name, owner name, branch, currency.
  This is what appears at the top of every printed report and receipt.
- **Logo** — Upload a square PNG or JPG. Shows on the sidebar, on receipts,
  and (depending on the lab-report header mode) on the printed report.
- **Address & contact** — Where you are and how patients can reach you.
  Printed on the report footer.
- **Tax & Registration** — Your TIN, VAT-registered flag, and whether to
  show your TIN on receipts.

### Receipt customization

Two levels of receipt copy live in this section:

- **Add-on lines** (Receipt Header Text + Receipt Footer Text) — small text
  that prints alongside the auto-generated lab info block. Useful for
  something short like `OFFICIAL RECEIPT` up top and `Thank you for
  choosing us!` down bottom.
- **Whole custom header / footer** — toggle either on to fully **replace**
  the auto-generated block with your own multi-line layout. Nothing from
  the lab profile (name, address, TIN, phone, email) prints — just your
  text. Useful for a bespoke receipt design or an OR / SI template.

### Lab report header mode

The printed lab report supports two header styles:

- **Logo + text** — square logo on the left, lab identity block on the
  right. Standard.
- **Full-width image** — upload a single banner (letterhead scan or
  designed header) that prints full-width. The lab identity block is
  hidden — everything is in your image.

Click **Save changes**.

---

## Step 5 · Load the pre-loaded catalog

MyLab ships with a curated laboratory catalog you can install in one
click — 5 item groups (Chemistry, Hematology, Microscopy, Serology,
Microbiology), 20+ categories, and hundreds of standard tests with units
and reference ranges. Skip hours of manual entry.

1. Open **Item Groups** from the sidebar.
2. Click **Import pre-loaded catalog** (top-right).
3. Pick which groups / categories to import (or leave all ticked for the
   full catalog).
4. Confirm. The import is **idempotent** — running it again won't
   duplicate tests you already have.

### Tuning the catalog for your lab

After the import, tweak per-test:

- **Price** — every test has a default of ₱0; set your prices per test or
  per package.
- **Reference range** — the catalog ships with commonly-cited ranges;
  adjust per your reagent / analyser vendor's IFU.
- **Category print template + paper size** — set from **Item Categories**.
  Different categories can print on different templates (e.g. hematology
  on a chart-style form, chemistry on a simple table).
- **Item packages** — bundle common panels (e.g. `Complete Blood Count +
  Urinalysis` for pre-employment) with a discounted package price. Bundles
  expand into their constituent tests on the requisition.

---

## Step 6 · Add your doctors (pathologist / medtech)

Every finalized lab report prints signatures. Add each signatory as a
**doctor** record:

1. Open **Doctors** from the sidebar (under **Admin**).
2. Click **+ Add Doctor**.
3. Enter name, licence number, and role (**Medtech** or **Pathologist**).
4. Upload their e-signature image (PNG with transparent background works
   best). It prints on the report above their name.
5. Save.

Repeat for every signatory. You can set a **default signatory per item
category** so the report auto-fills the right person — the encoder can
still change it before finalising.

---

## Step 7 · Add your team

Give medtechs, cashiers, and managers their own logins.

1. Open **Users** and click **+ Add User**.
2. Enter their name, choose a username, set a temporary password, and pick
   a **Role**.
3. Once created, click the row's action menu and choose **Assign access**.
4. Tick only the modules that person needs. Save.

**Typical access presets:**

| Role | Typical access |
|---|---|
| **Medtech** | Patient Cases (view), Laboratory (encode + sign as medtech), Reports (their own). |
| **Cashier** | Patient Cases (view), Cashier (finalize + collect payment), Payment Summary report. |
| **Manager** | Everything except deleting other admins. Can sign as pathologist if licensed. |

When a team member signs in, they'll only see the menu items you gave
them. Try to type a hidden URL and MyLab bounces them back to `/home` —
safe by default.

---

## Step 8 · Open a case & release a report

The core workflow. Every visit follows the same four-step arc:
**Patient → Case → Requisition → Payment → Result → Signed report.**

### A · Register (or find) the patient

Open **Patients** → **+ Add Patient**.

- The form runs a **duplicate check** on first name + last name + birthdate
  as you type — if MyLab thinks the patient is already in your system,
  it'll warn you before saving.
- Fill in demographics: sex, birthdate, civil status, blood type (if
  known), contact number, address, national IDs (SSS / PhilHealth / TIN /
  driver's licence).
- Save. The patient gets an MRN of the form `P-NNNNNN`.

### B · Open a patient case (visit)

Open **Patient Cases** → **+ Add Case**.

- Pick the patient (search box shows MRN + name + birthdate).
- Set **case type** (walk-in, follow-up, corporate, pre-employment, etc.)
  and **case date**.
- **Save**. You now have a case ready to accept requisitions and payments.

> 📌 A single case can hold **multiple requisitions** and **multiple
> payment records** — perfect for patients who come back the same day for
> additional tests, or for corporate/insurance patients who pay through
> multiple channels.

### C · Add a requisition

Inside the case, click **+ Add Requisition**.

- Pick line items from the catalog — search by test code or name, tick
  individual tests, or drop in an **item package** (bundle) which expands
  into its constituent tests.
- Set the referring doctor (optional but useful — printed on the report).
- Apply a **requisition-level discount** (percent or fixed peso amount)
  from the Discount panel.
- **Save as draft** to review later, or **Finalize** to lock the
  requisition and hand it to the cashier.

### D · Collect payment (Cashier)

Open **Cashier** from the sidebar — or click **Pay** on the requisition
inside the case.

- The **Unpaid Requisitions** list shows every finalized requisition
  waiting for payment across all cases.
- Pick a requisition → confirm which items are being paid for this
  transaction (partial payments are supported).
- Pick a payment method (8 options):
  - **Cash** — straightforward.
  - **E-wallet** — GCash / Maya / GrabPay. Enter reference number.
  - **Bank transfer** — enter payee account + reference.
  - **Accounts receivable** — corporate account; the case is unlocked for
    result release but the money is owed. Close the arrangement later with
    **Resolve arrangement**.
  - **Insurance** — same as A/R; used when a HMO or insurer is settling.
  - **Paid outside** — patient paid at the front desk / referring clinic.
  - **Charity / waived** — auto-resolves; no money changes hands.
  - **Other** — free-form for anything the rest of the list doesn't cover.
- Save. A receipt renders in the browser, ready to print.

> 📌 **Voiding a payment** requires a manager's password. Wrong password
> → nothing changes.

### E · Encode results (Laboratory)

Open **Laboratory** from the sidebar.

- The **Eligible Requisitions** list shows every paid requisition with
  uncovered test lines (i.e. still waiting for results).
- Click one → MyLab creates a lab report and drops you into the encoding
  view.
- Encode each result. MyLab handles **5 result types**:
  - **Single** — one number or short text (e.g. AST = 24).
  - **Panel** — multiple named fields on one form (e.g. CBC: HGB, HCT,
    WBC, PLT, MCV, …).
  - **Narrative** — free-text report (histopath, radiology-style
    write-ups).
  - **Culture** — culture + antibiotic sensitivity grid.
  - **Matrix** — arbitrary rows × columns table.
- Numeric results are validated against the reference range and flagged
  if abnormal.

### F · Sign & finalize

- Sign as **medtech** first (your licence number is auto-filled from your
  doctor record).
- Have the **pathologist** sign next. Once both signatures are recorded,
  click **Set as Final**.
- MyLab generates a **QR code** printed on the report. Anyone with the
  physical printout can scan it to open the read-only report at
  `/lab/view?…` and verify it hasn't been altered — no login required.

### G · Print

Click **Print** on the finalized report. MyLab uses the print template +
paper size configured on the test's **item category**, so hematology
reports and chemistry reports can look completely different.

> 🎉 **That's it!** Your first signed report is done. The Dashboard will
> show today's revenue and test volume update as you process more cases.

---

## Track expenses (optional)

Log operating costs so the Expense Report can net them against sales.

1. Open **Expenses** from the sidebar.
2. Click **+ Add Expense**. Enter the date, category (Reagents, Utilities,
   Rent, Supplies, Salary, …), amount, and a short note. Attach a photo of
   the receipt if you have one.
3. The default view shows this month — widen the date range or change the
   Status filter (Active / Void) to look further back.
4. Made a typo? Use the row's action menu → **Void** with a short reason.
   The row stays visible with a "voided" badge so the audit trail is
   intact.

---

## Understand your reports

Open **Reports** from the sidebar. Twelve screens sit under it:

| Report | What it shows |
|---|---|
| **Summary** | Top-line KPIs and a sparkline for the date range. |
| **Monthly Sales** | Revenue by month (year filter). |
| **Monthly Tests** | Test volume by month (year filter). |
| **Daily Sales** | Day-by-day revenue for reconciliation. |
| **Daily Tests** | Day-by-day test volume. |
| **Daily Detailed Sales** | Line-by-line sales — every payment, every item, every discount. |
| **Cashier Sales** | Per-cashier / per-method payment totals. |
| **Voids** | Every voided payment + reason + who authorised. |
| **Discounts** | Discount rules that fired, how often, for how much. |
| **Expenses** | Expense activity by category for the range. |
| **Payment Summary** | Cash / e-wallet / bank / A/R / insurance / … split for the range. |
| **Test Analytics** | Volume by test, by category, and **TAT** (turnaround time from paid → finalized) breakdowns. |

Every table paginates client-side so a large date range doesn't lock up
the page, and every screen has a **CSV export** that mirrors what's on
screen — hand it straight to your accountant.

---

## Install as an app (PWA)

MyLab is a **Progressive Web App** — you can install it on any modern
device and it'll open in its own window without browser chrome.

- **Windows / macOS / Linux (Chrome or Edge)**: click the install icon in
  the address bar, or open the **⋮** menu → **Install MyLab**.
- **Android**: Chrome → **⋮** → **Install app**.
- **iOS (Safari)**: **Share** → **Add to Home Screen**. (iOS installs are
  supported but limited by WebKit — service-worker features are more
  restricted than on other platforms.)

Once installed, MyLab opens at `/login` in standalone mode. Updates are
picked up automatically — no re-install needed.

---

## Keeping your subscription active

Your 14-day free trial is on us. When it's close to expiring, MyLab shows
a friendly warning in the top bar and on the Dashboard — that's your cue
to renew.

1. Open **Subscription** from the sidebar.
2. Choose a plan — trial plans and paid plans are shown in two rows.
3. Pick a payment method and follow the on-screen instructions:
   - **GCash / bank transfer** — pay to the shown account, upload a
     screenshot of your confirmation. MyLab's OCR auto-fills the amount,
     reference number, and payment date; you just review and submit.
   - **PayPal Smart Button** (if configured for your plan) — pay directly
     in the browser; the subscription activates automatically once the
     capture succeeds.
4. If you paid via GCash/bank, our team reviews within one business day
   and extends your subscription. PayPal payments are usually instant.

> ⚠️ If your subscription expires without renewal, the app pauses and
> shows a "Subscription expired" overlay. You can still reach the
> Subscription page from the overlay to submit a renewal payment.

---

## Common questions

**A menu item is missing from my sidebar.**
Ask the owner or a manager to check **Assign access** for your account
under **Users**.

**I typed a URL and got sent back to `/home`.**
That page isn't in your assigned access, **or** your subscription plan
doesn't include it. This is a security feature — talk to your manager.

**The app is stuck on a "Subscription expired" overlay.**
Click **Subscription** in the overlay and submit a renewal payment.

**I forgot my password.**
Your lab owner or manager can reset it from **Users → Change password**.

**My logo isn't appearing on receipts / reports.**
Open **Company Settings**, upload the logo, and confirm the receipt and
report header settings are on. Save.

**The QR code on the printed report doesn't work.**
Confirm your public URL (the domain patients scan into) is reachable from
the internet. QR tokens are HMAC-signed with the backend's `JWT_SECRET`
and only verify against the server that finalized the report.

**A test result is flagged as abnormal but the value looks fine.**
The reference range on the test item might not match your analyser /
reagent kit. Update it in **Test Items** and future results will use the
new range.

**A cashier voided the wrong payment.**
Vice can happen. Voiding required a manager password — the void reason
and authoriser are logged and visible in the **Voids Report**. Create a
new payment record for the correct amount.

**I see an amber "warning" toast pop up after saving something.**
Some actions succeed but with a side note — for example, "Owner not
notified — tenant has no contact email." The main action still worked;
the toast is just telling you about a partial or skipped step. Fix
whatever it points at if you want the extra step to happen next time.

---

*MyLab · Getting Started*
