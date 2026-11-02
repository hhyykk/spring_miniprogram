const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const clone = value => JSON.parse(JSON.stringify(value))
function harness(role = '管理员', wx = {}) {
  let state = { role, members: [{ id: 'a', name: '甲', teamId: 'old' }, { id: 'b', name: '乙', teamId: 'old' }], teams: [{ id: 'old', name: '旧队', captainId: 'a' }, { id: 'new', name: '新队', captainId: '' }] }
  let definition
  let saves = 0
  const store = { persistFile: async () => 'cloud://test/qr.png', notify() {}, load: () => clone(state), sync: async () => {}, save: async next => { state = clone(next); saves++; return true } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../miniprogram/pages/team/team.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { wx, require: () => store, exports: {}, Page: value => { definition = value } })
  const page = { ...definition, data: clone(definition.data), setData(patch) { Object.assign(this.data, patch) } }
  page.onLoad({ id: 'new' }); page.refresh()
  return { page, state: () => state, saves: () => saves }
}
test('队伍详情按姓名搜索并转移成员，自动交接旧队长及设置新队长', async () => {
  const app = harness()
  app.page.changeMemberScope({ currentTarget: { dataset: { scope: 'available' } } })
  app.page.searchTeamMembers({ detail: { value: '甲' } })
  assert.equal(app.page.data.memberCandidates.length, 1)
  await app.page.assignTeamMember({ currentTarget: { dataset: { id: 'a' } } })
  assert.equal(app.state().members[0].teamId, 'new')
  assert.equal(app.state().teams[0].captainId, 'b')
  assert.equal(app.state().teams[1].captainId, 'a')
  assert.equal(app.page.data.members.length, 1)
  await app.page.assignTeamMember({ currentTarget: { dataset: { id: 'a' } } })
  assert.equal(app.state().members[0].teamId, '')
  assert.equal(app.state().teams[1].captainId, '')
})
test('普通成员不能通过队伍详情调整成员，失效队伍不写入', async () => {
  const app = harness('用户')
  assert.equal(app.page.data.memberCandidates.length, 0)
  await app.page.assignTeamMember({ currentTarget: { dataset: { id: 'a' } } })
  assert.equal(app.saves(), 0)
  const admin = harness()
  admin.page.onLoad({ id: 'missing' }); admin.page.refresh()
  assert.equal(admin.page.data.team, null)
  await admin.page.assignTeamMember({ currentTarget: { dataset: { id: 'a' } } })
  assert.equal(admin.saves(), 0)
})

test('统一成员名册按当前与可移入范围搜索，普通用户仅可查看本队成员', () => {
  const app = harness()
  assert.equal(app.page.data.memberCandidates.length, 0)
  app.page.changeMemberScope({ currentTarget: { dataset: { scope: 'available' } } })
  assert.equal(app.page.data.memberCandidates.length, 2)
  assert.ok(app.page.data.memberCandidates.every(m => !m.selected))
  app.page.changeMemberScope({ currentTarget: { dataset: { scope: 'current' } } })
  assert.equal(app.page.data.memberCandidates.length, 0)
  const viewer = harness('用户')
  viewer.page.onLoad({ id: 'old' }); viewer.page.refresh()
  assert.equal(viewer.page.data.memberCandidates.length, 2)
  viewer.page.changeMemberScope({ currentTarget: { dataset: { scope: 'available' } } })
  assert.equal(viewer.page.data.memberScope, 'current')
})

test('上传群二维码保存云文件，查看时下载并打开大图', async () => {
  let upload
  let preview
  const wx = { chooseMedia: options => { upload = options.success({ tempFiles: [{ tempFilePath: 'tmp-qr.png' }] }) }, cloud: { downloadFile: async options => { assert.equal(options.fileID, 'cloud://test/qr.png'); return { tempFilePath: 'downloaded.png' } } }, previewImage: options => { preview = options } }
  const app = harness('管理员', wx)
  app.page.uploadGroupQr(); await upload
  assert.equal(app.state().teams[1].groupQr, 'cloud://test/qr.png')
  assert.equal(app.page.data.uploadingQr, false)
  await app.page.viewGroupQr()
  assert.equal(preview.current, 'downloaded.png')
  assert.equal(app.page.data.openingQr, false)
})
test('普通成员不能上传群二维码，二维码下载失败后可重试', async () => {
  let choices = 0
  const app = harness('用户', { chooseMedia: () => { choices++ }, cloud: { downloadFile: async () => { throw new Error('offline') } } })
  app.page.uploadGroupQr()
  assert.equal(choices, 0)
  app.state().teams[1].groupQr = 'cloud://test/qr.png'
  await app.page.viewGroupQr()
  assert.equal(app.page.data.openingQr, false)
})
