import { load, Project } from '../../utils/store'
import { createVenue } from '../../utils/venue'
interface Venue { rotate(delta: number): void; zoom(factor: number): void; pick(x: number, y: number): string; dispose(): void }
interface CanvasNode { width: number; height: number }
Page({
  data: { projects: [] as Project[], selected: null as Project | null, error: '', backTop: 48, backHeight: 44, controlsBottom: 32 },
  venue: null as Venue | null, lastX: 0, startX: 0, startY: 0, moved: false, pinchDistance: 0, width: 0, height: 0, left: 0, top: 0,
  onLoad(query: Record<string, string>) {
    const state = load()
    const menu = wx.getMenuButtonBoundingClientRect()
    const system = wx.getSystemInfoSync()
    const bottomInset = system.safeArea ? Math.max(0, system.screenHeight - system.safeArea.bottom) : 0
    this.setData({ projects: state.projects, selected: state.projects.find(p => p.id === query.id) || state.projects[0] || null, backTop: menu.top, backHeight: Math.max(44, menu.height), controlsBottom: bottomInset + 16 })
  },
  onReady() { this.init() },
  onResize() { this.init() },
  init() {
    wx.createSelectorQuery().in(this).select('#venue').fields({ node: true, size: true, rect: true }).exec((results: { node: CanvasNode; width: number; height: number; left: number; top: number }[]) => {
      const result = results[0]
      if (!result?.node || !result.width || !result.height) return this.setData({ error: '设备未提供 WebGL Canvas，请在微信真机中重试。' })
      try {
        this.venue?.dispose()
        this.venue = null
        this.left = result.left; this.top = result.top; this.width = result.width; this.height = result.height
        this.venue = createVenue(result.node, result.width, result.height, wx.getSystemInfoSync().pixelRatio, this.data.projects, this.data.selected?.id) as Venue
        this.setData({ error: '' })
      } catch (error) {
        console.error('Venue initialization', error)
        this.setData({ error: '3D 场景启动失败，请确认设备支持 WebGL。' })
      }
    })
  },
  onUnload() { this.venue?.dispose(); this.venue = null },
  touchStart(e: WechatMiniprogram.TouchEvent) {
    if (!e.touches.length) return
    const point = this.touchPoint(e.touches[0])
    this.lastX = point.x; this.startX = point.x; this.startY = point.y
    this.pinchDistance = e.touches.length > 1 ? this.touchDistance(e.touches[0], e.touches[1]) : 0
    this.moved = e.touches.length > 1
  },
  touchMove(e: WechatMiniprogram.TouchEvent) {
    if (!e.touches.length) return
    if (e.touches.length > 1) {
      const distance = this.touchDistance(e.touches[0], e.touches[1])
      if (this.pinchDistance > 0 && distance > 0) this.venue?.zoom(this.pinchDistance / distance)
      this.pinchDistance = distance; this.moved = true
      return
    }
    const point = this.touchPoint(e.touches[0])
    if (this.pinchDistance) { this.pinchDistance = 0; this.lastX = point.x; return }
    this.moved = this.moved || Math.abs(point.x - this.startX) > 4 || Math.abs(point.y - this.startY) > 4
    this.venue?.rotate((point.x - this.lastX) * .01)
    this.lastX = point.x
  },
  touchEnd(e: WechatMiniprogram.TouchEvent) {
    this.pinchDistance = 0
    if (e.touches.length) { this.lastX = this.touchPoint(e.touches[0]).x; this.moved = true; return }
    if (this.moved || !this.venue || !e.changedTouches.length) return
    const touch = this.touchPoint(e.changedTouches[0])
    const id = this.venue.pick(touch.x, touch.y)
    if (id) this.select(id)
  },
  touchCancel() { this.pinchDistance = 0; this.moved = true },
  touchPoint(touch: WechatMiniprogram.TouchDetail) {
    const local = touch as WechatMiniprogram.TouchDetail & { x?: number; y?: number }
    return { x: local.x ?? local.clientX - this.left, y: local.y ?? local.clientY - this.top }
  },
  touchDistance(first: WechatMiniprogram.TouchDetail, second: WechatMiniprogram.TouchDetail) {
    const a = this.touchPoint(first); const b = this.touchPoint(second)
    return Math.hypot(a.x - b.x, a.y - b.y)
  },
  select(id: string) { this.setData({ selected: this.data.projects.find(p => p.id === id) || null }); this.init() },
  zoom(e: WechatMiniprogram.TouchEvent) { this.venue?.zoom(e.currentTarget.dataset.direction === 'in' ? .85 : 1.15) },
  back() {
    if (getCurrentPages().length > 1) wx.navigateBack()
    else wx.redirectTo({ url: this.data.selected ? `/pages/project/project?id=${this.data.selected.id}` : '/pages/index/index' })
  },
})
