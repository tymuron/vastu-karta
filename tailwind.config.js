/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Client palette, lifted from vastu-portal (the pinned student app).
        vastu: {
          dark: '#422326', // Deep burgundy/brown — primary
          'dark-deep': '#2f181a', // hover / deeper surfaces
          gold: '#CABC90', // muted gold — accent
          'gold-deep': '#b3a474', // gold hover/active
          light: '#F4F2ED', // cream — page background
          cream: '#EBE7DE', // slightly darker surface
          sand: '#E2DCCF', // borders
          text: '#2A2A2A', // body text
          'text-light': '#585858', // muted text (darkened for readability)
        },
      },
      fontFamily: {
        // Cyrillic-capable fallbacks first — Google Fonts CDN is blocked in RU,
        // so nothing must depend on it (matches vastu-portal's defensive config).
        serif: ['"Cormorant Garamond"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 32px rgba(66, 35, 38, 0.08)',
        'card-hover': '0 12px 36px rgba(66, 35, 38, 0.14)',
        btn: '0 6px 18px rgba(66, 35, 38, 0.22)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
}
