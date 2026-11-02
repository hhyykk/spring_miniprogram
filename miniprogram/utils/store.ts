export type Role = '用户' | '管理员' | '裁判'
export interface Member { id: string; name: string; avatar: string; teamId: string }
export interface Team { id: string; name: string; avatar: string; captainId: string; slogan?: string }
export interface Entry { teamId: string; status: number; score: number | null; startedAt: number; finishedAt: number }
export interface Project { id: string; name: string; description: string; address: string; latitude: number; longitude: number; start: string; end: string; status: number; images: string[]; video: string; spot: number; entries: Entry[] }
export interface State { role: Role; activity: string; date: string; members: Member[]; teams: Team[]; projects: Project[]; revision: number; openid: string }
export const spots = ['中央草坪', '活力球场', '湖畔步道', '集合广场']
// Legacy project.status is retained for old data; participation belongs to each team.
export function teamStatus(project: Project, teamId: string): number { return project.entries.find(entry => entry.teamId === teamId)?.status ?? 0 }
export const statuses = ['未开始', '进行中', '已结束']
export const entryStatuses = ['待参与', '进行中', '已完成']
// Only an in-memory view of the last confirmed cloud response; never a writable offline store.
let cache: State = { role: '用户', activity: '正在连接云端…', date: '', members: [{ id: '', name: '', avatar: '', teamId: '' }], teams: [], projects: [], revision: -1, openid: '' }
let pulling: Promise<void> | null = null
let saving = false
export function load(): State { return JSON.parse(JSON.stringify(cache)) as State }
async function request(data: object): Promise<State> {
  const response = await wx.cloud.callFunction({ name: 'activity', data })
  const result = response.result as { ok: boolean; state?: State; message?: string }
  if (!result.ok || !result.state) throw new Error(result.message || '云端请求失败')
  return result.state
}
export function sync(): Promise<void> {
  if (saving) return Promise.resolve()
  if (!pulling) pulling = request({ action: 'read' }).then(state => { cache = state }).finally(() => { pulling = null })
  return pulling
}
export async function save(state: State): Promise<boolean> {
  if (saving) { notify('正在保存，请稍候'); return false }
  if (state.revision < 0) { notify('尚未连接云端，请刷新重试'); return false }
  saving = true
  wx.showLoading({ title: '正在保存', mask: true })
  try {
    // Finish any earlier read before committing so it cannot replace the new response.
    if (pulling) await pulling
    cache = await request({ action: 'save', revision: state.revision, state })
    return true
  } catch (error) {
    wx.showModal({ title: '保存失败', content: error instanceof Error ? error.message : '网络异常，请重试', showCancel: false })
    return false
  } finally { saving = false; wx.hideLoading() }
}
export function newProject(state: State): Project { return { id: `p${Date.now()}`, name: '新团队项目', description: '', address: '', latitude: 22.5158, longitude: 113.9436, start: '09:00', end: '10:00', status: 0, images: [], video: '', spot: 0, entries: state.teams.map(t => ({ teamId: t.id, status: 0, score: null, startedAt: 0, finishedAt: 0 })) } }
export function notify(title: string) { wx.showToast({ title, icon: 'none' }) }
export function editText(title: string, value: string, done: (value: string) => void) { wx.showModal({ title, editable: true, content: value, success: r => { if (r.confirm && r.content && r.content.trim()) done(r.content.trim()) } }) }
export function confirm(title: string, content: string, done: () => void) { wx.showModal({ title, content, confirmColor: '#ed681f', success: r => { if (r.confirm) done() } }) }
export async function persistFile(path: string): Promise<string> {
  await sync()
  const me = load().members[0]
  if (!me.id) throw new Error('尚未登录')
  const extension = (path.match(/\.([a-zA-Z0-9]+)(?:\?|$)/) || [])[1] || 'png'
  const result = await wx.cloud.uploadFile({ cloudPath: `media/${load().openid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`, filePath: path })
  return result.fileID
}
export function elapsed(start: number, end: number) { if (!start) return '未开始'; const seconds = Math.max(0, Math.floor(((end || Date.now()) - start) / 1000)); return `${Math.floor(seconds / 60)}分${seconds % 60}秒` }
