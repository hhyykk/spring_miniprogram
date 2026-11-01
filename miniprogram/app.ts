App<IAppOption>({
  globalData: {},
  onLaunch() {
    const logs: number[] = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs.slice(0, 100))
  },
})
