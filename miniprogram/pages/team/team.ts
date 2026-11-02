import { load, save, sync, Member, Team, editText, notify, persistFile, confirm } from '../../utils/store'
interface Candidate extends Member { teamName: string; selected: boolean }
Page({
  data: { team: null as Team | null, role: '', canEdit: false, memberScope: 'current', loading: true, uploadingQr: false, openingQr: false, members: [] as Member[], teamSearch: '', memberCandidates: [] as Candidate[], editingTeamId: '', savingMember: false, cloudError: '' },
  teamId: '',
  poll: null as ReturnType<typeof setInterval> | null,
  onLoad(query: Record<string, string>) { this.teamId = query.id },
  onShow() { this.reload(); this.poll = setInterval(() => this.reload(), 10000) },
  onHide() { if (this.poll) clearInterval(this.poll); this.poll = null },
  onUnload() { if (this.poll) clearInterval(this.poll) },
  async reload() {
    try { await sync(); this.refresh(); this.setData({ cloudError: '' }) }
    catch { this.setData({ cloudError: '云端连接失败，请重试' }) }
    finally { this.setData({ loading: false }) }
  },
  refresh() {
    const state = load()
    const team = state.teams.find(t => t.id === this.teamId) || null
    const query = this.data.teamSearch.trim().toLocaleLowerCase()
    const members = state.members.filter(m => m.teamId === this.teamId)
    const source = this.data.memberScope === 'available' && state.role === '管理员' ? state.members.filter(m => m.teamId !== this.teamId) : members
    const memberCandidates = source.filter(m => !query || m.name.toLocaleLowerCase().includes(query))
      .map(m => ({ ...m, selected: m.teamId === this.teamId, teamName: state.teams.find(t => t.id === m.teamId)?.name || '未加入队伍' }))
    this.setData({ team, canEdit: !!team && (state.role === '管理员' || team.captainId === state.members[0].id), role: state.role, members, memberCandidates, editingTeamId: this.teamId })
  },
  searchTeamMembers(e: WechatMiniprogram.Input) { this.setData({ teamSearch: e.detail.value }); this.refresh() },
  uploadGroupQr() {
    const state = load()
    const team = state.teams.find(t => t.id === this.teamId)
    if (!team || this.data.uploadingQr || (state.role !== '管理员' && team.captainId !== state.members[0].id)) return
    wx.chooseMedia({ count: 1, mediaType: ['image'], success: async result => {
      this.setData({ uploadingQr: true })
      try {
        const groupQr = await persistFile(result.tempFiles[0].tempFilePath)
        const latest = load()
        const target = latest.teams.find(t => t.id === this.teamId)
        if (!target || (latest.role !== '管理员' && target.captainId !== latest.members[0].id)) return
        target.groupQr = groupQr
        if (await save(latest)) { this.refresh(); notify('群二维码已更新') }
      } catch { notify('二维码上传失败，请重试') }
      finally { this.setData({ uploadingQr: false }) }
    } })
  },
  async viewGroupQr() {
    const team = load().teams.find(t => t.id === this.teamId)
    if (!team?.groupQr) return notify('队长尚未上传群二维码')
    if (this.data.openingQr) return
    this.setData({ openingQr: true })
    try {
      const file = await wx.cloud.downloadFile({ fileID: team.groupQr })
      wx.previewImage({ urls: [file.tempFilePath], current: file.tempFilePath })
    } catch { notify('二维码加载失败，请重试或联系队长更换') }
    finally { this.setData({ openingQr: false }) }
  },
  removeGroupQr() {
    const state = load()
    const team = state.teams.find(t => t.id === this.teamId)
    if (!team?.groupQr || (state.role !== '管理员' && team.captainId !== state.members[0].id)) return
    confirm('移除群二维码', '移除后，成员将无法在此查看入群二维码。', async () => {
      const latest = load()
      const target = latest.teams.find(t => t.id === this.teamId)
      if (!target || (latest.role !== '管理员' && target.captainId !== latest.members[0].id)) return
      target.groupQr = ''
      if (await save(latest)) this.refresh()
    })
  },
  changeMemberScope(e: WechatMiniprogram.TouchEvent) {
    const scope = e.currentTarget.dataset.scope
    if (scope !== 'current' && scope !== 'available') return
    if (scope === 'available' && load().role !== '管理员') return
    this.setData({ memberScope: scope, teamSearch: '' }); this.refresh()
  },
  editName() { this.editTeamText('name', '队伍名称', 30) },
  editSlogan() { this.editTeamText('slogan', '队伍口号', 100) },
  editTeamText(field: 'name' | 'slogan', title: string, limit: number) {
    const state = load()
    const team = state.teams.find(t => t.id === this.teamId)
    if (!team || (state.role !== '管理员' && team.captainId !== state.members[0].id)) return
    editText(title, team[field] || '', async value => {
      if (value.length > limit) return notify(`最多 ${limit} 字`)
      const latest = load()
      const target = latest.teams.find(t => t.id === this.teamId)
      if (!target || (latest.role !== '管理员' && target.captainId !== latest.members[0].id)) return
      target[field] = value
      if (await save(latest)) this.refresh()
    })
  },
  chooseAvatar() {
    if (!this.data.canEdit) return
    wx.chooseMedia({ count: 1, mediaType: ['image'], success: async result => {
      try {
        const avatar = await persistFile(result.tempFiles[0].tempFilePath)
        const state = load()
        const team = state.teams.find(t => t.id === this.teamId)
        if (!team || (state.role !== '管理员' && team.captainId !== state.members[0].id)) return
        team.avatar = avatar
        if (await save(state)) this.refresh()
      } catch { notify('头像上传失败，请重试') }
    } })
  },
  requestMemberChange(e: WechatMiniprogram.TouchEvent) {
    const state = load()
    if (state.role !== '管理员' || this.data.savingMember) return
    const member = state.members.find(m => m.id === e.currentTarget.dataset.id)
    const team = state.teams.find(t => t.id === this.teamId)
    if (!member || !team) return
    const selected = member.teamId === team.id
    const from = state.teams.find(t => t.id === member.teamId)
    const message = selected ? `将“${member.name || '未填写姓名'}”移出“${team.name}”？` : `将“${member.name || '未填写姓名'}”${from ? `从“${from.name}”` : ''}移入“${team.name}”？`
    confirm(selected ? '移出成员' : '移入成员', message, () => { this.assignTeamMember(e) })
  },
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
