export type Role = '用户' | '管理员' | '裁判'
export interface Member { id: string; name: string; avatar: string; teamId: string }
export interface Team { id: string; name: string; avatar: string; captainId: string }
export interface Entry { teamId: string; status: number; score: number | null; startedAt: number; finishedAt: number }
export interface Project { id: string; name: string; description: string; address: string; latitude: number; longitude: number; start: string; end: string; status: number; images: string[]; video: string; spot: number; entries: Entry[] }
export interface State { role: Role; activity: string; date: string; members: Member[]; teams: Team[]; projects: Project[] }
const key = 'rally-demo-v1'
export const spots = ['中央草坪', '活力球场', '湖畔步道', '集合广场']
export const statuses = ['未开始', '进行中', '已结束']
export const entryStatuses = ['待参与', '进行中', '已完成']
export function seed(): State {
  const teams: Team[] = ['橘子冲锋队', '追风小分队', '日不落战队'].map((name, i) => ({ id: `t${i}`, name, avatar: '', captainId: `u${i}` }))
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return { role: '用户', activity: '一起出发，快乐加倍', date, teams,
    members: ['林小橙', '陈一帆', '周可乐', '李小满', '王乐乐', '赵阳'].map((name, i) => ({ id: `u${i}`, name, avatar: '', teamId: `t${i % 3}` })),
    projects: ['草坪接力挑战', '默契投篮赛', '湖畔定向寻宝', '团队能量拼图'].map((name, i) => ({ id: `p${i}`, name, description: ['全员接力，把默契变成速度。按裁判指引完成接力路线。', '轮流投篮，配合拿分。请先在场边集合热身。', '沿步道寻找线索，和队友一起解开终点谜题。', '分工协作，完成属于你们的团队图案。'][i], address: `深圳人才公园 · ${spots[i]}（示例地点，请管理员调整）`, latitude: 22.5158 + i * .0007, longitude: 113.9436 + i * .0004, start: '09:00', end: '10:00', status: i === 0 ? 1 : i === 1 ? 2 : 0, images: [], video: '', spot: i, entries: teams.map((t, j) => ({ teamId: t.id, status: i === 1 ? 2 : i === 0 && j === 0 ? 1 : 0, score: i === 1 ? [92, 88, 92][j] : null, startedAt: i === 0 && j === 0 ? Date.now() - 180000 : 0, finishedAt: 0 })) })) }
}
export function load(): State { const existing = wx.getStorageSync(key) as State | undefined; if (existing) return existing; const initial = seed(); save(initial); return initial }
export function save(state: State) { wx.setStorageSync(key, state) }
export function reset() { const state = seed(); save(state); return state }
export function newProject(state: State): Project { return { id: `p${Date.now()}`, name: '新团队项目', description: '填写项目规则与注意事项', address: '请选择精确地点', latitude: 22.5158, longitude: 113.9436, start: '09:00', end: '10:00', status: 0, images: [], video: '', spot: 0, entries: state.teams.map(t => ({ teamId: t.id, status: 0, score: null, startedAt: 0, finishedAt: 0 })) } }
export function notify(title: string) { wx.showToast({ title, icon: 'none' }) }
export function editText(title: string, value: string, done: (value: string) => void) { wx.showModal({ title, editable: true, content: value, success: r => { if (r.confirm && r.content && r.content.trim()) done(r.content.trim()) } }) }
export function confirm(title: string, content: string, done: () => void) { wx.showModal({ title, content, confirmColor: '#ed681f', success: r => { if (r.confirm) done() } }) }
export function persistFile(path: string): Promise<string> { return new Promise((resolve, reject) => wx.saveFile({ tempFilePath: path, success: r => resolve(r.savedFilePath), fail: reject })) }
export function elapsed(start: number, end: number) { if (!start) return '未开始'; const seconds = Math.max(0, Math.floor(((end || Date.now()) - start) / 1000)); return `${Math.floor(seconds / 60)}分${seconds % 60}秒` }
