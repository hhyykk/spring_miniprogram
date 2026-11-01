App<IAppOption>({
  globalData: {},
  onLaunch() {
    wx.cloud.init({ env: 'aihop-d6gxlq7zxdfdea087', traceUser: true })
    const logs: number[] = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs.slice(0, 100))
  },
})
