/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        surface: '#1e293b',
        primary: '#6366f1',
        secondary: '#a855f7',
        accent: '#10b981',
        danger: '#ef4444',
      },
      screens: {
        '3xl': '1800px',
        '4xl': '2100px',
      },
    },
  },
  plugins: [],
}
