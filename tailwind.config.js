/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Tabler-like color palette
        primary: '#206bc4',
        secondary: '#656d77',
        success: '#2fb344',
        info: '#4299e1',
        warning: '#f59f00',
        danger: '#d63939',
        purple: '#ae3ec9',
        pink: '#d6336c',
        orange: '#f76707',
        cyan: '#17a2b8',
        // Background colors
        'bg-surface': '#f4f6fa',
        'bg-card': '#ffffff',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
