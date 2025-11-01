/**
 * 登录状态管理工具
 */

/**
 * 检查用户是否已登录
 * @returns {boolean} 是否已登录
 */
function isLoggedIn() {
  const token = wx.getStorageSync("userToken");
  return !!token;
}

/**
 * 获取用户信息
 * @returns {Object|null} 用户信息对象或 null
 */
function getUserInfo() {
  try {
    const userData = wx.getStorageSync("userData");
    return userData || null;
  } catch (e) {
    console.error("获取用户信息失败:", e);
    return null;
  }
}

/**
 * 获取用户 Token
 * @returns {string|null} Token 或 null
 */
function getToken() {
  try {
    return wx.getStorageSync("userToken") || null;
  } catch (e) {
    console.error("获取 Token 失败:", e);
    return null;
  }
}

/**
 * 检查登录状态，未登录则尝试弹窗一键登录
 * @param {boolean} redirect 是否自动处理未登录，默认为 true
 * @param {boolean} tryQuickLogin 是否尝试弹窗快捷登录，默认为 true
 * @returns {boolean} 是否已登录
 */
function requireLogin(redirect = true, tryQuickLogin = true) {
  if (!isLoggedIn()) {
    if (redirect && tryQuickLogin) {
      // 尝试触发弹窗快捷登录
      const pages = getCurrentPages();
      if (pages.length > 0) {
        const currentPage = pages[pages.length - 1];
        // 检查页面是否有 showPhoneLoginModal 方法
        if (typeof currentPage.showPhoneLoginModal === 'function') {
          currentPage.showPhoneLoginModal();
          return false;
        }
      }
    }
    
    if (redirect) {
      // 降级：跳转到传统登录页（使用redirectTo避免返回）
      wx.showToast({
        title: "请先登录",
        icon: "none",
        duration: 1000
      });
      setTimeout(() => {
        wx.redirectTo({
          url: "/pages/login/index",
          fail: () => {
            wx.reLaunch({ url: "/pages/login/index" });
          }
        });
      }, 1000);
    }
    return false;
  }
  return true;
}

/**
 * 清除登录信息
 */
function clearLoginInfo() {
  try {
    // 先获取用户数据用于清除相关缓存
    const userData = wx.getStorageSync("userData");
    
    // 清除基础登录信息
    wx.removeStorageSync("userToken");
    wx.removeStorageSync("userData");
    
    // 清除用户相关的所有缓存数据
    if (userData && userData.id) {
      wx.removeStorageSync(`userCredits_${userData.id}`);
      wx.removeStorageSync(`userOrders_${userData.id}`);
      wx.removeStorageSync(`userNotifications_${userData.id}`);
      wx.removeStorageSync(`userDocuments_${userData.id}`);
    }
    
    // 清除全局数据
    try {
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.userInfo = null;
      }
    } catch (appError) {
      // getApp()可能在某些时机失败，忽略
      console.log("清除全局数据失败（可忽略）:", appError);
    }
    
    // 清除成功
    console.log("登录信息已清除");
  } catch (e) {
    console.error("清除登录信息时发生错误:", e);
    // 即使出错也不要阻止后续操作
  }
}

/**
 * 保存登录信息
 * @param {string} token JWT Token
 * @param {Object} userInfo 用户信息
 */
function saveLoginInfo(token, userInfo) {
  try {
    wx.setStorageSync("userToken", token);
    wx.setStorageSync("userData", userInfo);
    
    // 更新全局数据
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.userInfo = userInfo;
    }
  } catch (e) {
    console.error("保存登录信息失败:", e);
    throw e;
  }
}

/**
 * 退出登录
 * @param {Function} callback 退出成功后的回调函数
 */
function logout(callback) {
  wx.showModal({
    title: "退出登录",
    content: "确定要退出当前账号吗？",
    success: res => {
      if (res.confirm) {
        clearLoginInfo();
        wx.showToast({ title: "已退出登录", icon: "success" });
        
        setTimeout(() => {
          wx.reLaunch({ url: "/pages/login/index" });
          if (typeof callback === "function") {
            callback();
          }
        }, 800);
      }
    }
  });
}

module.exports = {
  isLoggedIn,
  getUserInfo,
  getToken,
  requireLogin,
  clearLoginInfo,
  saveLoginInfo,
  logout
};

