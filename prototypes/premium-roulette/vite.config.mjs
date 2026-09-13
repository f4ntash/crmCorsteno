import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

export default {
  publicDir: path.resolve(directory, '../premium-roulette-assets'),
  resolve: {
    alias: {},
  },
};
