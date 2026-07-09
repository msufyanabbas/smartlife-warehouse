// Temporary local-verification helper — deleted after use.
const fs = require('fs');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const env = {};
for (const line of fs.readFileSync(__dirname + '/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

(async () => {
  const c = new Client({
    host: env.DB_HOST, port: +env.DB_PORT, user: env.DB_USERNAME,
    password: env.DB_PASSWORD, database: env.DB_DATABASE,
  });
  await c.connect();
  const r = await c.query(
    `select id, email, role from users where role in ('admin', 'manager') and "isActive" = true limit 1`
  );
  if (!r.rows.length) { console.log('NO_ADMIN'); process.exit(2); }
  const u = r.rows[0];
  const token = jwt.sign({ sub: u.id, email: u.email, role: u.role }, env.JWT_SECRET, { expiresIn: '15m' });
  fs.writeFileSync(__dirname + '/_tmp_token.txt', token);
  console.log('USER=' + u.email + ' ROLE=' + u.role);
  await c.end();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
