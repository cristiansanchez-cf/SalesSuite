/** Mapeo CSS-var → Tailwind. Las utilidades de color/radio leen los tokens del tenant. */
const rgb = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,ts,svelte,md}'],
  theme: {
    extend: {
      colors: {
        bg: rgb('bg'),
        surface: rgb('surface'),
        ink: rgb('text'),
        muted: rgb('muted'),
        line: rgb('border'),
        primary: { DEFAULT: rgb('primary'), contrast: rgb('primary-contrast') },
        accent: { DEFAULT: rgb('accent'), contrast: rgb('accent-contrast') },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        display: 'var(--font-display)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        button: 'var(--radius-button)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: { card: 'var(--shadow-card)' },
      maxWidth: { container: 'var(--container-max)' },
      transitionTimingFunction: { out: 'var(--ease-out)' },
    },
  },
  plugins: [],
};
