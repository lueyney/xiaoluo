/**
 * 通知管理工具
 */

const auth = require("./auth.js");

// 安全的存储操作
function safeSetStorage(key, data) {
  try {
    if (typeof tt !== 'undefined' && tt.setStorageSync) {
      tt.setStorageSync(key, data);
      return true;
    }
    return false;
  } catch (e) {
    console.warn(`⚠️ 存储操作失败 (${key}):`, e);
    return false;
  }
}

function safeGetStorage(key) {
  try {
    if (typeof tt !== 'undefined' && tt.getStorageSync) {
      return tt.getStorageSync(key);
    }
    return null;
  } catch (e) {
    console.warn(`⚠️ 获取存储失败 (${key}):`, e);
    return null;
  }
}

function ensureNotifications() {
  try {
    const key = "userNotifications";
    const stored = safeGetStorage(key);
    if (Array.isArray(stored)) {
      return stored;
    }
    
    // 默认值
    const defaultNotifications = [
      {
        id: 1,
        type: "system",
        title: "欢迎使用论文君",
        content: "感谢您使用论文君AI写作助手，祝您使用愉快！",
        time: new Date().toISOString(),
        read: false
      }
    ];
    
    safeSetStorage(key, defaultNotifications);
    return defaultNotifications;
  } catch (error) {
    console.error('❌ 通知系统初始化失败:', error);
    return []; // 确保有默认返回值
  }
}

function getNotifications() {
  return ensureNotifications();
}

function addNotification(notification) {
  const notifications = getNotifications();
  const newNotification = {
    id: Date.now(),
    time: new Date().toISOString(),
    read: false,
    ...notification
  };
  
  notifications.unshift(newNotification);
  safeSetStorage("userNotifications", notifications);
  
  return newNotification;
}

function markAsRead(notificationId) {
  const notifications = getNotifications();
  const notification = notifications.find(n => n.id === notificationId);
  if (notification) {
    notification.read = true;
    safeSetStorage("userNotifications", notifications);
  }
}

function markAllAsRead() {
  const notifications = getNotifications();
  notifications.forEach(n => {
    n.read = true;
  });
  safeSetStorage("userNotifications", notifications);
}

function getUnreadCount() {
  const notifications = getNotifications();
  return notifications.filter(n => !n.read).length;
}

module.exports = {
  ensureNotifications,
  getNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount
};
