/**
 * 文档管理工具 - 支持多用户数据隔离
 */

const auth = require("./auth.js");

// 获取当前用户的文档存储key
function getUserDocumentsKey() {
  const userData = auth.getUserInfo();
  if (userData && userData.id) {
    return `userDocuments_${userData.id}`;
  }
  // 兼容旧版本
  return "savedDocs";
}

/**
 * 获取本地缓存的文档列表
 */
function getDocuments() {
  const key = getUserDocumentsKey();
  const stored = tt.getStorageSync(key);
  if (Array.isArray(stored)) {
    return stored;
  }
  return [];
}

/**
 * 设置本地缓存的文档列表
 */
function setDocuments(list) {
  const key = getUserDocumentsKey();
  tt.setStorageSync(key, list);
  return list;
}

/**
 * 添加文档到本地缓存
 */
function addDocument(doc) {
  const list = getDocuments();
  list.unshift(doc);
  return setDocuments(list);
}

/**
 * 从本地缓存删除文档
 */
function removeDocument(id) {
  const list = getDocuments().filter(item => item.id !== id);
  return setDocuments(list);
}

/**
 * 清除当前用户的文档缓存
 */
function clearDocuments() {
  const key = getUserDocumentsKey();
  tt.removeStorageSync(key);
}

/**
 * 从服务器同步文档列表
 */
async function syncDocumentsFromServer(options = {}) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      reject(new Error("未登录"));
      return;
    }
    
    const app = getApp();
    const apiBaseUrl = tt.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    const { page = 1, limit = 100, type, keyword } = options;
    let url = `${apiBaseUrl}/api/documents?page=${page}&limit=${limit}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
    
    tt.request({
      url,
      method: "GET",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const documents = res.data.data.documents || [];
          setDocuments(documents);
          resolve({
            documents,
            totalWords: res.data.data.totalWords || 0,
            pagination: res.data.data.pagination
          });
        } else {
          const error = (res.data && res.data.error) || "获取文档失败";
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("同步文档失败:", err);
        reject(err);
      }
    });
  });
}

/**
 * 创建文档（保存到服务器）
 */
async function createDocument(docData) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      reject(new Error("未登录"));
      return;
    }
    
    const app = getApp();
    const apiBaseUrl = tt.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    tt.request({
      url: `${apiBaseUrl}/api/documents`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: {
        title: docData.title,
        content: docData.content,
        type: docData.type,
        field: docData.field || "",
        creditsCost: docData.creditsCost || 0
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          // 添加到本地缓存
          const doc = {
            id: Date.now(),
            title: docData.title,
            content: docData.content,
            type: docData.type,
            field: docData.field,
            wordCount: docData.content.length,
            creditsCost: docData.creditsCost || 0,
            createdAt: new Date().toLocaleString()
          };
          addDocument(doc);
          resolve(doc);
        } else {
          const error = (res.data && res.data.error) || "创建文档失败";
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("创建文档失败:", err);
        reject(err);
      }
    });
  });
}

/**
 * 删除文档（从服务器）
 */
async function deleteDocument(id) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      // 未登录，只删除本地缓存
      removeDocument(id);
      resolve(true);
      return;
    }
    
    const app = getApp();
    const apiBaseUrl = tt.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    tt.request({
      url: `${apiBaseUrl}/api/documents/${id}`,
      method: "DELETE",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          // 删除本地缓存
          removeDocument(id);
          resolve(true);
        } else {
          const error = (res.data && res.data.error) || "删除文档失败";
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("删除文档失败:", err);
        reject(err);
      }
    });
  });
}

/**
 * 获取文档详情（从服务器）
 */
async function getDocumentDetail(id) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      reject(new Error("未登录"));
      return;
    }
    
    const app = getApp();
    const apiBaseUrl = tt.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    tt.request({
      url: `${apiBaseUrl}/api/documents/${id}`,
      method: "GET",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          resolve(res.data.data);
        } else {
          const error = (res.data && res.data.error) || "获取文档失败";
          reject(new Error(error));
        }
      },
      fail: (err) => {
        console.error("获取文档详情失败:", err);
        reject(err);
      }
    });
  });
}

module.exports = {
  getDocuments,
  setDocuments,
  addDocument,
  removeDocument,
  clearDocuments,
  syncDocumentsFromServer,
  createDocument,
  deleteDocument,
  getDocumentDetail
};

