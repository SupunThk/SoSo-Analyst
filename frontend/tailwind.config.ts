import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0A",
        surface: "#111111",
        border: "#1E1E1E",
        accent: {
          green: "#00D084",
          amber: "#F5A623",
        },
        text: {
          primary: "#F0F0F0",
          secondary: "#888888",
        }
      },
      fontFamily: {
        mono: ["var(--font-ibm-plex-mono)"],
        sans: ["var(--font-inter)"],
      },
    },
  },
  plugins: [],
};
export default config;
