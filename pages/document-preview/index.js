// 文档预览页面
const auth = require("../../utils/auth.js");

Page({
  data: {
    document: null,
    loading: true
  },
  
  onLoad(options) {
    // 立即清除loading状态，避免白屏
    this.setData({ loading: false });
    wx.hideLoading();
    
    if (!auth.requireLogin(true)) {
      return;
    }
    
    const docId = options.id;
    if (!docId) {
      wx.showToast({ title: "文档ID无效", icon: "none" });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    
    // 显示loading提示后再加载
    this.setData({ loading: true });
    this.loadDocument(docId);
  },
  
  onShow() {
    // 清除可能残留的loading遮罩
    wx.hideLoading();
  },
  
  loadDocument(docId) {
    const token = auth.getToken();
    if (!token) {
      console.error('Token不存在');
      this.setData({ loading: false });
      wx.showToast({ title: "请先登录", icon: "none" });
      setTimeout(() => {
        wx.redirectTo({ 
          url: "/pages/login/index",
          fail: () => wx.reLaunch({ url: "/pages/login/index" })
        });
      }, 1500);
      return;
    }
    
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    console.log('加载文档:', docId, '地址:', apiBaseUrl);
    
    wx.request({
      url: `${apiBaseUrl}/api/documents/${docId}`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      timeout: 10000,
      success: (res) => {
        console.log('文档加载响应:', res);
        
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          this.setData({
            document: res.data.data,
            loading: false
          });
          
          wx.setNavigationBarTitle({
            title: res.data.data.title || "文档预览"
          });
        } else {
          console.error('文档数据异常:', res.data);
          this.setData({ loading: false });
          wx.showModal({
            title: "加载失败",
            content: res.data.message || res.data.error || "文档不存在",
            showCancel: false,
            success: () => {
              wx.navigateBack();
            }
          });
        }
      },
      fail: (err) => {
        console.error("加载文档失败:", err);
        this.setData({ loading: false });
        wx.showModal({
          title: "网络异常",
          content: `无法加载文档\n\n错误: ${err.errMsg}\n\n请检查网络连接`,
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
      }
    });
  },
  
  onCopy() {
    const doc = this.data.document;
    if (!doc || !doc.content) {
      wx.showToast({ title: "内容为空", icon: "none" });
      return;
    }
    
    wx.setClipboardData({
      data: doc.content,
      success: () => {
        wx.showToast({ title: "已复制到剪贴板", icon: "success" });
      }
    });
  },
  
  onShare() {
    wx.showModal({
      title: "分享功能",
      content: "分享功能即将推出",
      showCancel: false
    });
  },
  
  onExportWord() {
    const doc = this.data.document;
    if (!doc || !doc.id) {
      wx.showToast({ title: "文档信息异常", icon: "none" });
      return;
    }
    
    console.log('开始导出Word:', doc.title);
    wx.showLoading({ title: "正在生成Word...", mask: true });
    
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    // 步骤1: 请求后端生成Word文档
    wx.request({
      url: `${apiBaseUrl}/api/document-export/generate-word`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: {
        documentId: doc.id
      },
      timeout: 15000,
      success: (res) => {
        console.log('后端响应:', res.data);
        
        if (res.data && res.data.code === "SUCCESS") {
          const downloadUrl = `${apiBaseUrl}${res.data.data.downloadUrl}`;
          console.log('准备下载:', downloadUrl);
          
          // 步骤2: 下载Word文档
          wx.downloadFile({
            url: downloadUrl,
            header: {
              "Authorization": `Bearer ${token}`
            },
            timeout: 30000,
            success: (downloadRes) => {
              wx.hideLoading();
              console.log('下载响应:', downloadRes);
              
              if (downloadRes.statusCode === 200) {
                const filePath = downloadRes.tempFilePath;
                console.log('文件路径:', filePath);
                
                // 步骤3: 保存到本地相册（可选）
                wx.saveFile({
                  tempFilePath: filePath,
                  success: (saveRes) => {
                    const savedPath = saveRes.savedFilePath;
                    console.log('文件已保存:', savedPath);
                    
                    // 步骤4: 提示用户并打开预览
                    wx.showModal({
                      title: "导出成功",
                      content: `《${doc.title}》\n\n已生成Word文档，点击"打开"可预览\n\n在预览界面点击右上角"..."可分享给好友`,
                      confirmText: "打开预览",
                      cancelText: "稍后查看",
                      success: (modalRes) => {
                        if (modalRes.confirm) {
                          // 步骤5: 打开Word文档预览
                          wx.openDocument({
                            filePath: savedPath,
                            fileType: 'doc',
                            showMenu: true,  // 显示右上角菜单（分享等）
                            success: () => {
                              console.log('✅ Word文档打开成功，用户可以在预览界面分享');
                            },
                            fail: (err) => {
                              console.error('❌ 打开Word失败:', err);
                              wx.showModal({
                                title: '提示',
                                content: '文档已保存，但打开失败\n\n请到文件管理查看',
                                showCancel: false
                              });
                            }
                          });
                        }
                      }
                    });
                  },
                  fail: (saveErr) => {
                    console.error('保存文件失败:', saveErr);
                    // 即使保存失败，也尝试打开临时文件
                    wx.openDocument({
                      filePath: filePath,
                      fileType: 'doc',
                      showMenu: true,
                      success: () => {
                        console.log('使用临时文件打开成功');
                      },
                      fail: (openErr) => {
                        console.error('打开失败:', openErr);
                        wx.showModal({
                          title: '导出失败',
                          content: '无法打开文档，请稍后重试',
                          showCancel: false
                        });
                      }
                    });
                  }
                });
              } else {
                wx.hideLoading();
                console.error('下载失败，状态码:', downloadRes.statusCode);
                wx.showModal({
                  title: '下载失败',
                  content: `服务器返回状态: ${downloadRes.statusCode}\n\n请稍后重试`,
                  showCancel: false
                });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              console.error('下载Word失败:', err);
              wx.showModal({
                title: '下载失败',
                content: `网络异常或文件生成失败\n\n错误: ${err.errMsg}\n\n请检查网络后重试`,
                showCancel: false
              });
            }
          });
        } else {
          wx.hideLoading();
          console.error('后端生成失败:', res.data);
          wx.showModal({
            title: '生成失败',
            content: res.data.message || res.data.error || '后端生成Word失败',
            showCancel: false
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('请求导出失败:', err);
        wx.showModal({
          title: '网络异常',
          content: `无法连接服务器\n\n错误: ${err.errMsg}\n\n请检查网络连接`,
          showCancel: false
        });
      }
    });
  },
  
  onGoBack() {
    wx.navigateBack();
  }
});

