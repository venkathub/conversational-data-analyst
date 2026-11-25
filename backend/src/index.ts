import fs from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openReadOnly } from './db/connection.js';
import { createProvider } from './llm/index.js';

const config = loadConfig();

if (!fs.existsSync(config.dbPath)) {
  console.error('Database not found. Run "npm run seed" first.');
  process.exit(1);
}

const provider = createProvider(config);
const app = createApp({ db: openReadOnly(config.dbPath), provider, corsOrigin: process.env.CORS_ORIGIN });

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (LLM provider: ${provider.name})`);
});
