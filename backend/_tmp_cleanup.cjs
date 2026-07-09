// Temporary local-verification cleanup — deleted after use.
const fs = require('fs');
const { Client } = require('pg');

const env = {};
for (const line of fs.readFileSync(__dirname + '/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const ITEM_ID = '94a92ed3-33c7-4699-a3fa-48b3e9661fd7';

(async () => {
  const c = new Client({
    host: env.DB_HOST, port: +env.DB_PORT, user: env.DB_USERNAME,
    password: env.DB_PASSWORD, database: env.DB_DATABASE,
  });
  await c.connect();

  const before = await c.query(
    'select "availableQuantity", "assignedQuantity" from inventory_items where id = $1', [ITEM_ID]);
  console.log('item before cleanup:', JSON.stringify(before.rows[0]));

  // Undo the 2 units the verification run issued.
  await c.query(
    'update inventory_items set "availableQuantity" = "availableQuantity" + 2, "assignedQuantity" = "assignedQuantity" - 2 where id = $1',
    [ITEM_ID]);

  const g = await c.query('delete from grn_documents');
  const a = await c.query('delete from assignment_forms');
  const t = await c.query('delete from transfer_forms');
  console.log(`deleted: grn=${g.rowCount} assignment_forms=${a.rowCount} transfer_forms=${t.rowCount}`);

  const after = await c.query(
    'select "availableQuantity", "assignedQuantity" from inventory_items where id = $1', [ITEM_ID]);
  console.log('item after cleanup: ', JSON.stringify(after.rows[0]));
  await c.end();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
