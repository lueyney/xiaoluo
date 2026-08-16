const notificationsUtil = require("../../../utils/notifications.js");

Page({
  data: {
    globalNotify: true,
    channels: {
      app: true,
      mail: true,
      sms: false
    },
    notifications: [],
    displayNotifications: [],
    filterOptions: [{ label: "全部", value: "all" }],
    activeFilter: "all",
    stats: {
      total: 0,
      unread: 0
    }
  },
  onShow() {
    tt.setNavigationBarTitle({ title: "消息通知" });
    this.loadNotifications();
    this.updateProfileBadge();
  },
  loadNotifications() {
    const list = notificationsUtil.getNotifications();
    const filters = this.buildFilters(list);
    const stats = {
      total: list.length,
      unread: list.filter(item => item.unread).length
    };
    this.setData({
      notifications: list,
      filterOptions: filters,
      stats
    }, () => {
      this.applyFilter(this.data.activeFilter);
    });
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
  buildFilters(list) {
    const unique = Array.from(new Set(list.map(item => item.category))).filter(Boolean);
    const chips = [{ label: "全部", value: "all" }];
    unique.forEach(label => {
      chips.push({ label, value: label });
    });
    return chips;
  },
  applyFilter(value = "all") {
    const filtered = value === "all"
      ? this.data.notifications
      : this.data.notifications.filter(item => item.category === value);
    this.setData({
      activeFilter: value,
      displayNotifications: filtered
    });
  },
  onFilterChange(e) {
    const value = e.currentTarget.dataset.value;
    this.applyFilter(value);
  },
  updateProfileBadge() {
    const unread = notificationsUtil.hasUnread();
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && typeof prevPage.refreshNotifications === "function") {
      prevPage.refreshNotifications();
    }
    if (unread) {
      tt.showTabBarRedDot({ index: 4 });
    } else {
      tt.hideTabBarRedDot({ index: 4 });
    }
  },
  noop() {}
});

