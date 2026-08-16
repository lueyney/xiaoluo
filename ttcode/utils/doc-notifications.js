/**
 * 文档通知管理工具
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

function init() {
  try {
    console.log("📄 文档通知系统初始化");
    // 初始化文档通知数据
    ensureDocNotifications();
  } catch (error) {
    console.error('❌ 文档通知系统初始化失败:', error);
  }
}

function ensureDocNotifications() {
  try {
    const key = "docNotifications";
    const stored = safeGetStorage(key);
    if (Array.isArray(stored)) {
      return stored;
    }
    
    // 默认值
    const defaultNotifications = [];
    safeSetStorage(key, defaultNotifications);
    return defaultNotifications;
  } catch (error) {
    console.error('❌ 文档通知数据初始化失败:', error);
    return []; // 确保有默认返回值
  }
}

function getDocNotifications() {
  return ensureDocNotifications();
}

function addDocNotification(notification) {
  const notifications = getDocNotifications();
  const newNotification = {
    id: Date.now(),
    time: new Date().toISOString(),
    read: false,
    ...notification
  };
  
  notifications.unshift(newNotification);
  safeSetStorage("docNotifications", notifications);
  
  // 更新tabBar角标
  updateTabBarBadge();
  
  return newNotification;
}

function updateTabBarBadge() {
  try {
    const notifications = getDocNotifications();
    const unreadCount = notifications.filter(n => !n.read).length;
    
    if (typeof tt !== 'undefined' && tt.setTabBarBadge) {
      if (unreadCount > 0) {
        tt.setTabBarBadge({
          index: 1, // 文档库tab的索引
          text: unreadCount > 99 ? '99+' : unreadCount.toString()
        });
      } else {
        tt.removeTabBarBadge({ index: 1 });
      }
    }
  } catch (error) {
    console.warn("⚠️ 更新tabBar角标失败:", error);
  }
}

function markDocAsRead(notificationId) {
  const notifications = getDocNotifications();
  const notification = notifications.find(n => n.id === notificationId);
  if (notification) {
    notification.read = true;
    safeSetStorage("docNotifications", notifications);
    updateTabBarBadge();
  }
}

module.exports = {
  init,
  ensureDocNotifications,
  getDocNotifications,
  addDocNotification,
  updateTabBarBadge,
  markDocAsRead
};
