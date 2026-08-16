Page({
  data: {
    permissions: {
      history: true,
      location: false,
      voice: false
    }
  },
  onShow() {
    tt.setNavigationBarTitle({ title: "隐私安全" });
  },
  onToggle(e) {
    const key = e.currentTarget.dataset.key;
    const value = !!e.detail.value;
    this.setData({ [`permissions.${key}`]: value });
  },
  onClickAction(e) {
    const map = {
      download: "下载数据",
      delete: "删除记录",
      contact: "联系专员"
    };
    const type = e.currentTarget.dataset.type;
    tt.showToast({ title: (map[type] || "操作") + "开发中", icon: "none" });
  }
});

