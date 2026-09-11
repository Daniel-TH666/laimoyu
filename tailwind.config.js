/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './*.html',
    './src/**/*.{js,ts,html}'
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FBF7F1',
          100: '#F6F0E5',
          200: '#EBE0CC'
        },
        mint: {
          50: '#E8F5EF',
          100: '#D1EBE0',
          200: '#A4DBC5',
          500: '#5BB29A',
          600: '#3D9882',
          700: '#2A7A66'
        },
        coral: {
          500: '#FF7A6B'
        },
        ink: {
          700: '#2C3E50',
          800: '#1F2D3D'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          'Helvetica',
          'Arial',
          'sans-serif'
        ]
      },
      boxShadow: {
        card: '0 4px 16px rgba(45, 70, 90, 0.06)',
        'card-hover': '0 14px 32px rgba(45, 70, 90, 0.14)',
        'ad-slot': 'inset 0 0 0 2px rgba(91, 178, 154, 0.35)'
      },
      borderRadius: {
        'card': '18px'
      }
    }
  },
  plugins: []
};
