const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript')
function store(call) {
  const messages = []
  const context = { exports: {}, wx: {
    cloud: { callFunction: async ({ data }) => ({ result: await call(data) }) },
    showLoading() {}, hideLoading() {}, showToast: v => messages.push(v.title), showModal: v => messages.push(v.content),
  } }
  const source = fs.readFileSync(require.resolve('../miniprogram/utils/store.ts'), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
  return { ...context.exports, messages }
}
const state = () => ({ role: '用户', activity: '团建', date: '', members: [{ id: 'a', name: '甲', avatar: '', teamId: '' }], teams: [], projects: [], revision: 1, openid: 'own-openid' })
test('云端同步失败不回退演示数据，未连接时不能保存', async () => {
  const app = store(async () => { throw new Error('offline') })
  await assert.rejects(app.sync(), /offline/)
  assert.equal(app.load().revision, -1)
  assert.equal(await app.save(app.load()), false)
})
test('load 是独立快照，失败保存不修改已确认的云端缓存', async () => {
  const app = store(async event => event.action === 'read' ? { ok: true, state: state() } : { ok: false, message: '数据已被更新' })
  await app.sync()
  const changed = app.load(); changed.members[0].name = '未保存'
  assert.equal(app.load().members[0].name, '甲')
  assert.equal(await app.save(changed), false)
  assert.equal(app.load().members[0].name, '甲')
  assert.match(app.messages[0], /更新/)
})
test('保存完成使用服务器返回值与版本，不提前应用本机修改', async () => {
  let finish
  const app = store(event => event.action === 'read' ? { ok: true, state: state() } : new Promise(resolve => { finish = resolve }))
  await app.sync()
  const changed = app.load(); changed.members[0].name = '新昵称'
  const pending = app.save(changed)
  assert.equal(app.load().members[0].name, '甲')
  assert.equal(await app.save(changed), false)
  finish({ ok: true, state: { ...changed, revision: 2 } })
  assert.equal(await pending, true)
  assert.equal(app.load().revision, 2)
  assert.equal(app.load().members[0].name, '新昵称')
})
