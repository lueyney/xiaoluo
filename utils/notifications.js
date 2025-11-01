/**
 * 通知管理工具 - 支持多用户数据隔离
 */

const auth = require("./auth.js");

// 获取当前用户的通知存储key
function getUserNotificationsKey() {
  const userData = auth.getUserInfo();
  if (userData && userData.id) {
    return `userNotifications_${userData.id}`;
  }
  // 兼容旧版本
  return "userNotifications";
}

function ensureNotifications() {
  const key = getUserNotificationsKey();
  const stored = wx.getStorageSync(key);
  if (Array.isArray(stored)) {
    return stored;
  }
  // 不再使用假数据，返回空数组
  // 实际通知应该从服务器获取
  return [];
}

function makeNotification({ category, title, desc, unread = true }) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    category: category || "通知",
    title: title || "",
    desc: desc || "",
    time: formatTime(new Date()),
    unread
  };
}

function formatTime(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return y + "/" + m + "/" + d + " " + h + ":" + mm;
}

function getNotifications() {
  return ensureNotifications();
}

function setNotifications(list) {
  const key = getUserNotificationsKey();
  wx.setStorageSync(key, list);
  return list;
}

function addNotification(payload) {
  const list = ensureNotifications();
  const next = [makeNotification(payload)].concat(list).slice(0, 50);
  return setNotifications(next);
}

function markRead(id) {
  const list = ensureNotifications().map(item =>
    item.id === id ? Object.assign({}, item, { unread: false }) : item
  );
  return setNotifications(list);
}

function markAllRead() {
  const list = ensureNotifications().map(item =>
    item.unread ? Object.assign({}, item, { unread: false }) : item
  );
  return setNotifications(list);
}

function hasUnread() {
  return ensureNotifications().some(item => item.unread);
}

/**
 * 清除当前用户的通知缓存
 */
function clearNotifications() {
  const key = getUserNotificationsKey();
  wx.removeStorageSync(key);
}

/**
 * 从服务器同步通知数据
 */
async function syncNotificationsFromServer() {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      reject(new Error("未登录"));
      return;
    }
    
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    wx.request({
      url: `${apiBaseUrl}/api/notifications`,
      method: "GET",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const notifications = res.data.data.notifications || [];
          setNotifications(notifications);
          resolve(notifications);
        } else {
          const error = (res.data && res.data.error) || "获取通知失败";
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("同步通知失败:", err);
        reject(err);
      }
    });
  });
}

module.exports = {
  getNotifications,
  addNotification,
  markRead,
  markAllRead,
  hasUnread,
  ensureNotifications,
  clearNotifications,
  syncNotificationsFromServer
};

