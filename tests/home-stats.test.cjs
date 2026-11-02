const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const clone = value => JSON.parse(JSON.stringify(value))
function harness() {
  const state = { role: '管理员', activity: '公司团建', members: [{ id: 'u', name: '本人', teamId: 'a' }], teams: [{ id: 'a', name: '本队' }, { id: 'b', name: '其他队' }], projects: [0, 1, 2, 3].map(i => ({ id: 'p' + i, name: '项目' + i, start: '09:00', entries: i === 3 ? [] : [{ teamId: 'a', status: i, score: [null, 0, 15][i] }, { teamId: 'b', status: 2 - i, score: 99 }] })) }
  let definition
  const urls = []
  const store = { load: () => clone(state), entryStatuses: ['待参与', '进行中', '已完成'], teamStatus: (p, id) => p.entries.find(e => e.teamId === id)?.status || 0 }
  const context = { require: () => store, exports: {}, Page: value => { definition = value }, wx: { navigateTo: value => urls.push(value.url) } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../miniprogram/pages/index/index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  const page = { ...definition, data: clone(definition.data), setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() }, scrollToCurrentProject() {} }
  page.refresh()
  return { page, state, urls, open(type) { page.openStatsPanel({ currentTarget: { dataset: { type } } }) } }
}
test('首页待参与与已完成弹窗按本队状态筛选，缺少记录视为待参与', () => {
  const app = harness()
  app.open('pending')
  assert.deepEqual(clone(app.page.data.statsProjects).map(p => p.id), ['p0', 'p3'])
  assert.equal(app.page.data.pending, 2)
  app.open('completed')
  assert.deepEqual(clone(app.page.data.statsProjects).map(p => p.id), ['p2'])
  assert.equal(app.page.data.completed, 1)
})
test('得分弹窗保留零分和待评分，刷新同步分数并可进入项目详情', () => {
  const app = harness()
  app.open('score')
  assert.equal(app.page.data.statsProjects.length, 4)
  assert.equal(app.page.data.statsProjects.find(p => p.id === 'p1').score, 0)
  assert.equal(app.page.data.statsProjects.find(p => p.id === 'p0').score, null)
  assert.equal(app.page.data.totalScore, 15)
  app.state.projects[2].entries[0].score = 20
  app.page.refresh()
  assert.equal(app.page.data.statsProjects.find(p => p.id === 'p2').score, 20)
  assert.equal(app.page.data.totalScore, 20)
  app.page.openStatsProject({ currentTarget: { dataset: { id: 'p2' } } })
  assert.equal(app.page.data.statsPanelType, '')
  assert.deepEqual(app.urls, ['/pages/project/project?id=p2'])
})
test('未加入队伍时不显示其他队伍项目与分数', () => {
  const app = harness()
  app.state.members[0].teamId = ''
  app.page.refresh()
  app.open('score')
  assert.equal(app.page.data.statsProjects.length, 0)
  assert.equal(app.page.data.statsPanelTeam, '')
  assert.equal(app.page.data.totalScore, 0)
})
