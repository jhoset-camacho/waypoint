import assert from 'node:assert/strict';
export default async ({api, users}) => {
  const publicRows = await api('anon', 'harness_probe?select=id');
  assert.equal(publicRows.status, 200);
  assert.deepEqual(publicRows.body, [{id:0}]);
  for (const [index, user] of users.entries()) {
    const inserted = await api(user, 'harness_probe', {method:'POST', body:{id:index+1, owner_id:user.id, label:'private'}});
    assert.equal(inserted.status, 201);
    const own = await api(user, 'harness_probe?select=id&order=id');
    assert.equal(own.status, 200);
    assert.deepEqual(own.body, [{id:0},{id:index+1}]);
  }
  assert.deepEqual((await api('anon', 'harness_probe?select=id')).body, [{id:0}]);
  const denied = await api(users[0], 'harness_probe', {method:'POST', body:{id:3, owner_id:users[1].id, label:'forbidden'}});
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, '42501');
  assert.deepEqual((await api(users[1], 'harness_probe?id=eq.3&select=id')).body, []);
  console.log('[database:authorization] PASS: anon + two Auth identities; own positives, cross-user read isolation and denied insert without mutation');
};
