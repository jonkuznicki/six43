import type { Config } from 'tailwindcss'

// Brand mappings point at the CSS variables in src/styles/brand.css, so there
// is one source of truth. Tailwind only emits CSS for classes that are used,
// so these mappings add nothing to the build until a component uses them.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        forest:   'rgba(var(--brand-forest-rgb), <alpha-value>)',
        cream:    'rgba(var(--brand-cream-rgb), <alpha-value>)',
        clay:     'rgba(var(--brand-clay-rgb), <alpha-value>)',
        charcoal: 'rgba(var(--brand-charcoal-rgb), <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        ui:      ['var(--font-ui)'],
      },
    },
  },
  plugins: [],
}

export default config
