import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        noema: {
          midnight: "#090f25",
          indigo: "#20163d",
          glass: "rgba(255,255,255,0.08)",
          border: "rgba(255,255,255,0.18)",
        },
      },
      boxShadow: {
        glass: "0 12px 32px rgba(5, 10, 30, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
