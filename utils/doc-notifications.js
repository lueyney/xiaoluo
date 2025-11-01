/**
 * 文档通知管理工具
 * 用于管理新文档的红点提示
 */

const STORAGE_KEY_NEW_DOCS = 'newDocuments';
const STORAGE_KEY_LAST_VIEW = 'lastViewLibraryTime';

/**
 * 添加新文档通知
 * @param {number|string} docId - 文档ID
 */
function addNewDocument(docId) {
  try {
    const newDocs = getNewDocuments();
    if (!newDocs.includes(docId)) {
      newDocs.push(docId);
      wx.setStorageSync(STORAGE_KEY_NEW_DOCS, newDocs);
      updateTabBarBadge();
      console.log(`[文档通知] 添加新文档: ${docId}, 当前新文档数: ${newDocs.length}`);
    }
  } catch (e) {
    console.error('[文档通知] 添加新文档失败:', e);
  }
}

/**
 * 批量添加新文档通知
 * @param {Array} docIds - 文档ID数组
 */
function addNewDocuments(docIds) {
  if (!Array.isArray(docIds) || docIds.length === 0) {
    console.log('[文档通知] 批量添加：无文档ID');
    return;
  }
  
  try {
    const newDocs = getNewDocuments();
    const updated = [...newDocs];
    
    docIds.forEach(id => {
      if (!updated.includes(id)) {
        updated.push(id);
      }
    });
    
    if (updated.length > newDocs.length) {
      wx.setStorageSync(STORAGE_KEY_NEW_DOCS, updated);
      console.log(`[文档通知] 批量添加 ${updated.length - newDocs.length} 个新文档，总数: ${updated.length}`);
      console.log(`[文档通知] 新文档ID列表:`, updated);
      updateTabBarBadge();
    } else {
      console.log('[文档通知] 批量添加：所有文档已存在');
    }
  } catch (e) {
    console.error('[文档通知] 批量添加新文档失败:', e);
  }
}

/**
 * 获取新文档列表
 * @returns {Array} 新文档ID数组
 */
function getNewDocuments() {
  try {
    const newDocs = wx.getStorageSync(STORAGE_KEY_NEW_DOCS);
    return Array.isArray(newDocs) ? newDocs : [];
  } catch (e) {
    console.error('[文档通知] 获取新文档列表失败:', e);
    return [];
  }
}

/**
 * 检查是否有新文档
 * @returns {boolean}
 */
function hasNewDocuments() {
  return getNewDocuments().length > 0;
}

/**
 * 获取新文档数量
 * @returns {number}
 */
function getNewDocumentCount() {
  return getNewDocuments().length;
}

/**
 * 标记文档为已读
 * @param {number|string} docId - 文档ID
 */
function markDocumentAsRead(docId) {
  try {
    const newDocs = getNewDocuments();
    const filtered = newDocs.filter(id => id !== docId);
    
    if (filtered.length < newDocs.length) {
      wx.setStorageSync(STORAGE_KEY_NEW_DOCS, filtered);
      updateTabBarBadge();
      console.log(`[文档通知] 标记文档已读: ${docId}, 剩余新文档: ${filtered.length}`);
    }
  } catch (e) {
    console.error('[文档通知] 标记文档已读失败:', e);
  }
}

/**
 * 清除所有新文档标记
 */
function clearAllNewDocuments() {
  try {
    const beforeCount = getNewDocumentCount();
    wx.setStorageSync(STORAGE_KEY_NEW_DOCS, []);
    console.log(`[文档通知] 清除所有新文档标记 (之前: ${beforeCount}个)`);
    
    // 移除TabBar红点
    wx.removeTabBarBadge({
      index: 1,
      success: () => {
        console.log('[文档通知] ✅ TabBar红点已移除');
      },
      fail: (err) => {
        console.warn('[文档通知] ⚠️ TabBar红点移除失败:', err);
      }
    });
  } catch (e) {
    console.error('[文档通知] 清除所有新文档标记失败:', e);
  }
}

/**
 * 更新TabBar红点
 */
function updateTabBarBadge() {
  const count = getNewDocumentCount();
  
  console.log(`[TabBar红点] 更新红点，当前数量: ${count}`);
  
  if (count > 0) {
    const text = count > 99 ? '99+' : String(count);
    wx.setTabBarBadge({
      index: 1, // 文档库是第2个tab（index=1）
      text: text,
      success: () => {
        console.log(`[TabBar红点] ✅ 设置成功: ${text}`);
      },
      fail: (err) => {
        console.error(`[TabBar红点] ❌ 设置失败:`, err);
      }
    });
  } else {
    wx.removeTabBarBadge({
      index: 1,
      success: () => {
        console.log('[TabBar红点] ✅ 移除成功');
      },
      fail: (err) => {
        console.warn('[TabBar红点] ⚠️ 移除失败（可能本来就没有）:', err);
      }
    });
  }
}

/**
 * 记录最后查看文档库的时间
 */
function updateLastViewTime() {
  try {
    const now = new Date().getTime();
    wx.setStorageSync(STORAGE_KEY_LAST_VIEW, now);
    console.log('[文档通知] 更新最后查看时间:', new Date(now).toLocaleString());
  } catch (e) {
    console.error('[文档通知] 更新最后查看时间失败:', e);
  }
}

/**
 * 获取最后查看文档库的时间
 * @returns {number} 时间戳
 */
function getLastViewTime() {
  try {
    return wx.getStorageSync(STORAGE_KEY_LAST_VIEW) || 0;
  } catch (e) {
    console.error('[文档通知] 获取最后查看时间失败:', e);
    return 0;
  }
}

/**
 * 初始化（确保红点状态正确）
 */
function init() {
  updateTabBarBadge();
}

module.exports = {
  addNewDocument,
  addNewDocuments,
  getNewDocuments,
  hasNewDocuments,
  getNewDocumentCount,
  markDocumentAsRead,
  clearAllNewDocuments,
  updateTabBarBadge,
  updateLastViewTime,
  getLastViewTime,
  init
};

