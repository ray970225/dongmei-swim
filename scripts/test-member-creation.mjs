import assert from 'node:assert/strict';
import { createMemberAccount } from '../supabase/functions/_shared/create-member-core.js';

const id = 'aa15744e-4f5b-4d96-9dd4-4f41fc6208b5';

function fakeClient({ existingProfile = null, createdProfile = null, createError = null } = {}) {
  const calls = [];
  let profileReads = 0;
  let inviteReads = 0;
  return {
    calls,
    auth: { admin: { async createUser(payload) { calls.push(['createUser', payload]); return createError ? { data: {}, error: createError } : { data: { user: { id } }, error: null }; }, async deleteUser(userId) { calls.push(['deleteUser', userId]); return { error: null }; } } },
    from(table) {
      return {
        select() { return { eq(_column, value) { calls.push(['select', table, value]); return { async maybeSingle() {
          if (table === 'profiles') {
            profileReads += 1;
            return { data: profileReads === 1 ? existingProfile : createdProfile, error: null };
          }
          inviteReads += 1;
          return { data: null, error: null };
        } }; } }; },
        upsert(value, options) { calls.push(['upsert', table, value, options]); return Promise.resolve({ error: null }); },
        delete() { return { async eq(column, value) { calls.push(['delete', table, column, value]); return { error: null }; } }; }
      };
    }
  };
}

const invalidClient = fakeClient();
assert.equal((await createMemberAccount(invalidClient, { email: 'bad', displayName: 'A', initialPassword: 'test-initial-password' })).status, 400);
assert.equal(invalidClient.calls.length, 0, 'invalid emails must not reach Auth or database operations');

const duplicateClient = fakeClient({ existingProfile: { id } });
assert.equal((await createMemberAccount(duplicateClient, { email: 'member@example.com', displayName: 'A', initialPassword: 'test-initial-password' })).status, 409);
assert.equal(duplicateClient.calls.some(([method]) => method === 'createUser'), false, 'existing members must never have their passwords overwritten');

const memberClient = fakeClient({ createdProfile: { id, role: 'member', active: true, must_change_password: true } });
const result = await createMemberAccount(memberClient, { email: ' Member@Example.com ', displayName: ' 選手 A ', initialPassword: 'test-initial-password' });
assert.deepEqual(result, {
  status: 200,
  body: { ok: true, initialPassword: 'test-initial-password' },
  audit: { action: 'create', entityId: id, entityLabel: '選手 A · member@example.com' }
});
const createCall = memberClient.calls.find(([method]) => method === 'createUser');
assert.equal(createCall[1].email, 'member@example.com');
assert.equal(createCall[1].password, 'test-initial-password');
assert.equal(createCall[1].email_confirm, true, 'admin-created members do not require an email confirmation message');
assert.equal(memberClient.calls.some(([method, table, value]) => method === 'upsert' && table === 'member_invites' && value.must_change_password), true);

const brokenTriggerClient = fakeClient({ createdProfile: null });
assert.equal((await createMemberAccount(brokenTriggerClient, { email: 'member@example.com', displayName: 'A', initialPassword: 'test-initial-password' })).status, 500);
assert.equal(brokenTriggerClient.calls.some(([method]) => method === 'deleteUser'), true, 'accounts without a protected member profile must be rolled back');

console.log('Member account creation and first-login safeguards passed.');
