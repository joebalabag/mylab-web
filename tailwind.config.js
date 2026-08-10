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
        // Red theme for the tenant-facing MyLab app (login through
        // operational pages). Values follow Tailwind's official `red-*`
        // scale so the palette stays balanced across shade steps —
        // brand-50 for tinted backgrounds, brand-600 as the primary
        // button / CTA, brand-700 for hover. Rose-* is still reserved
        // for destructive actions; the tone shifts (crimson vs pink-red)
        // are subtle but deliberate.
        brand: {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
