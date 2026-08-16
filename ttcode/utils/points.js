/**
 * 积分管理工具 - 支持多用户积分隔离
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

// 获取当前用户的积分存储key
function getUserCreditsKey() {
  try {
    const userData = auth.getUserInfo();
    if (userData && userData.id) {
      return `userCredits_${userData.id}`;
    }
  } catch (e) {
    console.warn('⚠️ 获取用户信息失败:', e);
  }
  // 如果没有用户信息，返回默认key（兼容旧版本）
  return "userCredits";
}

function ensureCredits() {
  try {
    const key = getUserCreditsKey();
    const stored = safeGetStorage(key);
    if (typeof stored === "number" && !isNaN(stored)) {
      return stored;
    }
    
    // 延迟加载auth模块，避免循环依赖
    setTimeout(() => {
      try {
        const auth = require("./auth.js");
        const userData = auth.getUserInfo();
        if (userData && typeof userData.credits === "number") {
          safeSetStorage(key, userData.credits);
        }
      } catch (error) {
        console.warn('⚠️ 延迟加载用户信息失败:', error);
      }
    }, 0);
    
    // 默认值
    safeSetStorage(key, 0);
    return 0;
  } catch (error) {
    console.error('❌ 积分系统初始化失败:', error);
    return 0; // 确保有默认返回值
  }
}

function getCredits() {
  return ensureCredits();
}

function setCredits(value) {
  try {
    const amount = Number(value);
    const safe = isNaN(amount) ? 0 : Math.max(0, Math.floor(amount));
    const key = getUserCreditsKey();
    safeSetStorage(key, safe);
    
    // 同时更新 userData 中的积分
    const userData = auth.getUserInfo();
    if (userData) {
      userData.credits = safe;
      safeSetStorage("userData", userData);
    }
    
    return safe;
  } catch (error) {
    console.error('❌ 设置积分失败:', error);
    return 0;
  }
}

function addCredits(value) {
  const current = getCredits();
  const amount = Number(value);
  const safe = isNaN(amount) ? 0 : Math.max(0, Math.floor(amount));
  return setCredits(current + safe);
}

function deductCredits(value) {
  const current = getCredits();
  const amount = Number(value);
  const safe = isNaN(amount) ? 0 : Math.max(0, Math.floor(amount));
  return setCredits(Math.max(0, current - safe));
}

function hasEnoughCredits(required) {
  const current = getCredits();
  const amount = Number(required);
  const safe = isNaN(amount) ? 0 : Math.max(0, Math.floor(amount));
  return current >= safe;
}

module.exports = {
  getCredits,
  setCredits,
  addCredits,
  deductCredits,
  hasEnoughCredits,
  ensureCredits
};
