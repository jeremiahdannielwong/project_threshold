/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:     '#0D0D0D',
        panel:    '#141414',
        card:     '#1A1A1A',
        hover:    '#212121',
        border:   '#2A2A2A',
        primary:  '#F5F5F5',
        muted:    '#6B7280',
        accent:   '#2563EB',
        orange:   '#F97316',
        low:      '#4ade80',
        moderate: '#facc15',
        high:     '#fb923c',
        critical: '#ef4444',
      },
    },
  },
  plugins: [],
};
