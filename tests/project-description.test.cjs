const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript')
const clone = value => JSON.parse(JSON.stringify(value))
function harness(file, role = '管理员') {
  let state = { role, revision: 1, openid: 'test', activity: '测试活动', date: '', members: [{ id: 'u', name: '本人', avatar: '', teamId: 't' }], teams: [{ id: 't', name: '队伍', avatar: '', captainId: 'u' }], projects: [{ id: 'p', name: '项目', description: '独立项目说明', address: '东门入口', latitude: 22, longitude: 113, start: '09:00', end: '10:00', status: 0, spot: 0, images: [], video: '', entries: [{ teamId: 't', status: 0, score: null, startedAt: 0, finishedAt: 0 }] }] }
  let saved = null
  let succeed = true
  const messages = []
  let definition
  const store = { load: () => clone(state), save: async next => { if (!succeed) return false; saved = clone(next); state = clone(next); return true }, sync: async () => {}, notify: message => messages.push(message), confirm() {} }
  const context = { require: path => path.includes('venue') ? { createVenue() {} } : store, exports: {}, Page: value => { definition = value }, wx: { navigateBack() {} }, console }
  const source = fs.readFileSync(require.resolve(file), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
  const page = { ...definition, data: clone(definition.data), setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() } }
  return { page, messages, getSaved: () => saved, change: mutate => mutate(state), failSave: () => { succeed = false } }
}
test('详情页直接保存项目说明，保持地点地址和坐标不变', async () => {
  const app = harness('../miniprogram/pages/project/project.ts'); const page = app.page
  page.projectId = 'p'; page.refresh()
  assert.equal(typeof page.inputDescription, 'function', '项目详情顶部需要直接填写说明的入口')
  page.inputDescription({ detail: { value: '第一项规则\n第二项规则' } })
  await page.saveDescription()
  const project = app.getSaved().projects[0]
  assert.equal(project.description, '第一项规则\n第二项规则')
  assert.equal(project.address, '东门入口')
  assert.equal(project.latitude, 22)
  assert.equal(project.longitude, 113)
  assert.equal(page.data.descriptionDirty, false)
})
test('地点页只保存地点地址与坐标，不改项目说明', async () => {
  const app = harness('../miniprogram/pages/location/location.ts'); const page = app.page
  page.onLoad({ id: 'p', edit: '1' })
  page.inputAddress({ detail: { value: '西门入口' } })
  page.setPoint(23, 114)
  await page.saveLocation()
  const project = app.getSaved().projects[0]
  assert.equal(project.description, '独立项目说明')
  assert.equal(project.address, '西门入口')
  assert.equal(project.latitude, 23)
  assert.equal(project.longitude, 114)
})
test('定时同步保留未保存的说明，并防止覆盖其他人的说明更新', async () => {
  const app = harness('../miniprogram/pages/project/project.ts'); const page = app.page
  page.projectId = 'p'; page.refresh()
  page.inputDescription({ detail: { value: '尚未保存的规则' } })
  app.change(state => { state.projects[0].description = '另一位管理员更新的规则'; state.revision++ })
  page.refresh()
  assert.equal(page.data.descriptionDraft, '尚未保存的规则')
  await page.saveDescription()
  assert.equal(app.getSaved(), null)
  assert.ok(page.data.descriptionError)
})
test('说明保存失败保留草稿，普通用户无法写入说明', async () => {
  const app = harness('../miniprogram/pages/project/project.ts'); const page = app.page
  page.projectId = 'p'; page.refresh()
  page.inputDescription({ detail: { value: '需要重试的说明' } })
  app.failSave(); await page.saveDescription()
  assert.equal(page.data.descriptionDraft, '需要重试的说明')
  assert.equal(page.data.descriptionDirty, true)
  assert.equal(page.data.descriptionSaving, false)
  const viewer = harness('../miniprogram/pages/project/project.ts', '用户')
  viewer.page.projectId = 'p'; viewer.page.refresh()
  viewer.page.data.descriptionDraft = '越权修改'
  await viewer.page.saveDescription()
  assert.equal(viewer.getSaved(), null)
})
test('说明默认阅读，只有管理员点击可展开，取消与保存后回到阅读状态', async () => {
  const app = harness('../miniprogram/pages/project/project.ts'); const page = app.page
  page.projectId = 'p'; page.refresh()
  assert.equal(page.data.descriptionEditing, false)
  page.beginDescriptionEdit()
  assert.equal(page.data.descriptionEditing, true)
  page.inputDescription({ detail: { value: '未保存的说明' } })
  page.cancelDescriptionEdit()
  assert.equal(page.data.descriptionEditing, false)
  assert.equal(page.data.descriptionDraft, '独立项目说明')
  assert.equal(app.getSaved(), null)
  page.beginDescriptionEdit()
  page.inputDescription({ detail: { value: '保存后的说明' } })
  await page.saveDescription()
  assert.equal(page.data.descriptionEditing, false)
  assert.equal(page.data.project.description, '保存后的说明')
  const viewer = harness('../miniprogram/pages/project/project.ts', '用户')
  viewer.page.projectId = 'p'; viewer.page.refresh(); viewer.page.beginDescriptionEdit()
  assert.equal(viewer.page.data.descriptionEditing, false)
})
