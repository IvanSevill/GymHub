import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { version } = JSON.parse(
  readFileSync(join(__dirname, "package.json"), "utf-8"),
) as {
  version: string;
};

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "unsafe-none",
    },
  },
});
