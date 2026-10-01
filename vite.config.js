import { readdirSync, cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
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
      transformIndexHtml(html) {
        // This file is an ignored, local-only override and must never enter the public build.
        return html.replace(/\s*<script src="assets\/js\/runtime-config\.js"><\/script>/g, '');
      },
      closeBundle() {
        const output = resolve(process.cwd(), 'dist');
        for (const directory of ['data', 'assets/images']) {
          const source = resolve(process.cwd(), directory);
          if (existsSync(source)) cpSync(source, resolve(output, directory), { recursive: true });
        }
        mkdirSync(resolve(output, 'assets/js'), { recursive: true });
        for (const file of ['intro.js', 'index.js', 'results.js']) {
          const source = resolve(process.cwd(), 'assets/js', file);
          if (existsSync(source)) copyFileSync(source, resolve(output, 'assets/js', file));
        }
        const robots = resolve(process.cwd(), 'robots.txt');
        if (existsSync(robots)) copyFileSync(robots, resolve(output, 'robots.txt'));
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: pageEntries },
  },
});
