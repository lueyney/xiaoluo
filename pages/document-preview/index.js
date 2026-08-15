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
          
          // 步骤2: 定义带.docx后缀的文件路径（关键！确保手机能识别文件类型）
          // 注意：后端现在使用 docx 库生成真正的 .docx 二进制文件，iOS/Android/PC 全平台支持
          // 使用 wx.env.USER_DATA_PATH 获取小程序专用临时目录
          // 清理文件名中的非法字符，确保文件名合法
          const safeTitle = doc.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50); // 限制长度避免路径过长
          const fileName = `${safeTitle}_${new Date().getTime()}.docx`; // 使用.docx后缀，与后端生成的文件格式一致
          const localPath = `${wx.env.USER_DATA_PATH}/${fileName}`;
          console.log('指定文件路径:', localPath);
          
          // 步骤3: 下载Word文档到指定路径
          wx.downloadFile({
            url: downloadUrl,
            filePath: localPath, // 👇 关键点1：指定带.docx后缀的文件路径，确保手机系统能识别文件类型
            header: {
              "Authorization": `Bearer ${token}`
            },
            timeout: 30000,
            success: (downloadRes) => {
              console.log('下载响应:', downloadRes);
              
              if (downloadRes.statusCode === 200) {
                // 使用下载后的文件路径（如果指定了filePath，tempFilePath就是localPath）
                const filePath = downloadRes.tempFilePath || localPath;
                console.log('文件路径:', filePath);
                
                // 验证文件格式：检查文件头是否为有效的 ZIP 格式（docx 本质上是 ZIP）
                wx.getFileInfo({
                  filePath: filePath,
                  success: (fileInfo) => {
                    console.log('文件信息:', fileInfo);
                    
                    // 验证文件大小（docx 文件至少应该有几千字节）
                    if (fileInfo.size < 1000) {
                      wx.hideLoading();
                      console.error('文件大小异常:', fileInfo.size);
                      wx.showModal({
                        title: '文件异常',
                        content: `下载的文件大小异常（${fileInfo.size} 字节），可能下载失败\n\n请重试导出`,
                        showCancel: false
                      });
                      return;
                    }
                    
                    // 读取文件头验证格式（docx 文件头应该是 ZIP 格式：PK..）
                    wx.readFile({
                      filePath: filePath,
                      length: 4, // 只读取前 4 个字节
                      position: 0,
                      success: (readRes) => {
                        const fileHeader = readRes.data;
                        // ZIP 文件头: 50 4B 03 04 (PK..)
                        const isValidDocx = fileHeader.length >= 4 && 
                          fileHeader[0] === 0x50 && 
                          fileHeader[1] === 0x4B && 
                          fileHeader[2] === 0x03 && 
                          fileHeader[3] === 0x04;
                        
                        if (!isValidDocx) {
                          wx.hideLoading();
                          console.error('文件格式验证失败，文件头:', Array.from(fileHeader).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                          wx.showModal({
                            title: '文件格式异常',
                            content: `下载的文件不是有效的 Word 文档格式\n\n可能原因：\n1. 网络传输错误\n2. 服务器生成失败\n\n请重试导出`,
                            showCancel: false
                          });
                          return;
                        }
                        
                        console.log('✅ 文件格式验证通过，文件头: PK..');
                        wx.hideLoading();
                        
                        // 步骤4: 提示用户并打开预览
                        wx.showModal({
                          title: "导出成功",
                          content: `《${doc.title}》\n\n已生成Word文档，点击"打开"可预览\n\n在预览界面点击右上角"..."可分享给好友`,
                          confirmText: "打开预览",
                          cancelText: "稍后查看",
                          success: (modalRes) => {
                            if (modalRes.confirm) {
                              // 步骤5: 打开Word文档预览
                              // 关键修复：确保 fileType 明确指定为 'docx'，iOS 需要这个参数
                              wx.openDocument({
                                filePath: filePath, // 使用验证后的文件路径
                                fileType: 'docx',   // 显式指定文件类型为 docx（iOS 必需）
                                showMenu: true,      // 显示右上角菜单（分享等）
                                success: () => {
                                  console.log('✅ Word文档打开成功，用户可以在预览界面分享');
                                },
                                fail: (err) => {
                                  console.error('❌ 打开Word失败:', err);
                                  // 提供更详细的错误信息
                                  let errorMsg = err.errMsg || '未知错误';
                                  if (errorMsg.includes('912') || errorMsg.includes('OfficeImportErrorDomain')) {
                                    errorMsg = 'iOS 系统无法识别文件格式（错误 912）\n\n可能原因：\n1. 文件格式不标准\n2. iOS 系统版本过低\n\n建议：\n1. 尝试使用其他应用打开\n2. 更新 iOS 系统';
                                  }
                                  wx.showModal({
                                    title: '打开失败',
                                    content: `文档已下载，但打开失败\n\n错误: ${errorMsg}\n\n提示：可以尝试使用其他支持 .docx 格式的应用打开`,
                                    showCancel: false
                                  });
                                }
                              });
                            }
                          }
                        });
                      },
                      fail: (readErr) => {
                        wx.hideLoading();
                        console.error('读取文件头失败:', readErr);
                        // 如果读取失败，仍然尝试打开（可能是权限问题）
                        wx.showModal({
                          title: "导出成功",
                          content: `《${doc.title}》\n\n已生成Word文档，点击"打开"可预览`,
                          confirmText: "打开预览",
                          cancelText: "稍后查看",
                          success: (modalRes) => {
                            if (modalRes.confirm) {
                              wx.openDocument({
                                filePath: filePath,
                                fileType: 'docx',
                                showMenu: true,
                                success: () => {
                                  console.log('✅ Word文档打开成功');
                                },
                                fail: (err) => {
                                  console.error('❌ 打开Word失败:', err);
                                  wx.showModal({
                                    title: '打开失败',
                                    content: `错误: ${err.errMsg || '未知错误'}\n\n请重试或使用其他应用打开`,
                                    showCancel: false
                                  });
                                }
                              });
                            }
                          }
                        });
                      }
                    });
                  },
                  fail: (fileInfoErr) => {
                    wx.hideLoading();
                    console.error('获取文件信息失败:', fileInfoErr);
                    // 如果获取文件信息失败，仍然尝试打开
                    wx.showModal({
                      title: "导出成功",
                      content: `《${doc.title}》\n\n已生成Word文档，点击"打开"可预览`,
                      confirmText: "打开预览",
                      cancelText: "稍后查看",
                      success: (modalRes) => {
                        if (modalRes.confirm) {
                          wx.openDocument({
                            filePath: filePath,
                            fileType: 'docx',
                            showMenu: true,
                            success: () => {
                              console.log('✅ Word文档打开成功');
                            },
                            fail: (err) => {
                              console.error('❌ 打开Word失败:', err);
                              wx.showModal({
                                title: '打开失败',
                                content: `错误: ${err.errMsg || '未知错误'}`,
                                showCancel: false
                              });
                            }
                          });
                        }
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

