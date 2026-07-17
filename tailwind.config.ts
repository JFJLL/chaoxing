import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        yimei: {
          sidebar: "#5669c9",
          sidebarActive: "#485ab7",
          shell: "#f4f6fb",
          border: "#e7eaf3"
        }
      },
      boxShadow: {
        panel: "0 10px 30px rgba(43, 54, 105, 0.08)",
        floating: "0 18px 40px -18px rgba(43, 54, 105, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
