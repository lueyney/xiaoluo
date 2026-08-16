/**
 * 登录状态管理工具
 */

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

function safeRemoveStorage(key) {
  try {
    if (typeof tt !== 'undefined' && tt.removeStorageSync) {
      tt.removeStorageSync(key);
      return true;
    }
    return false;
  } catch (e) {
    console.warn(`⚠️ 删除存储失败 (${key}):`, e);
    return false;
  }
}

/**
 * 检查用户是否已登录
 * @returns {boolean} 是否已登录
 */
function isLoggedIn() {
  try {
    const token = safeGetStorage("userToken");
    return !!token;
  } catch (e) {
    console.warn('⚠️ 检查登录状态失败:', e);
    return false;
  }
}

/**
 * 获取用户信息
 * @returns {Object|null} 用户信息对象或 null
 */
function getUserInfo() {
  try {
    const userData = safeGetStorage("userData");
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
    return safeGetStorage("userToken") || null;
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
      if (typeof tt !== 'undefined' && tt.showToast) {
        tt.showToast({
          title: "请先登录",
          icon: "none",
          duration: 1000
        });
      }
      setTimeout(() => {
        if (typeof tt !== 'undefined' && tt.redirectTo) {
          tt.redirectTo({
            url: "/pages/login/index",
            fail: () => {
              if (tt.reLaunch) {
                tt.reLaunch({ url: "/pages/login/index" });
              }
            }
          });
        }
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
    const userData = safeGetStorage("userData");
    
    // 清除基础登录信息
    safeRemoveStorage("userToken");
    safeRemoveStorage("userData");
    
    // 清除用户相关的所有缓存数据
    if (userData && userData.id) {
      safeRemoveStorage(`userCredits_${userData.id}`);
      safeRemoveStorage(`userOrders_${userData.id}`);
      safeRemoveStorage(`userNotifications_${userData.id}`);
      safeRemoveStorage(`userDocuments_${userData.id}`);
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
    safeSetStorage("userToken", token);
    safeSetStorage("userData", userInfo);
    
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
  if (typeof tt !== 'undefined' && tt.showModal) {
    tt.showModal({
      title: "退出登录",
      content: "确定要退出当前账号吗？",
      success: res => {
        if (res.confirm) {
          clearLoginInfo();
          if (tt.showToast) {
            tt.showToast({ title: "已退出登录", icon: "success" });
          }
          
          setTimeout(() => {
            if (tt.reLaunch) {
              tt.reLaunch({ url: "/pages/login/index" });
            }
            if (typeof callback === "function") {
              callback();
            }
          }, 800);
        }
      }
    });
  } else {
    // 降级方案
    clearLoginInfo();
    setTimeout(() => {
      if (typeof callback === "function") {
        callback();
      }
    }, 800);
  }
}

module.exports = {
  isLoggedIn,
  getUserInfo,
  getToken,
  requireLogin,
  clearLoginInfo,
  saveLoginInfo,
  logout,
  safeSetStorage,
  safeGetStorage,
  safeRemoveStorage
};
