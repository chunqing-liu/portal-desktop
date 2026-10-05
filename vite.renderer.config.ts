import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { mkdir, copyFile } from 'node:fs/promises';
export default defineConfig({
  plugins: [react(), {
    name: 'office-license',
    async closeBundle() {
      const output = path.resolve('.vite/renderer/main_window');
      await mkdir(output, { recursive: true });
      await copyFile('desktop/renderer/pipeline/office/vendor/LICENSE', path.join(output, 'PIXOFFICE-LICENSE.txt'));
      await copyFile('THIRD_PARTY_NOTICES', path.join(output, 'THIRD_PARTY_NOTICES'));
    },
  }],
  root: 'desktop/renderer', publicDir: '../generated', base: './',
  build: { outDir: path.resolve('.vite/renderer/main_window') },
});
