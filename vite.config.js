import { readdirSync, cpSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pageEntries = Object.fromEntries(
  readdirSync(process.cwd())
    .filter((file) => file.endsWith('.html'))
    .map((file) => [file.replace(/\.html$/, ''), resolve(process.cwd(), file)]),
);

export default defineConfig({
  base: '/dongmei-swim/',
  plugins: [
    react(),
    {
      name: 'tmsc-static-site-files',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          // This ignored local override must never enter the public build.
          return html.replace(/\s*<script src="assets\/js\/runtime-config\.js"><\/script>/g, '');
        },
      },
      closeBundle() {
        const output = resolve(process.cwd(), 'dist');
        const dataSource = resolve(process.cwd(), 'data');
        if (existsSync(dataSource)) cpSync(dataSource, resolve(output, 'data'), { recursive: true });
        const imageSource = resolve(process.cwd(), 'assets/images');
        // Vite emits the images used by HTML with content hashes. Keep original JPG
        // URLs for social previews and existing links, but omit unused large PNG masters.
        if (existsSync(imageSource)) cpSync(imageSource, resolve(output, 'assets/images'), {
          recursive: true,
          filter: path => !path.toLowerCase().endsWith('.png'),
        });
        // Keep the formatted source snapshots in the repository for sync/import jobs;
        // browsers use the compact public data generated specifically for the UI.
        for (const file of ['swim-results.json', 'swim-honours.json']) {
          rmSync(resolve(output, 'data', file), { force: true });
        }
        for (const file of ['robots.txt', 'sitemap.xml']) {
          const source = resolve(process.cwd(), file);
          if (existsSync(source)) copyFileSync(source, resolve(output, file));
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: pageEntries },
  },
});
