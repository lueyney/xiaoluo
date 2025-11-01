Page({
  data: {
    preferences: {
      darkMode: false,
      autoSave: true,
      emailNotify: true
    }
  },
  onShow() {
    wx.setNavigationBarTitle({ title: "账号设置" });
  },
  onTogglePreference(e) {
    const key = e.currentTarget.dataset.key;
    const value = !!e.detail.value;
    this.setData({ [`preferences.${key}`]: value });
    wx.showToast({ title: "已更新设置", icon: "success" });
  },
  editProfile() {
    wx.showToast({ title: "编辑功能开发中", icon: "none" });
  },
  onActionTap(e) {
    const type = e.currentTarget.dataset.type;
    const map = {
      password: "修改密码",
      email: "绑定邮箱",
      logout: "退出所有设备"
    };
    const text = map[type] || "操作";
    wx.showToast({ title: text + "开发中", icon: "none" });
  }
});

