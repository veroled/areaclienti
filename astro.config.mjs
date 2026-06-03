// @ts-check
import { defineConfig } from 'astro/config';

// Portale clienti VeroLED — deploy su Cloudflare Pages, dominio areaclienti.veroledsrl.com.
// Output statico + Pages Functions nella cartella functions/ (nessun adapter necessario).
export default defineConfig({
  site: 'https://areaclienti.veroledsrl.com',
  trailingSlash: 'never',
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
});
