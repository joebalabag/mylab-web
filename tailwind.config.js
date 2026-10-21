/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  // Dark mode is toggled via a `dark` class on <html>, but *only* while a
  // MainLayout route is mounted. Super-admin and public/landing routes never
  // add the class, so they always render in light mode regardless of the
  // user's saved preference.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand palette resolves to CSS custom properties so a per-tenant
        // theme can retint the whole app at runtime without rebuilding
        // Tailwind. Defaults are set in src/style.css (:root). The
        // `rgb(var(--brand-N) / <alpha-value>)` form is required for
        // opacity modifiers like `bg-brand-900/40` to keep working.
        brand: {
          50:  'rgb(var(--brand-50)  / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
