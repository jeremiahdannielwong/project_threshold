/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:     'var(--canvas)',
        surface:    'var(--surface)',
        'surface-2':'var(--surface-2)',
        hairline:   'var(--hairline)',
        'hairline-2':'var(--hairline-2)',
        ink:        'var(--ink)',
        'ink-2':    'var(--ink-2)',
        'ink-3':    'var(--ink-3)',
        'ink-4':    'var(--ink-4)',
        alert:      'var(--alert)',
        'alert-deep':'var(--alert-deep)',
        'alert-mid':'var(--alert-mid)',
        'alert-soft':'var(--alert-soft)',
        'alert-quiet':'var(--alert-quiet)',
        warning:    'var(--warning)',
        positive:   'var(--positive)',

        /* Legacy aliases for components not yet migrated */
        base:     'rgb(var(--c-base) / <alpha-value>)',
        panel:    'rgb(var(--c-panel) / <alpha-value>)',
        card:     'rgb(var(--c-card) / <alpha-value>)',
        hover:    'rgb(var(--c-hover) / <alpha-value>)',
        border:   'rgb(var(--c-border) / <alpha-value>)',
        primary:  'rgb(var(--c-primary) / <alpha-value>)',
        muted:    'rgb(var(--c-muted) / <alpha-value>)',
        accent:   'rgb(var(--c-accent) / <alpha-value>)',
        orange:   'rgb(var(--c-orange) / <alpha-value>)',
        low:      'rgb(var(--c-low) / <alpha-value>)',
        moderate: 'rgb(var(--c-moderate) / <alpha-value>)',
        high:     'rgb(var(--c-high) / <alpha-value>)',
        critical: 'rgb(var(--c-critical) / <alpha-value>)',
      },
      fontFamily: {
        mono:  ['JetBrains Mono', 'ui-monospace', 'monospace'],
        sans:  ['Inter', 'ui-sans-serif', 'system-ui'],
        serif: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '2px',
        md: '3px',
        lg: '4px',
        xl: '4px',
        '2xl': '6px',
      },
      transitionTimingFunction: {
        institutional: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
