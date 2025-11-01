/**
 * 订单管理工具 - 支持多用户数据隔离
 */

const auth = require("./auth.js");

// 获取当前用户的订单存储key
function getUserOrdersKey() {
  const userData = auth.getUserInfo();
  if (userData && userData.id) {
    return `userOrders_${userData.id}`;
  }
  // 兼容旧版本
  return "userOrders";
}

function ensureOrders() {
  const key = getUserOrdersKey();
  const stored = wx.getStorageSync(key);
  if (Array.isArray(stored) && stored.length) {
    return stored;
  }
  // 不再使用假数据，返回空数组
  // 实际订单应该从服务器获取
  return [];
}

function getOrders() {
  return ensureOrders();
}

function setOrders(list) {
  const key = getUserOrdersKey();
  wx.setStorageSync(key, list);
  return list;
}

function updateOrder(id, patch) {
  const list = ensureOrders().map(item =>
    item.id === id ? Object.assign({}, item, patch) : item
  );
  return setOrders(list);
}

function removeOrder(id) {
  const list = ensureOrders().filter(item => item.id !== id);
  return setOrders(list);
}

function addOrder(order) {
  const list = [order].concat(ensureOrders());
  return setOrders(list);
}

/**
 * 清除当前用户的订单缓存
 */
function clearOrders() {
  const key = getUserOrdersKey();
  wx.removeStorageSync(key);
}

/**
 * 从服务器同步订单数据
 */
async function syncOrdersFromServer() {
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
      url: `${apiBaseUrl}/api/orders`,
      method: "GET",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const orders = res.data.data.orders || [];
          setOrders(orders);
          resolve(orders);
        } else {
          const error = (res.data && res.data.error) || "获取订单失败";
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("同步订单失败:", err);
        reject(err);
      }
    });
  });
}

module.exports = {
  getOrders,
  setOrders,
  updateOrder,
  removeOrder,
  addOrder,
  clearOrders,
  syncOrdersFromServer
};

