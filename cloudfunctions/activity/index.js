const cloud = require('wx-server-sdk')
const { authorize, memberId, roleFor, normalizeState } = require('./domain')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const empty = () => ({ activity: '公司团建', date: '', members: [], teams: [], projects: [] })
exports.main = async event => {
  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) throw new Error('请从微信小程序调用')
    const id = memberId(OPENID)
    const role = roleFor(OPENID)
    if (!['read', 'save'].includes(event.action)) throw new Error('未知操作')
    // A fixed document, created by the operator, serializes registration and writes.
    const result = await db.runTransaction(async transaction => {
      const ref = transaction.collection('activities').doc('main')
      const response = await ref.get()
      const doc = response.data
      if (!doc) throw new Error('请先按部署说明创建 activities/main 文档')
      let state = normalizeState(doc.state || empty())
      let revision = doc.revision || 0
      let dirty = JSON.stringify(state) !== JSON.stringify(doc.state)
      const registered = state.members.some(m => m.id === id)
      if (!registered) {
        if (state.members.length >= 300) throw new Error('活动人数已满')
        state.members.push({ id, name: '', avatar: '', teamId: '' })
        dirty = true
      }
      if (event.action === 'save') {
        if (event.revision !== revision || !registered) throw new Error('数据已被更新，请点击刷新后重新修改')
        const input = event.state
        if (!input || input.role !== role) throw new Error('身份已变更，请刷新')
        const next = normalizeState({ activity: input.activity, date: input.date, members: input.members, teams: input.teams, projects: input.projects })
        authorize(state, next, id, role)
        state = next
        dirty = true
      }
      if (dirty) {
        revision += 1
        await ref.set({ data: { state, revision } })
      }
      return { ...state, members: [state.members.find(m => m.id === id), ...state.members.filter(m => m.id !== id)], role, revision, openid: OPENID }
    })
    return { ok: true, state: result.result || result }
  } catch (error) {
    console.error('Activity request failed', error.message)
    return { ok: false, message: error.message || '云端服务异常' }
  }
}
