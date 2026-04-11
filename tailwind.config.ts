import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        noema: {
          midnight: "#090f25",
          indigo: "#20163d",
          glass: "rgba(8,12,30,0.72)",
          glassStrong: "rgba(7,10,24,0.84)",
          panel: "rgba(14,20,44,0.78)",
          border: "rgba(148,163,184,0.22)",
          borderSoft: "rgba(148,163,184,0.14)",
        },
      },
      boxShadow: {
        glass: "0 12px 30px rgba(2, 6, 23, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
