import { load, save, sync, newProject, editText, confirm, notify, persistFile, statuses, Project } from '../../utils/store'
Page({
  data: { state: load(), tab: 'home', tabs: [{ id: 'home', icon: '◈', name: '活动' }, { id: 'teams', icon: '队', name: '队伍' }, { id: 'rank', icon: '▥', name: '排行榜' }, { id: 'me', icon: '我', name: '我的' }], statuses, projects: [] as Project[], teams: [] as object[], ranking: [] as object[], me: load().members[0], pending: 0, completed: 0, totalScore: 0, scrollSpacerHeight: 0, projectScrollTarget: '', cloudError: '' },
  poll: null as ReturnType<typeof setInterval> | null,
  onShow() { this.reload(); this.poll = setInterval(() => this.reload(), 10000) },
  onHide() { if (this.poll) clearInterval(this.poll); this.poll = null },
  onUnload() { if (this.poll) clearInterval(this.poll) },
  onReady() { this.scrollToCurrentProject() },
  refresh() {
    const state = load()
    this.setData({ cloudError: '' })
    const teams = state.teams.map(t => ({ ...t, members: state.members.filter(m => m.teamId === t.id), mine: state.members[0].teamId === t.id }))
    const projects = state.projects.map((project, index) => ({ project, index }))
      .sort((a, b) => {
        const statusOrder = [2, 1, 0]
        return statusOrder.indexOf(a.project.status) - statusOrder.indexOf(b.project.status)
          || a.project.start.localeCompare(b.project.start) || a.index - b.index
      })
      .map(item => item.project)
    const sorted = state.teams.map(t => {
      const entries = state.projects.map(p => p.entries.find(e => e.teamId === t.id))
      const scored = entries.filter(entry => entry && entry.score !== null).length
      return {
        ...t,
        score: entries.reduce((sum, entry) => sum + (entry && entry.score !== null ? entry.score : 0), 0),
        progress: state.projects.length ? Math.round(scored / state.projects.length * 100) : 0,
      }
    }).sort((a, b) => b.score - a.score)
    const teamId = state.members[0].teamId
    const pending = state.projects.filter(p => p.status === 0).length
    const completed = state.projects.filter(p => p.status === 2).length
    const totalScore = teamId
      ? state.projects.reduce((sum, p) => {
        const entry = p.entries.find(e => e.teamId === teamId)
        return sum + (entry && entry.score !== null ? entry.score : 0)
      }, 0)
      : 0
    this.setData({ state, projects, teams, ranking: sorted.map((t, i) => ({ ...t, rank: sorted.findIndex(s => s.score === t.score) + 1, order: i })), me: state.members[0], pending, completed, totalScore }, () => this.scrollToCurrentProject())
  },
  scrollToCurrentProject() {
    if (this.data.tab !== 'home') return
    const current = this.data.projects.findIndex(project => project.status === 1)
    const index = current < 0 ? 0 : current
    this.setData({ scrollSpacerHeight: 0, projectScrollTarget: '' }, () => wx.nextTick(() => {
      if (this.data.tab !== 'home' || !this.data.projects.length) return
      const target = `project-${index}`
      const query = wx.createSelectorQuery().in(this)
      query.select(`#${target}`).boundingClientRect()
      query.select('#project-list-content').boundingClientRect()
      query.select('#project-list').boundingClientRect()
      query.exec((results: { top: number; bottom: number; height: number }[]) => {
        if (this.data.tab !== 'home' || !results[0] || !results[1] || !results[2]) return
        // Keep enough space inside the list to align the current project at its top.
        const scrollSpacerHeight = Math.max(0, Math.ceil(results[2].height - (results[1].bottom - results[0].top)))
        this.setData({ scrollSpacerHeight }, () => wx.nextTick(() => {
          if (this.data.tab === 'home') this.setData({ projectScrollTarget: target })
        }))
      })
    }))
  },
  tabChange(e: WechatMiniprogram.TouchEvent) {
    this.setData({ tab: e.currentTarget.dataset.id }, () => {
      if (this.data.tab === 'home') this.scrollToCurrentProject()
      else wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    })
  },
  async reload() {
    try { await sync(); const state = load(); if (state.revision !== this.data.state.revision || state.role !== this.data.state.role || this.data.cloudError) this.refresh() }
    catch (error) { this.setData({ cloudError: error instanceof Error ? error.message : '云端连接失败' }) }
  },
  async manualRefresh() { this.setData({ cloudError: '' }); await this.reload() },
  copyIdentity() { wx.setClipboardData({ data: load().openid }) },
  openProject(e: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/project/project?id=${e.currentTarget.dataset.id}` }) },
  async addProject() { const state = load(); if (state.role !== '管理员') return; const p = newProject(state); state.projects.push(p); if (!await save(state)) return; wx.navigateTo({ url: `/pages/project/project?id=${p.id}` }) },
  editActivity() { const state = load(); if (state.role !== '管理员') return; editText('活动标题', state.activity, async value => { state.activity = value; if (!await save(state)) return; this.refresh() }) },
  createTeam() { const state = load(); if (state.role !== '管理员') return; editText('新队伍名称', '', async name => { const id = `t${Date.now()}`; const captainId = state.members[0].teamId ? '' : state.members[0].id; state.teams.push({ id, name, avatar: '', captainId }); if (captainId) state.members[0].teamId = id; state.projects.forEach(p => p.entries.push({ teamId: id, status: 0, score: null, startedAt: 0, finishedAt: 0 })); if (!await save(state)) return; this.refresh() }) },
  async joinTeam(e: WechatMiniprogram.TouchEvent) { const state = load(); const me = state.members[0]; if (me.teamId) return notify('请先退出当前队伍'); me.teamId = e.currentTarget.dataset.id; const team = state.teams.find(t => t.id === me.teamId)!; if (!team.captainId) team.captainId = me.id; if (!await save(state)) return; this.refresh() },
  leaveTeam() { const state = load(); confirm('退出队伍', '退出后可以加入其他队伍；若你是队长，将由下一位成员接任。', async () => { const team = state.teams.find(t => t.id === state.members[0].teamId); state.members[0].teamId = ''; if (team?.captainId === state.members[0].id) team.captainId = state.members.filter(m => m.teamId === team.id).sort((a, b) => a.id.localeCompare(b.id))[0]?.id || ''; if (!await save(state)) return; this.refresh() }) },
  editTeam(e: WechatMiniprogram.TouchEvent) { const state = load(); const team = state.teams.find(t => t.id === e.currentTarget.dataset.id); if (!team || (state.role !== '管理员' && team.captainId !== state.members[0].id)) return; wx.showActionSheet({ itemList: ['修改队名', '修改队伍头像'], success: r => { if (r.tapIndex === 0) editText('队伍名称', team.name, async name => { team.name = name; if (!await save(state)) return; this.refresh() }); else wx.chooseMedia({ count: 1, mediaType: ['image'], success: async result => { try { team.avatar = await persistFile(result.tempFiles[0].tempFilePath); if (!await save(state)) return; this.refresh() } catch { notify('图片保存失败，请重试') } } }) } }) },
  moveMember(e: WechatMiniprogram.TouchEvent) { const state = load(); if (state.role !== '管理员') return; const member = state.members.find(m => m.id === e.currentTarget.dataset.id)!; wx.showActionSheet({ itemList: [...state.teams.map(t => t.name), '移出队伍'], success: async r => { const old = state.teams.find(t => t.id === member.teamId); member.teamId = state.teams[r.tapIndex]?.id || ''; if (old?.captainId === member.id) old.captainId = state.members.find(m => m.teamId === old.id)?.id || ''; const next = state.teams.find(t => t.id === member.teamId); if (next && !next.captainId) next.captainId = member.id; if (!await save(state)) return; this.refresh() } }) },
  changeName() { const state = load(); editText('我的昵称', state.members[0].name, async name => { state.members[0].name = name; if (!await save(state)) return; this.refresh() }) },
  async onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) { try { const state = load(); state.members[0].avatar = await persistFile(e.detail.avatarUrl); if (!await save(state)) return; this.refresh() } catch { notify('头像保存失败') } },
})
