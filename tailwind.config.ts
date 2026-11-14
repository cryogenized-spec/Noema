import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        noema: {
          midnight: "#070707",
          indigo: "#17121e",
          glass: "rgba(12, 12, 13, 0.94)",
          glassStrong: "rgba(8, 8, 9, 0.97)",
          panel: "rgba(17, 17, 19, 0.95)",
          border: "rgba(255, 255, 255, 0.13)",
          borderSoft: "rgba(255, 255, 255, 0.08)",
          lime: "#b9ff66",
          violet: "#a78bfa",
          burgundy: "#70243d",
          gold: "#d9b16b",
          muted: "#a3a3a3",
        },
      },
      boxShadow: {
        glass: "0 12px 48px rgba(0, 0, 0, 0.32)",
        focus: "0 0 0 3px rgba(185, 255, 102, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
