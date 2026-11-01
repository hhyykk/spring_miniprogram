const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const vm = require('node:vm')
const domain = require('../cloudfunctions/activity/domain')
const clone = structuredClone
function fixture() {
  return {
    activity: '团建', date: '',
    members: [{ id: 'a', name: '甲', avatar: '', teamId: 't' }, { id: 'b', name: '乙', avatar: '', teamId: 't' }],
    teams: [{ id: 't', name: '队伍', avatar: '', captainId: 'a' }],
    projects: [{ id: 'p', name: '比赛', description: '', address: '', latitude: 22, longitude: 113, start: '09:00', end: '10:00', status: 1, spot: 0, images: [], video: '', entries: [{ teamId: 't', status: 0, score: null, startedAt: 0, finishedAt: 0 }] }],
  }
}
test('普通用户只能修改自己的资料，队长可以修改队名', () => {
  const before = fixture(); const after = clone(before)
  after.members[0].name = '新昵称'; after.teams[0].name = '新队名'
  assert.doesNotThrow(() => domain.authorize(before, after, 'a', '用户'))
  after.members[1].name = '冒名修改'
  assert.throws(() => domain.authorize(before, after, 'a', '用户'), /权限/)
})
test('普通用户无法篡改分数，裁判可评分但不能改规则', () => {
  const before = fixture(); const after = clone(before)
  after.projects[0].entries[0].score = 95
  assert.throws(() => domain.authorize(before, after, 'b', '用户'), /权限/)
  assert.doesNotThrow(() => domain.authorize(before, after, 'b', '裁判'))
  after.projects[0].description = '篡改'
  assert.throws(() => domain.authorize(before, after, 'b', '裁判'), /权限/)
})
test('裁判的开始、完成状态及分数边界验证', () => {
  const before = fixture(); const after = clone(before)
  after.projects[0].entries[0].status = 2
  assert.throws(() => domain.authorize(before, after, 'b', '裁判'), /状态/)
  after.projects[0].entries[0] = { teamId: 't', status: 1, score: 0, startedAt: 10, finishedAt: 0 }
  assert.doesNotThrow(() => domain.authorize(before, after, 'b', '裁判'))
  const done = clone(after); done.projects[0].entries[0].status = 2; done.projects[0].entries[0].finishedAt = 20
  assert.doesNotThrow(() => domain.authorize(after, done, 'b', '裁判'))
  done.projects[0].entries[0].score = 101
  assert.throws(() => domain.authorize(after, done, 'b', '管理员'))
})
test('退出队伍自动转交队长，成员顺序不影响鉴权', () => {
  const before = fixture(); const after = clone(before)
  after.members[0].teamId = ''; after.teams[0].captainId = 'b'; after.members.reverse()
  assert.doesNotThrow(() => domain.authorize(before, after, 'a', '用户'))
})
test('拒绝本机媒体路径、陌生队伍、重复参赛记录和新增假用户', () => {
  for (const mutate of [s => { s.members[0].avatar = 'wxfile://tmp' }, s => { s.members[0].teamId = 'missing' }, s => { s.projects[0].entries.push(s.projects[0].entries[0]) }, s => { s.members.push({ id: 'x', name: '假用户', avatar: '', teamId: '' }) }]) {
    const before = fixture(); const after = clone(before); mutate(after)
    assert.throws(() => domain.authorize(before, after, 'a', '管理员'))
  }
})
test('权限只认服务端环境变量', () => {
  const env = { ADMIN_OPENIDS: 'owner', REFEREE_OPENIDS: 'judge' }
  assert.equal(domain.roleFor('owner', env), '管理员')
  assert.equal(domain.roleFor('judge', env), '裁判')
  assert.equal(domain.roleFor('stranger', env), '用户')
})
// Exercise the real cloud handler with only the SDK boundary replaced.
function handler() {
  let document = { revision: 0, state: { activity: '团建', date: '', members: [], teams: [], projects: [] } }
  let currentOpenid = 'owner'
  let queue = Promise.resolve()
  const sdk = {
    init() {}, getWXContext: () => ({ OPENID: currentOpenid }),
    database: () => ({ runTransaction: fn => {
      const run = queue.then(async () => {
        let next = clone(document)
        const ref = { get: async () => ({ data: clone(next) }), set: async ({ data }) => { next = clone(data) } }
        const result = await fn({ collection: () => ({ doc: () => ref }) })
        document = next
        return { result, errMsg: 'runTransaction:ok' }
      })
      queue = run.catch(() => {})
      return run
    } }),
  }
  const context = { require: name => name === 'wx-server-sdk' ? sdk : domain, exports: {}, console: { error() {} } }
  vm.runInNewContext(readFileSync(require.resolve('../cloudfunctions/activity/index.js'), 'utf8'), context)
  return { call: event => context.exports.main(event), identity: id => { currentOpenid = id } }
}
test('云函数识别不同微信用户、保护其他人的 OpenID，并拒绝过期版本', async () => {
  const app = handler()
  const first = await app.call({ action: 'read' })
  assert.equal(first.ok, true)
  assert.equal(first.state.openid, 'owner')
  assert.equal(first.state.members.length, 1)
  const repeated = await app.call({ action: 'read' })
  assert.equal(repeated.state.revision, first.state.revision)
  app.identity('other')
  const second = await app.call({ action: 'read' })
  assert.equal(second.state.members.length, 2)
  assert.equal(second.state.members[0].id, domain.memberId('other'))
  assert.ok(!JSON.stringify(second.state.members).includes('owner'))
  const stale = await app.call({ action: 'save', revision: first.state.revision, state: first.state })
  assert.equal(stale.ok, false); assert.match(stale.message, /更新/)
})
test('同版本并发保存只允许一个成功，失败写入不覆盖云端', async () => {
  const app = handler(); const { state } = await app.call({ action: 'read' })
  const a = clone(state); a.members[0].name = '名字甲'
  const b = clone(state); b.members[0].name = '名字乙'
  const results = await Promise.all([a, b].map(s => app.call({ action: 'save', revision: s.revision, state: s })))
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.equal((await app.call({ action: 'read' })).state.members[0].name, '名字甲')
})
test('伪造客户端管理员身份不会获得权限', async () => {
  const app = handler(); const { state } = await app.call({ action: 'read' })
  state.role = '管理员'; state.activity = '恶意修改'
  const result = await app.call({ action: 'save', revision: state.revision, state })
  assert.equal(result.ok, false)
  assert.equal((await app.call({ action: 'read' })).state.activity, '团建')
})
