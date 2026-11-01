import { createVenue } from '../../utils/venue'
import { load, save, sync, Project, notify, confirm, persistFile } from '../../utils/store'
interface PreviewCanvas { width: number; height: number }
interface PreviewVenue { dispose(): void }
Page({
  data: { project: null as Project | null, role: '', detailTab: 'detail', entries: [] as object[], clock: '', countdown: '', markers: [] as object[], mapPoints: [] as { latitude: number; longitude: number }[], hasUserLocation: false, locationError: '', modelPreview: '', previewError: '', videoUrl: '' },
  projectId: '', visible: false, tracking: false, locationListener: null as ((position: { latitude: number; longitude: number }) => void) | null, ready: false, previewVenue: null as PreviewVenue | null,
  onLoad(query: Record<string, string>) { this.projectId = query.id },
  renderedRevision: -1,
  poll: null as ReturnType<typeof setInterval> | null,
  async reload() { try { await sync(); if (load().revision !== this.renderedRevision || load().role !== this.data.role) this.refresh(); if (this.ready && !this.data.modelPreview) this.renderModelPreview() } catch { notify('云端连接失败，请返回重试') } },
  onShow() { this.visible = true; this.reload(); this.locateUser(); this.poll = setInterval(() => this.reload(), 10000) },
  onReady() { this.ready = true; this.renderModelPreview() },
  onHide() { this.stopTracking(); if (this.poll) clearInterval(this.poll) }, onUnload() { this.stopTracking(); if (this.poll) clearInterval(this.poll); this.previewVenue?.dispose() },
  refresh() {
    const state = load()
    this.renderedRevision = state.revision
    const project = state.projects.find(item => item.id === this.projectId)
    if (!project) { this.setData({ project: null }); return }
    if (project.video !== this.data.project?.video) {
      this.setData({ videoUrl: '' })
      if (project.video) wx.cloud.getTempFileURL({ fileList: [project.video] }).then(result => {
        if (this.data.project?.video === project.video) this.setData({ videoUrl: result.fileList[0].tempFileURL })
      }).catch(() => notify('视频加载失败，请重新打开项目'))
    }
    if (project.address === '请选择精确地点') project.address = ''
    this.setData({ project, entries: project.entries.map(e => ({ ...e, name: state.teams.find(t => t.id === e.teamId)?.name || '队伍', mine: e.teamId === state.members[0].teamId })), role: state.role, markers: [{
      id: 99, iconPath: '/assets/pin.png', width: 28, height: 36,
      latitude: project.latitude, longitude: project.longitude, title: project.name,
    }], mapPoints: [{ latitude: project.latitude, longitude: project.longitude }] })
  },
  applyLocation(position: { latitude: number; longitude: number }) {
    if (!this.visible) return
    const project = this.data.project
    this.setData({
      hasUserLocation: true,
      locationError: '',
      mapPoints: [
        ...(project ? [{ latitude: project.latitude, longitude: project.longitude }] : []),
        { latitude: position.latitude, longitude: position.longitude },
      ],
    })
  },
  locateUser() {
    wx.getLocation({
      type: 'gcj02',
      success: position => {
        if (!this.visible) return
        this.applyLocation(position)
        this.locationListener = result => this.applyLocation(result)
        wx.onLocationChange(this.locationListener)
        wx.startLocationUpdate({
          type: 'gcj02',
          success: () => {
            if (!this.visible) { wx.stopLocationUpdate({}); return }
            this.tracking = true
          },
          fail: () => {
            if (this.locationListener) wx.offLocationChange(this.locationListener)
            this.locationListener = null
            if (this.visible) this.setData({ locationError: '自动定位暂不可用，请检查微信定位权限' })
          },
        })
      },
      fail: () => {
        if (this.visible) this.setData({ hasUserLocation: false, locationError: '无法获取当前位置，请开启微信定位权限' })
      },
    })
  },
  stopTracking() {
    this.visible = false
    if (this.locationListener) wx.offLocationChange(this.locationListener)
    this.locationListener = null
    if (this.tracking) wx.stopLocationUpdate({})
    this.tracking = false
  },
  renderModelPreview() {
    if (!this.data.project || this.data.detailTab !== 'detail') return
    this.setData({ modelPreview: '', previewError: '' })
    wx.createSelectorQuery().in(this).select('#model-preview-canvas')
      .fields({ node: true, size: true })
      .exec((results: { node: PreviewCanvas; width: number; height: number }[]) => {
        const result = results[0]
        if (!result || !result.node) {
          this.setData({ previewError: '预览暂不可用，点击打开 3D 场地' })
          return
        }
        try {
          this.previewVenue?.dispose()
          this.previewVenue = createVenue(result.node, result.width, result.height,
            wx.getSystemInfoSync().pixelRatio, load().projects, this.projectId, true) as PreviewVenue
          wx.canvasToTempFilePath({
            canvas: result.node,
            fileType: 'png',
            success: image => this.setData({ modelPreview: image.tempFilePath }),
            fail: () => this.setData({ previewError: '预览暂不可用，点击打开 3D 场地' }),
            complete: () => { this.previewVenue?.dispose(); this.previewVenue = null },
          }, this)
        } catch (error) {
          console.error('Model preview', error)
          this.previewVenue?.dispose()
          this.previewVenue = null
          this.setData({ previewError: '预览暂不可用，点击打开 3D 场地' })
        }
      })
  },
  async mutate(change: (project: Project) => void, adminOnly = true) { const state = load(); if (adminOnly ? state.role !== '管理员' : state.role === '用户') return false; const p = state.projects.find(item => item.id === this.projectId); if (!p) return false; change(p); if (!await save(state)) return false; this.refresh(); return true },
  async saveForm(e: WechatMiniprogram.FormSubmit) { const v = e.detail.value as Record<string, string>; const name = v.name.trim(); if (!name) return notify('请填写项目名称'); if (await this.mutate(p => { p.name = name; p.description = v.description.trim() })) notify('项目资料已保存') },
  switchDetailTab(e: WechatMiniprogram.TouchEvent) {
    const detailTab = String(e.currentTarget.dataset.tab)
    if (detailTab !== 'detail' && detailTab !== 'progress') return
    this.setData({ detailTab }, () => { if (detailTab === 'detail') this.renderModelPreview() })
  },
  async entryAction(e: WechatMiniprogram.TouchEvent) {
    const state = load()
    const project = state.projects.find(p => p.id === this.projectId)
    const teamId = state.members[0].teamId
    if (!project || !teamId || teamId !== e.currentTarget.dataset.id) return notify('只能操作自己队伍的进度')
    const entry = project.entries.find(item => item.teamId === teamId)
    if (!entry) return
    if (e.currentTarget.dataset.action === 'start' && entry.status === 0) {
      entry.status = 1
      entry.startedAt = Date.now()
    } else if (e.currentTarget.dataset.action === 'finish' && entry.status === 1) {
      entry.status = 2
      entry.finishedAt = Date.now()
    } else return
    if (await save(state)) this.refresh()
  },
  score(e: WechatMiniprogram.TouchEvent) { if (load().role === '用户') return; const id = e.currentTarget.dataset.id; const entry = this.data.project!.entries.find(item => item.teamId === id)!; wx.showModal({ title: '录入成绩（0～100）', editable: true, content: entry.score === null ? '' : String(entry.score), success: r => { if (!r.confirm) return; const raw = (r.content || '').trim(); const value = Number(raw); if (!raw || !Number.isFinite(value) || value < 0 || value > 100) return notify('请输入 0～100 的有效分数'); this.mutate(p => { p.entries.find(item => item.teamId === id)!.score = value }, false) } }) },
  async addMedia(e: WechatMiniprogram.TouchEvent) { if (load().role !== '管理员') return; const video = e.currentTarget.dataset.type === 'video'; const remaining = 6 - this.data.project!.images.length; if (!video && !remaining) return notify('最多 6 张图片'); wx.chooseMedia({ count: video ? 1 : remaining, mediaType: [video ? 'video' : 'image'], sourceType: ['album', 'camera'], success: async result => { try { const paths = await Promise.all(result.tempFiles.map(file => persistFile(file.tempFilePath))); this.mutate(p => { if (video) p.video = paths[0]; else p.images.push(...paths) }) } catch { notify('媒体上传失败，请检查网络和云存储权限') } } }) },
  removeMedia(e: WechatMiniprogram.TouchEvent) { confirm('删除参考资料', '确定移除这份参考资料？', () => this.mutate(p => { if (e.currentTarget.dataset.type === 'video') p.video = ''; else p.images.splice(Number(e.currentTarget.dataset.index), 1) })) },
  async preview(e: WechatMiniprogram.TouchEvent) {
    try {
      const images = this.data.project!.images
      const result = await wx.cloud.getTempFileURL({ fileList: images })
      const urls = result.fileList.map(file => file.tempFileURL)
      if (urls.some(url => !url)) throw new Error('图片不可用')
      wx.previewImage({ urls, current: urls[Math.max(0, images.indexOf(e.currentTarget.dataset.src))] })
    } catch { notify('图片加载失败，请重试') }
  },
  location() { wx.navigateTo({ url: `/pages/location/location?id=${this.projectId}${this.data.role === '管理员' ? '&edit=1' : ''}` }) },
  scene() { wx.navigateTo({ url: `/pages/scene/scene?id=${this.projectId}` }) },
  deleteProject() { confirm('删除项目', '相关参赛状态和成绩将一起移除，总榜会重新计算。此操作不可撤销。', async () => { const state = load(); if (state.role !== '管理员') return; state.projects = state.projects.filter(p => p.id !== this.projectId); if (await save(state)) wx.navigateBack() }) },
})
