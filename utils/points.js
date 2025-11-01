/**
 * 积分管理工具 - 支持多用户积分隔离
 */

const auth = require("./auth.js");

// 获取当前用户的积分存储key
function getUserCreditsKey() {
  const userData = auth.getUserInfo();
  if (userData && userData.id) {
    return `userCredits_${userData.id}`;
  }
  // 如果没有用户信息，返回默认key（兼容旧版本）
  return "userCredits";
}

function ensureCredits() {
  const key = getUserCreditsKey();
  const stored = wx.getStorageSync(key);
  if (typeof stored === "number" && !isNaN(stored)) {
    return stored;
  }
  
  // 尝试从用户数据中获取积分
  const userData = auth.getUserInfo();
  if (userData && typeof userData.credits === "number") {
    wx.setStorageSync(key, userData.credits);
    return userData.credits;
  }
  
  // 默认值
  wx.setStorageSync(key, 0);
  return 0;
}

function getCredits() {
  return ensureCredits();
}

function setCredits(value) {
  const amount = Number(value);
  const safe = isNaN(amount) ? 0 : Math.max(0, Math.floor(amount));
  const key = getUserCreditsKey();
  wx.setStorageSync(key, safe);
  
  // 同时更新 userData 中的积分
  const userData = auth.getUserInfo();
  if (userData) {
    userData.credits = safe;
    wx.setStorageSync("userData", userData);
  }
  
  return safe;
}

/**
 * 增加积分（同步到服务器）
 * @param {number} delta 增加的积分数量
 * @param {string} source 来源
 * @param {string} description 描述
 * @returns {Promise<number>} 新的积分余额
 */
async function addCredits(delta, source = 'earn', description = '积分获得') {
  return new Promise((resolve, reject) => {
    const amount = Number(delta || 0);
    if (isNaN(amount) || amount <= 0) {
      resolve(getCredits());
      return;
    }

    const token = auth.getToken();
    if (!token) {
      // 未登录，只更新本地缓存
      const current = getCredits();
      const remaining = setCredits(current + amount);
      resolve(remaining);
      return;
    }

    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";

    wx.request({
      url: `${apiBaseUrl}/api/user/credits/add`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: { amount, source, description },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const remaining = res.data.data.remaining;
          setCredits(remaining);
          resolve(remaining);
        } else {
          const error = (res.data && res.data.error) || "增加积分失败";
          console.error("增加积分失败:", error);
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("增加积分请求失败:", err);
        reject(err instanceof Error ? err : new Error(err.errMsg || '网络异常'));
      }
    });
  });
}

/**
 * 消耗积分（同步到服务器）
 * @param {number} cost 消耗的积分数量
 * @param {string} source 来源
 * @param {string} description 描述
 * @returns {Promise<number>} 剩余积分
 */
async function consumeCredits(cost, source = 'consume', description = '积分消费') {
  return new Promise((resolve, reject) => {
    const amount = Number(cost || 0);
    if (isNaN(amount) || amount <= 0) {
      resolve(getCredits());
      return;
    }

    const current = getCredits();
    if (current < amount) {
      reject(new Error('积分不足'));
      return;
    }

    const token = auth.getToken();
    if (!token) {
      // 未登录，只更新本地缓存
      const remaining = setCredits(current - amount);
      resolve(remaining);
      return;
    }

    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";

    wx.request({
      url: `${apiBaseUrl}/api/user/credits/consume`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: { amount, source, description },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const remaining = res.data.data.remaining;
          setCredits(remaining);
          resolve(remaining);
        } else {
          const error = (res.data && res.data.error) || "消耗积分失败";
          console.error("消耗积分失败:", error);
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("消耗积分请求失败:", err);
        reject(err instanceof Error ? err : new Error(err.errMsg || '网络异常'));
      }
    });
  });
}

/**
 * 从服务器同步积分（需要传入token）
 */
async function syncCreditsFromServer() {
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
      url: `${apiBaseUrl}/api/user/profile`,
      method: "GET",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const credits = res.data.data.userInfo.credits || 0;
          setCredits(credits);
          resolve(credits);
        } else {
          const error = (res.data && res.data.error) || "获取积分失败";
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("同步积分失败:", err);
        reject(err);
      }
    });
  });
}

/**
 * 清除当前用户的积分缓存
 */
function clearCredits() {
  const key = getUserCreditsKey();
  wx.removeStorageSync(key);
}

module.exports = {
  getCredits,
  setCredits,
  addCredits,
  consumeCredits,
  ensureCredits,
  syncCreditsFromServer,
  clearCredits
};

