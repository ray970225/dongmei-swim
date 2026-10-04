import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261004153005_admin_operation_audit_logs.sql', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../admin-v2.html', import.meta.url), 'utf8');
const adminScript = await readFile(new URL('../assets/js/admin-v2.js', import.meta.url), 'utf8');
const memberFunction = await readFile(new URL('../supabase/functions/manage-member/index.ts', import.meta.url), 'utf8');

assert.match(migration, /create table public\.admin_audit_logs/i);
assert.match(migration, /alter table public\.admin_audit_logs enable row level security/i);
assert.match(migration, /revoke all on public\.admin_audit_logs from anon, authenticated/i);
assert.match(migration, /grant select on public\.admin_audit_logs to authenticated/i);
assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete)[^;]*\b authenticated\b/i, 'browser sessions must not directly create, edit, or delete audit rows');
assert.match(migration, /create policy admin_audit_logs_admin_read[\s\S]*?using\s*\(public\.has_active_role\(array\['admin'\]/i);
assert.match(migration, /security definer\s+set search_path = ''/i, 'the internal trigger must pin its search path');
assert.match(migration, /and p\.active\s+and p\.role = 'admin'/i, 'the trigger must verify the authenticated administrator');
for (const trigger of ['articles', 'site_news', 'site_honours', 'recruitment_classes']) {
  assert.match(migration, new RegExp(`create trigger admin_audit_${trigger}[\\s\\S]*?on public\\.${trigger}`, 'i'));
}

assert.match(adminPage, /id="pane-audit"/);
assert.match(adminPage, /id="auditEntityFilter"/);
assert.match(adminPage, /id="auditSearch"/);
assert.match(adminScript, /from\('admin_audit_logs'\)/);
assert.match(adminScript, /order\('created_at', \{ ascending: false \}\)\.limit\(200\)/);
assert.match(adminScript, /addEventListener\('input', renderAuditLogs\)/);
assert.match(adminScript, /title\.textContent = `\$\{auditActionNames/);
assert.doesNotMatch(adminScript, /innerHTML\s*=.*(?:row|audit)/i, 'audit data must be rendered as text, not interpreted HTML');
assert.match(memberFunction, /actor_id: user\.id[\s\S]*?actor_email: user\.email/);
assert.match(memberFunction, /entity_type: 'member'/);
assert.match(memberFunction, /auditWarning: true/);

console.log('Admin operation audit logging authorization and UI checks passed.');
