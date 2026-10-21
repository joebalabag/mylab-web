// Curated brand palettes — each `shades` entry is a Tailwind-style 50→900
// ramp expressed as space-separated RGB components (the format Tailwind's
// /<alpha-value> opacity modifier expects). The `hex` is the preset's
// identity for round-tripping — when the stored theme_primary_color
// matches a preset's hex, we use its hand-tuned shades verbatim instead
// of deriving them from the hex at runtime.

export const THEME_PRESETS = [
  {
    key: 'red', label: 'Red', hex: '#dc2626',
    shades: {
      50:  '254 242 242', 100: '254 226 226', 200: '254 202 202',
      300: '252 165 165', 400: '248 113 113', 500: '239 68 68',
      600: '220 38 38',   700: '185 28 28',   800: '153 27 27',
      900: '127 29 29'
    }
  },
  {
    key: 'blue', label: 'Blue', hex: '#2563eb',
    shades: {
      50:  '239 246 255', 100: '219 234 254', 200: '191 219 254',
      300: '147 197 253', 400: '96 165 250',  500: '59 130 246',
      600: '37 99 235',   700: '29 78 216',   800: '30 64 175',
      900: '30 58 138'
    }
  },
  {
    key: 'emerald', label: 'Emerald', hex: '#059669',
    shades: {
      50:  '236 253 245', 100: '209 250 229', 200: '167 243 208',
      300: '110 231 183', 400: '52 211 153',  500: '16 185 129',
      600: '5 150 105',   700: '4 120 87',    800: '6 95 70',
      900: '6 78 59'
    }
  },
  {
    key: 'violet', label: 'Violet', hex: '#7c3aed',
    shades: {
      50:  '245 243 255', 100: '237 233 254', 200: '221 214 254',
      300: '196 181 253', 400: '167 139 250', 500: '139 92 246',
      600: '124 58 237',  700: '109 40 217',  800: '91 33 182',
      900: '76 29 149'
    }
  },
  {
    key: 'amber', label: 'Amber', hex: '#d97706',
    shades: {
      50:  '255 251 235', 100: '254 243 199', 200: '253 230 138',
      300: '252 211 77',  400: '251 191 36',  500: '245 158 11',
      600: '217 119 6',   700: '180 83 9',    800: '146 64 14',
      900: '120 53 15'
    }
  },
  {
    key: 'slate', label: 'Slate', hex: '#475569',
    shades: {
      50:  '248 250 252', 100: '241 245 249', 200: '226 232 240',
      300: '203 213 225', 400: '148 163 184', 500: '100 116 139',
      600: '71 85 105',   700: '51 65 85',    800: '30 41 59',
      900: '15 23 42'
    }
  }
];
