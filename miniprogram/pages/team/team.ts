import { load, save, sync, Member, Team } from '../../utils/store'
interface Candidate extends Member { teamName: string; selected: boolean }
Page({
  data: { team: null as Team | null, role: '', members: [] as Member[], teamSearch: '', memberCandidates: [] as Candidate[], editingTeamId: '', savingMember: false, cloudError: '' },
  teamId: '',
  poll: null as ReturnType<typeof setInterval> | null,
  onLoad(query: Record<string, string>) { this.teamId = query.id },
  onShow() { this.reload(); this.poll = setInterval(() => this.reload(), 10000) },
  onHide() { if (this.poll) clearInterval(this.poll); this.poll = null },
  onUnload() { if (this.poll) clearInterval(this.poll) },
  async reload() {
    try { await sync(); this.refresh(); this.setData({ cloudError: '' }) }
    catch { this.setData({ cloudError: '云端连接失败，请重试' }) }
  },
  refresh() {
    const state = load()
    const team = state.teams.find(t => t.id === this.teamId) || null
    const query = this.data.teamSearch.trim().toLocaleLowerCase()
    const members = state.members.filter(m => m.teamId === this.teamId)
    const memberCandidates = state.role === '管理员' ? state.members.filter(m => !query || m.name.toLocaleLowerCase().includes(query))
      .map(m => ({ ...m, selected: m.teamId === this.teamId, teamName: state.teams.find(t => t.id === m.teamId)?.name || '未加入队伍' })) : []
    this.setData({ team, role: state.role, members, memberCandidates, editingTeamId: this.teamId })
  },
  searchTeamMembers(e: WechatMiniprogram.Input) { this.setData({ teamSearch: e.detail.value }); this.refresh() },
  async assignTeamMember(e: WechatMiniprogram.TouchEvent) {
    if (this.data.savingMember) return
    const state = load()
    if (state.role !== '管理员') return
    const team = state.teams.find(t => t.id === this.data.editingTeamId)
    const member = state.members.find(m => m.id === e.currentTarget.dataset.id)
    if (!team || !member) return
    const old = state.teams.find(t => t.id === member.teamId)
    member.teamId = member.teamId === team.id ? '' : team.id
    if (old?.captainId === member.id) old.captainId = state.members.filter(m => m.teamId === old.id).sort((a, b) => a.id.localeCompare(b.id))[0]?.id || ''
    if (member.teamId && !team.captainId) team.captainId = member.id
    this.setData({ savingMember: true })
    try { if (await save(state)) this.refresh() }
    finally { this.setData({ savingMember: false }) }
  },
})
