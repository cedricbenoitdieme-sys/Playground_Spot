/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./landing.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1A7A4A',
          hover: '#155C38',
          dark: '#0F2318',
          light: '#E8F5E9',
          brand: '#1A7A4A',
          brandDark: '#125A36',
        },
        secondary: {
          DEFAULT: '#F5820D',
          light: '#E8DCC8',
          dark: '#D4C4A8',
        },
        dark: '#0F2318',
        background: {
          DEFAULT: '#F8F7F2',
          dark: '#0F1A14',
          surface: '#1A2E20',
        },
        status: {
          confirmed: '#16A34A',
          confirmedLight: '#10B981',
          pending: '#EA580C',
          pendingLight: '#F59E0B',
          completed: '#6B7280',
          cancelled: '#DC2626',
          cancelledLight: '#EF4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'Syne', 'sans-serif'],
      },
      borderRadius: {
        'card': '16px',
        'modal': '24px',
        'pill': '9999px',
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        'subtle': '0 2px 12px rgba(0,0,0,0.08)',
        'glow': '0 10px 25px -5px rgba(26, 122, 74, 0.3)',
      }
    },
  },
  plugins: [],
}
