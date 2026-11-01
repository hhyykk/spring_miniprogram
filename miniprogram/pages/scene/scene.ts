import { load, save, spots, notify, Project } from '../../utils/store'
import { createVenue } from '../../utils/venue'
interface Venue { rotate(delta: number): void; zoom(factor: number): void; pick(x: number, y: number): string; dispose(): void }
interface CanvasNode { width: number; height: number }
Page({
  data: { projects: [] as Project[], selected: null as Project | null, spots, admin: false, error: '', projectIndex: 0 },
  venue: null as Venue | null, lastX: 0, startX: 0, startY: 0, moved: false, width: 0, height: 0, left: 0, top: 0,
  onLoad(query: Record<string, string>) { const state = load(); this.setData({ projects: state.projects, selected: state.projects.find(p => p.id === query.id) || state.projects[0] || null, admin: state.role === '管理员' }) },
  onReady() { this.init() },
  init() { wx.createSelectorQuery().in(this).select('#venue').fields({ node: true, size: true, rect: true }).exec((results: { node: CanvasNode; width: number; height: number; left: number; top: number }[]) => { const result = results[0]; if (!result?.node) return this.setData({ error: '设备未提供 WebGL Canvas，请在微信真机中重试。' }); try { this.venue?.dispose(); this.left = result.left; this.top = result.top; this.width = result.width; this.height = result.height; this.venue = createVenue(result.node, result.width, result.height, wx.getSystemInfoSync().pixelRatio, this.data.projects, this.data.selected?.id) as Venue } catch (error) { console.error('Venue initialization', error); this.setData({ error: '3D 场景启动失败，请确认设备支持 WebGL。项目地点仍可在地图中查看。' }) } }) },
  onUnload() { this.venue?.dispose() },
  touchStart(e: WechatMiniprogram.TouchEvent) { const point = this.touchPoint(e.touches[0]); this.lastX = point.x; this.startX = this.lastX; this.startY = point.y; this.moved = false },
  touchMove(e: WechatMiniprogram.TouchEvent) { const point = this.touchPoint(e.touches[0]); const x = point.x; this.moved = this.moved || Math.abs(x - this.startX) > 4 || Math.abs(point.y - this.startY) > 4; this.venue?.rotate((x - this.lastX) * .01); this.lastX = x },
  touchEnd(e: WechatMiniprogram.TouchEvent) { if (this.moved || !this.venue || !e.changedTouches.length) return; const touch = this.touchPoint(e.changedTouches[0]); const id = this.venue.pick(touch.x, touch.y); if (id) this.select(id) },
  touchPoint(touch: WechatMiniprogram.TouchDetail) { const local = touch as WechatMiniprogram.TouchDetail & { x?: number; y?: number }; return { x: local.x ?? local.clientX - this.left, y: local.y ?? local.clientY - this.top } },
  select(id: string) { this.setData({ selected: this.data.projects.find(p => p.id === id) || null }); this.init() },
  chooseProject(e: WechatMiniprogram.PickerChange) { this.select(this.data.projects[Number(e.detail.value)].id) },
  zoom(e: WechatMiniprogram.TouchEvent) { this.venue?.zoom(e.currentTarget.dataset.direction === 'in' ? .85 : 1.15) },
  setSpot(e: WechatMiniprogram.PickerChange) { const state = load(); if (state.role !== '管理员' || !this.data.selected) return; const p = state.projects.find(p => p.id === this.data.selected!.id)!; p.spot = Number(e.detail.value); save(state); this.setData({ projects: state.projects, selected: p }); this.init(); notify('3D 项目标记已保存') },
  detail() { if (this.data.selected) wx.navigateTo({ url: `/pages/project/project?id=${this.data.selected.id}` }) },
})
