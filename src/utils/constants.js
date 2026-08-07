export const EWALLET_PROVIDERS = ['GCash', 'Maya', 'GrabPay', 'ShopeePay', 'Coins.ph', 'Other']

// Expense categories — fixed dropdown for the Expenses module. Order matches
// the request order; "Others" is intentionally last as the catch-all.
export const EXPENSE_CATEGORIES = [
  'Delivery',
  'Utilities',
  'Salary',
  'Supplies',
  'Rent',
  'Transportation',
  'Others'
]

// Reports tabs — shared source of truth for Sidebar.vue (renders them as
// child links under the "Reports" group) and ReportsView.vue (renders them
// as the main tab list). Order below is the presentation order in both
// places. `icon` matches the inline SVG switch in ReportsView.vue.
export const REPORT_TABS = [
  { key: 'summary',      label: 'Summary',                   icon: 'grid' },
  { key: 'reading',      label: 'Reading Report',            icon: 'reading' },
  { key: 'expense',      label: 'Expense Report',            icon: 'receipt' },
  { key: 'cashier',      label: 'Cashier Sales Report',      icon: 'users' },
  { key: 'void',         label: 'Void Report',               icon: 'void' },
  { key: 'inventory',    label: 'Inventory Movement',        icon: 'box' },
  { key: 'daily',        label: 'Daily Sales Report',        icon: 'calendar' },
  { key: 'discount',     label: 'Discount Report',           icon: 'percent' },
  { key: 'payment',      label: 'Payment Summary',           icon: 'card' },
  { key: 'bir',          label: 'BIR Sales Summary Report',  icon: 'bir' },
  { key: 'bir-detailed', label: 'BIR Sales Detailed Report', icon: 'bir' }
]
