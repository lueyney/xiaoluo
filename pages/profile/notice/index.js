const notificationsUtil = require("../../../utils/notifications.js");

Page({
  data: {
    globalNotify: true,
    channels: {
      app: true,
      mail: true,
      sms: false
    },
    notifications: []
  },
  onShow() {
    wx.setNavigationBarTitle({ title: "消息通知" });
    this.loadNotifications();
    this.updateProfileBadge();
  },
  loadNotifications() {
    const list = notificationsUtil.getNotifications();
    this.setData({ notifications: list });
  },
  onToggleGlobal(e) {
    const value = !!e.detail.value;
    this.setData({ globalNotify: value });
    if (!value) {
      this.setData({ channels: { app: false, mail: false, sms: false } });
    }
  },
  onToggleChannel(e) {
    const key = e.currentTarget.dataset.key;
    const value = !!e.detail.value;
    this.setData({ [`channels.${key}`]: value });
  },
  markAllRead() {
    notificationsUtil.markAllRead();
    this.loadNotifications();
    this.updateProfileBadge();
  },
  onNoticeTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    notificationsUtil.markRead(id);
    this.loadNotifications();
    this.updateProfileBadge();
  },
  updateProfileBadge() {
    const unread = notificationsUtil.hasUnread();
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && typeof prevPage.refreshNotifications === "function") {
      prevPage.refreshNotifications();
    }
    if (unread) {
      wx.showTabBarRedDot({ index: 4 });
    } else {
      wx.hideTabBarRedDot({ index: 4 });
    }
  },
  noop() {}
});

