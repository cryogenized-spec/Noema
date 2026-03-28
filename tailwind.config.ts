import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 12px 36px rgba(11, 20, 48, 0.45)',
      },
      colors: {
        noema: {
          bg: '#060b1d',
          panel: 'rgba(21, 28, 53, 0.68)',
          stroke: 'rgba(172, 190, 255, 0.22)',
          accent: '#9ca7ff',
          accentStrong: '#c9b0ff',
          muted: '#95a0c4',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
