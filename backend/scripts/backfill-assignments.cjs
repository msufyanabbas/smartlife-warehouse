/**
 * One-off repair for stock that was assigned before assignment records were
 * written reliably: the inventory row shows `assignedQuantity` deducted from
 * `availableQuantity`, but no assignment row says who is holding it, so the
 * stock report's Assigned column reads zero for that item.
 *
 * For each such item it re-opens the missing assignment from the issued
 * assignment form (ASN) that covers the item — that document is the only record
 * of who received the stock. Items with no such form are reported and left
 * alone: the recipient is not recoverable and inventing one would be worse than
 * the gap.
 *
 * Reports only by default. Pass --apply to write.
 *
 *   node scripts/backfill-assignments.cjs            # dry run
 *   node scripts/backfill-assignments.cjs --apply    # repair
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');

const env = {};
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
}

/** Items whose assigned stock is not covered by active assignment rows. */
const DRIFT_SQL = `
  select i.id, i.name, i.sku,
         i."assignedQuantity"::int as assigned,
         coalesce(sum(a.quantity) filter (where a.status = 'active'), 0)::int as active_assigned,
         (i."assignedQuantity"
            - coalesce(sum(a.quantity) filter (where a.status = 'active'), 0))::int as difference
    from inventory_items i
    left join assignments a on a."itemId" = i.id
   group by i.id
  having i."assignedQuantity"
         <> coalesce(sum(a.quantity) filter (where a.status = 'active'), 0)
   order by i.name
`;

/** The issued ASN covering this item — where the recipient comes from. */
const FORM_SQL = `
  select f.id, f."assignmentNo", f."assignedToId", f."requestedById"
    from assignment_forms f
   where f.status = 'issued'
     and f."assignedToId" is not null
     and exists (select 1 from jsonb_array_elements(f.items) line
                  where line->>'itemId' = $1
                     or lower(line->>'itemCode') = lower($2))
   order by f."createdAt" desc
   limit 1
`;

(async () => {
  const db = new Client({
    host: env.DB_HOST, port: +env.DB_PORT, user: env.DB_USERNAME,
    password: env.DB_PASSWORD, database: env.DB_DATABASE,
  });
  await db.connect();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · ${env.DB_DATABASE} @ ${env.DB_HOST}\n`);

  const drifted = (await db.query(DRIFT_SQL)).rows;
  if (!drifted.length) {
    console.log('Nothing to repair — every item with assigned stock has assignment rows that add up.');
    await db.end();
    return;
  }

  const repaired = [];
  const skipped = [];

  for (const item of drifted) {
    const label = `${item.name} (${item.sku}) assigned=${item.assigned} covered=${item.active_assigned}`;

    // More assignment rows than the item claims is a different fault with a
    // different repair (the rows may be real), so never delete on its account.
    if (item.difference < 0) {
      skipped.push(`${label} — ${-item.difference} MORE assigned than the item records; needs a look, not a backfill`);
      continue;
    }

    const form = (await db.query(FORM_SQL, [item.id, item.sku])).rows[0];
    if (!form) {
      skipped.push(`${label} — no issued assignment form names this item, so the recipient is unknown`);
      continue;
    }

    if (APPLY) {
      await db.query(
        `insert into assignments ("itemId", "assignedToId", "assignedById", quantity, status,
                                  notes, "assignmentFormId", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, 'active', $5, $6, now(), now())`,
        [item.id, form.assignedToId, form.requestedById, item.difference,
         `Backfilled from ASN: ${form.assignmentNo}`, form.id],
      );
    }
    repaired.push(`${label} — ${APPLY ? 'opened' : 'would open'} an assignment for ${item.difference} to the recipient of ${form.assignmentNo}`);
  }

  const heading = (title, lines) => {
    console.log(`${title} (${lines.length})`);
    lines.forEach(line => console.log(`  · ${line}`));
    console.log('');
  };
  if (repaired.length) heading(APPLY ? 'Repaired' : 'Would repair', repaired);
  if (skipped.length) heading('Left alone — needs a human', skipped);

  if (!APPLY && repaired.length) console.log('Re-run with --apply to write these.');

  await db.end();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
