import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../.env"));

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} não foi encontrada.`);
  }

  return value;
}

export const env = {
  get GEMINI_API_KEY(): string {
    return required("GEMINI_API_KEY");
  },
  get GROQ_API_KEY(): string {
    return required("GROQ_API_KEY");
  },
};
