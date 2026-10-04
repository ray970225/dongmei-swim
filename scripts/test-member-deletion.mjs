import assert from 'node:assert/strict';
import { deleteMemberAccount } from '../supabase/functions/_shared/manage-member-core.js';

const id = '9c15744e-4f5b-4d96-9dd4-4f41fc6208b5';
function fakeClient(profile, deleteError = null) {
  const calls = [];
  return {
    calls,
    auth: { admin: { async deleteUser(userId) { calls.push(['deleteUser', userId]); return { error: deleteError }; } } },
    from(table) {
      return table === 'profiles'
        ? { select() { return { eq(_column, value) { calls.push(['lookup', value]); return { async maybeSingle() { return { data: profile, error: null }; } }; } }; } }
        : { delete() { return { async eq(column, value) { calls.push(['removeInvite', column, value]); return { error: null }; } }; } };
    }
  };
}

const invalidClient = fakeClient({ id, email: 'member@example.com', role: 'member' });
assert.equal((await deleteMemberAccount(invalidClient, 'not-an-id')).status, 400);
assert.equal(invalidClient.calls.length, 0, 'invalid IDs must not trigger account lookups or deletion');

const adminClient = fakeClient({ id, email: 'admin@example.com', role: 'admin' });
assert.equal((await deleteMemberAccount(adminClient, id)).status, 404);
assert.equal(adminClient.calls.some(([method]) => method === 'deleteUser'), false, 'admins must never be deletable through member management');

const memberClient = fakeClient({ id, email: 'member@example.com', display_name: '選手 A', role: 'member' });
assert.deepEqual(await deleteMemberAccount(memberClient, id), {
  status: 200,
  body: { ok: true, deleted: true },
  logMessage: undefined,
  audit: { action: 'delete', entityId: id, entityLabel: '選手 A · member@example.com' }
});
assert.deepEqual(memberClient.calls, [['lookup', id], ['deleteUser', id], ['removeInvite', 'email', 'member@example.com']]);

const failedClient = fakeClient({ id, email: 'member@example.com', role: 'member' }, { message: 'storage object ownership' });
assert.equal((await deleteMemberAccount(failedClient, id)).status, 500);
assert.equal(failedClient.calls.some(([method]) => method === 'removeInvite'), false, 'failed account deletion must not clear the invitation record');

console.log('Member account deletion authorization tests passed.');
