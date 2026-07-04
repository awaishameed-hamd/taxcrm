/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Exact palette from Call Center CRM — DO NOT CHANGE
        navy:      '#132E57',
        teal:      '#1E8496',
        deepTeal:  '#1A5560',
        gold:      '#D7A520',
        brick:     '#C25A1F',
        forest:    '#3A6B3A',
        khaki:     '#CBB26A',
        purple:    '#7B2D8E',
        bgMain:    '#EDF0F3',
        bgCard:    '#FFFFFF',
        fillNavy:  '#E8EEF7',
        fillTeal:  '#E5F3F5',
        fillGold:  '#FAEFD0',
        fillBrick: '#F5E0D2',
        border:    '#E0DDD5',
        gridLine:  '#F0EDE5',
        slate:     '#5C5C5C',
        muted:     '#808080',
        sidebarBg: '#E8EAED',
      },
      fontFamily: {
        sans:     ['Inter', 'system-ui', 'sans-serif'],
        outfit:   ['Outfit', 'Inter', 'sans-serif'],
        rajdhani: ['Rajdhani', 'Inter', 'sans-serif'],
        bebas:    ['"Bebas Neue"', 'Impact', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 6px rgba(0,0,0,0.06)',
        sm:   '0 1px 3px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}
