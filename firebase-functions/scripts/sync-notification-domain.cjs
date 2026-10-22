const fs = require('node:fs');
const path = require('node:path');
const from = path.resolve(__dirname, '../../packages/fom-domain');
const to = path.resolve(__dirname, '../src/notification-domain');
fs.mkdirSync(to, { recursive: true });
for (const file of ['notifications.ts', 'ticket-dashboard.ts', 'work-completion.ts']) {
  const source = fs.readFileSync(path.join(from, file));
  const target = path.join(to, file);
  if (!fs.existsSync(target) || !fs.readFileSync(target).equals(source)) fs.writeFileSync(target, source);
}
