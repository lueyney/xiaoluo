/**
 * 文档管理工具 - 支持多用户数据隔离
 */

const auth = require("./auth.js");
const { getApiBaseUrl } = require("./request.js");

function getUserDocumentsKey() {
  const userData = auth.getUserInfo();
  if (userData && userData.id) {
    return `userDocuments_${userData.id}`;
  }
  return "savedDocs";
}

function getDocuments() {
  const key = getUserDocumentsKey();
  const stored = wx.getStorageSync(key);
  if (Array.isArray(stored)) {
    return stored;
  }
  return [];
}

function setDocuments(list) {
  const key = getUserDocumentsKey();
  wx.setStorageSync(key, list);
  return list;
}

function addDocument(doc) {
  const list = getDocuments();
  list.unshift(doc);
  return setDocuments(list);
}

function removeDocument(id) {
  const list = getDocuments().filter(item => item.id !== id);
  return setDocuments(list);
}

function clearDocuments() {
  const key = getUserDocumentsKey();
  wx.removeStorageSync(key);
}

async function syncDocumentsFromServer(options = {}) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      reject(new Error("未登录"));
      return;
    }

    const apiBaseUrl = getApiBaseUrl();
    const { page = 1, limit = 100, type, keyword } = options;
    let url = `${apiBaseUrl}/api/documents?page=${page}&limit=${limit}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;

    wx.request({
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

async function createDocument(docData) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      reject(new Error("未登录"));
      return;
    }

    const apiBaseUrl = getApiBaseUrl();

    wx.request({
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

async function deleteDocument(id) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      removeDocument(id);
      resolve(true);
      return;
    }

    const apiBaseUrl = getApiBaseUrl();

    wx.request({
      url: `${apiBaseUrl}/api/documents/${id}`,
      method: "DELETE",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
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

async function getDocumentDetail(id) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken();
    if (!token) {
      reject(new Error("未登录"));
      return;
    }

    const apiBaseUrl = getApiBaseUrl();

    wx.request({
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
