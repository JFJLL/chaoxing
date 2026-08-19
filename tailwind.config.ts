import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        yimei: {
          sidebar: "#24282D",
          sidebarActive: "#3A3F46",
          shell: "#ffffff",
          border: "#EAE5DF"
        }
      },
      boxShadow: {
        panel: "0 10px 30px rgba(39, 35, 31, 0.08)",
        floating: "0 18px 40px -18px rgba(39, 35, 31, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
