const { isDeepStrictEqual: equal } = require('node:util')
const { createHash } = require('node:crypto')
const fail = message => { throw new Error(message) }
const check = (condition, message = '数据格式不正确') => { if (!condition) fail(message) }
const text = (s, max, empty = true) => check(typeof s === 'string' && s.length <= max && (empty || s.trim().length > 0))
const keys = (obj, fields) => check(obj && equal(Object.keys(obj).sort(), fields.split(' ').sort()))
const unique = items => check(new Set(items.map(item => item.id)).size === items.length)
const media = value => { text(value, 1024); check(!value || value.startsWith('cloud://'), '请先上传文件到云存储') }
function validate(s) {
  keys(s, 'activity date members teams projects')
  text(s.activity, 80, false)
  text(s.date, 10)
  check(Array.isArray(s.members) && s.members.length <= 300)
  check(Array.isArray(s.teams) && s.teams.length <= 60)
  check(Array.isArray(s.projects) && s.projects.length <= 60)
  unique(s.members); unique(s.teams); unique(s.projects)
  s.members.forEach(m => {
    keys(m, 'id name avatar teamId'); text(m.id, 64, false); text(m.name, 30, false); media(m.avatar)
    check(m.teamId === '' || s.teams.some(t => t.id === m.teamId))
  })
  s.teams.forEach(t => {
    keys(t, 'id name avatar captainId'); text(t.id, 64, false); text(t.name, 30, false); media(t.avatar)
    check(t.captainId === '' || s.members.some(m => m.id === t.captainId && m.teamId === t.id))
  })
  s.projects.forEach(p => {
    keys(p, 'id name description address latitude longitude start end status images video spot entries')
    text(p.id, 64, false); text(p.name, 30, false); text(p.description, 500); text(p.address, 120)
    check(Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180)
    check(/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.end) && p.start < p.end)
    check([0, 1, 2].includes(p.status) && [0, 1, 2, 3].includes(p.spot))
    check(Array.isArray(p.images) && p.images.length <= 6); p.images.forEach(media); media(p.video)
    check(Array.isArray(p.entries) && p.entries.length === s.teams.length && new Set(p.entries.map(e => e.teamId)).size === p.entries.length)
    p.entries.forEach(e => {
      keys(e, 'teamId status score startedAt finishedAt')
      check(s.teams.some(t => t.id === e.teamId) && [0, 1, 2].includes(e.status))
      check(e.score === null || (Number.isFinite(e.score) && e.score >= 0 && e.score <= 100))
      check(Number.isSafeInteger(e.startedAt) && e.startedAt >= 0 && Number.isSafeInteger(e.finishedAt) && e.finishedAt >= 0)
    })
  })
  check(Buffer.byteLength(JSON.stringify(s)) < 700000, '活动数据已达到容量限制')
}
function roleFor(openid, env = process.env) {
  const list = key => (env[key] || '').split(',').map(s => s.trim()).filter(Boolean)
  return list('ADMIN_OPENIDS').includes(openid) ? '管理员' : list('REFEREE_OPENIDS').includes(openid) ? '裁判' : '用户'
}
const memberId = openid => createHash('sha256').update(openid).digest('hex')
function authorize(before, after, id, role) {
  validate(after)
  const ordered = s => ({ ...s, members: [...s.members].sort((a, b) => a.id.localeCompare(b.id)) })
  before = ordered(before); after = ordered(after)
  check(equal(before.members.map(m => m.id), after.members.map(m => m.id)), '不能新增或删除其他用户')
  if (role === '管理员') return
  const expected = JSON.parse(JSON.stringify(before))
  const me = expected.members.find(m => m.id === id)
  const nextMe = after.members.find(m => m.id === id)
  check(me && nextMe, '登录身份无效')
  me.name = nextMe.name; me.avatar = nextMe.avatar
  if (me.teamId !== nextMe.teamId) {
    check(!me.teamId || !nextMe.teamId, '请先退出当前队伍')
    const old = expected.teams.find(t => t.id === me.teamId)
    me.teamId = nextMe.teamId
    if (old && old.captainId === id) old.captainId = expected.members.find(m => m.teamId === old.id)?.id || ''
    const team = expected.teams.find(t => t.id === me.teamId)
    if (team && !team.captainId) team.captainId = id
  }
  expected.teams.forEach(t => {
    if (t.captainId === id) {
      const next = after.teams.find(item => item.id === t.id)
      if (next) { t.name = next.name; t.avatar = next.avatar }
    }
  })
  if (role === '裁判') {
    expected.projects.forEach(p => {
      const next = after.projects.find(n => n.id === p.id)
      check(next, '裁判不能删除项目')
      p.status = next.status
      p.entries.forEach(e => {
        const n = next.entries.find(item => item.teamId === e.teamId)
        check(n, '参赛记录缺失')
        if (e.status !== n.status) {
          check((p.status === 1 && e.status === 0 && n.status === 1) || (e.status === 1 && n.status === 2), '无效的参赛状态变更')
          if (n.status === 1) { check(n.finishedAt === e.finishedAt && n.startedAt > 0); e.startedAt = n.startedAt }
          else { check(n.startedAt === e.startedAt && n.finishedAt >= e.startedAt); e.finishedAt = n.finishedAt }
          e.status = n.status
        }
        e.score = n.score
      })
    })
  }
  check(equal(expected, after), '没有权限执行此操作，请联系管理员')
}
module.exports = { validate, authorize, memberId, roleFor }
