import { load, save, sync, newProject, editText, confirm, notify, persistFile, entryStatuses, teamStatus, Project, Member } from '../../utils/store'
interface ProjectCard extends Project { participationStatus: number; hasTeam: boolean }
type StatsPanelType = '' | 'pending' | 'completed' | 'score'
interface StatsProject { id: string; name: string; status: number; score: number | null }
interface MemberCandidate extends Member { teamName: string; selected: boolean }
Page({
  data: { state: load(), tab: 'home', tabs: [{ id: 'home', icon: '◈', name: '活动' }, { id: 'teams', icon: '队', name: '队伍' }, { id: 'rank', icon: '▥', name: '排行榜' }, { id: 'me', icon: '我', name: '我的' }], entryStatuses, projects: [] as ProjectCard[], teams: [] as object[], ranking: [] as object[], me: load().members[0], pending: 0, completed: 0, totalScore: 0, statsPanelType: '' as StatsPanelType, statsPanelTitle: '', statsPanelTeam: '', statsProjects: [] as StatsProject[], scrollSpacerHeight: 0, projectScrollTarget: '', cloudError: '', nameDraft: '', editingTeamId: '', editingTeamName: '', editingTeamAvatar: '', teamSearch: '', memberCandidates: [] as MemberCandidate[] },
  poll: null as ReturnType<typeof setInterval> | null,
  onShow() { this.reload(); this.poll = setInterval(() => this.reload(), 10000) },
  onHide() { if (this.poll) clearInterval(this.poll); this.poll = null },
  onUnload() { if (this.poll) clearInterval(this.poll) },
  onReady() { this.scrollToCurrentProject() },
  refresh() {
    const state = load()
    this.setData({ cloudError: '' })
    const teams = state.teams.map(t => ({ ...t, members: state.members.filter(m => m.teamId === t.id), mine: state.members[0].teamId === t.id }))
    const myTeamId = state.members[0].teamId
    const projects = state.projects.map((project, index) => ({ project, index }))
      .sort((a, b) => {
        const statusOrder = [1, 0, 2]
        return statusOrder.indexOf(teamStatus(a.project, myTeamId)) - statusOrder.indexOf(teamStatus(b.project, myTeamId))
          || a.project.start.localeCompare(b.project.start) || a.index - b.index
      })
      .map(item => ({ ...item.project, address: item.project.address === '请选择精确地点' ? '' : item.project.address, participationStatus: teamStatus(item.project, myTeamId), hasTeam: !!myTeamId }))
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
    const pending = teamId ? state.projects.filter(p => teamStatus(p, teamId) === 0).length : 0
    const completed = teamId ? state.projects.filter(p => teamStatus(p, teamId) === 2).length : 0
    const totalScore = teamId
      ? state.projects.reduce((sum, p) => {
        const entry = p.entries.find(e => e.teamId === teamId)
        return sum + (entry && entry.score !== null ? entry.score : 0)
      }, 0)
      : 0
    if (this.data.me.id !== state.members[0].id || this.data.nameDraft === this.data.me.name) this.setData({ nameDraft: state.members[0].name === '微信用户' ? '' : state.members[0].name })
    this.updateStatsPanel(state, projects)
    this.setData({ state, projects, teams, ranking: sorted.map((t, i) => ({ ...t, rank: sorted.findIndex(s => s.score === t.score) + 1, order: i })), me: state.members[0], pending, completed, totalScore }, () => this.scrollToCurrentProject())
  },
  scrollToCurrentProject() {
    if (this.data.tab !== 'home') return
    const current = this.data.projects.findIndex(project => project.participationStatus === 1)
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
  openStatsPanel(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as StatsPanelType
    if (type !== 'pending' && type !== 'completed' && type !== 'score') return
    this.setData({ statsPanelType: type })
    this.updateStatsPanel(load(), this.data.projects)
  },
  updateStatsPanel(state: ReturnType<typeof load>, projects: Project[]) {
    const type = this.data.statsPanelType
    if (!type) return
    const me = state.members[0]
    const team = state.teams.find(t => t.id === me.teamId)
    const rows: StatsProject[] = []
    if (team) projects.forEach(project => {
      const entry = project.entries.find(e => e.teamId === team.id) || { status: 0, score: null }
      if ( (type === 'pending' && entry.status !== 0) || (type === 'completed' && entry.status !== 2)) return
      rows.push({ id: project.id, name: project.name, status: entry.status, score: entry.score })
    })
    this.setData({ statsPanelTitle: type === 'pending' ? '待参与项目' : type === 'completed' ? '已完成项目' : '各项目得分', statsPanelTeam: team?.name || '', statsProjects: rows })
  },
  closeStatsPanel() { this.setData({ statsPanelType: '', statsProjects: [] }) },
  stopPanelTap() {},
  openStatsProject(e: WechatMiniprogram.TouchEvent) {
    this.closeStatsPanel()
    this.openProject(e)
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
  createTeam() { const state = load(); if (state.role !== '管理员') return; editText('新队伍名称', '', async name => { const id = `t${Date.now()}`; const captainId = state.members[0].teamId || !state.members[0].name.trim() || state.members[0].name === '微信用户' ? '' : state.members[0].id; state.teams.push({ id, name, avatar: '', captainId }); if (captainId) state.members[0].teamId = id; state.projects.forEach(p => p.entries.push({ teamId: id, status: 0, score: null, startedAt: 0, finishedAt: 0 })); if (!await save(state)) return; this.refresh() }) },
  async joinTeam(e: WechatMiniprogram.TouchEvent) { const state = load(); const me = state.members[0]; if (!me.name.trim() || me.name === '微信用户') { this.setData({ tab: 'me' }); return notify('请先填写姓名') }; if (me.teamId) return notify('请先退出当前队伍'); me.teamId = e.currentTarget.dataset.id; const team = state.teams.find(t => t.id === me.teamId)!; if (!team.captainId) team.captainId = me.id; if (!await save(state)) return; this.refresh() },
  leaveTeam() { const state = load(); confirm('退出队伍', '退出后可以加入其他队伍；若你是队长，将由下一位成员接任。', async () => { const team = state.teams.find(t => t.id === state.members[0].teamId); state.members[0].teamId = ''; if (team?.captainId === state.members[0].id) team.captainId = state.members.filter(m => m.teamId === team.id).sort((a, b) => a.id.localeCompare(b.id))[0]?.id || ''; if (!await save(state)) return; this.refresh() }) },
  openTeam(e: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/team/team?id=${e.currentTarget.dataset.id}` }) },
  renameTeam(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    const state = load()
    const team = state.teams.find(t => t.id === id)
    if (!team || (state.role !== '管理员' && team.captainId !== state.members[0].id)) return
    editText('队伍名称', team.name, async name => {
      if (name.length > 30) return notify('队伍名称最多 30 字')
      const latest = load()
      const target = latest.teams.find(t => t.id === id)
      if (!target || (latest.role !== '管理员' && target.captainId !== latest.members[0].id)) return
      target.name = name
      if (await save(latest)) this.refresh()
    })
  },
  chooseTeamAvatar(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    const state = load()
    const team = state.teams.find(t => t.id === id)
    if (!team || (state.role !== '管理员' && team.captainId !== state.members[0].id)) return
    wx.chooseMedia({ count: 1, mediaType: ['image'], success: async result => {
      try {
        const avatar = await persistFile(result.tempFiles[0].tempFilePath)
        const latest = load()
        const target = latest.teams.find(t => t.id === id)
        if (!target || (latest.role !== '管理员' && target.captainId !== latest.members[0].id)) return
        target.avatar = avatar
        if (await save(latest)) this.refresh()
      } catch { notify('队伍头像上传失败，请重试') }
    } })
  },
  openProfile() { this.setData({ tab: 'me' }) },
  inputName(e: WechatMiniprogram.Input) { this.setData({ nameDraft: e.detail.value }) },
  async saveName() {
    const name = this.data.nameDraft.trim()
    if (!name || name === '微信用户') return notify('请填写你的姓名')
    const state = load()
    state.members[0].name = name
    if (await save(state)) { this.refresh(); notify('姓名已保存') }
  },
  async onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) { try { const state = load(); state.members[0].avatar = await persistFile(e.detail.avatarUrl); if (!await save(state)) return; this.refresh() } catch { notify('头像保存失败') } },
})
