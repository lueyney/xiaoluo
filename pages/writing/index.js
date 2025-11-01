const points = require("../../utils/points.js");
const notifications = require("../../utils/notifications.js");
const docNotifications = require("../../utils/doc-notifications.js");
const auth = require("../../utils/auth.js");

Page({
  data: {
    formData: {
      field: "",
      topic: "",
      contentTypes: []
    },
    generatedTitles: [],
    showFieldSelector: false,
    fieldSearchText: "",
    filteredFields: [],
    shouldFocusSearch: false,
    hasSearchText: false,
    showCustomOption: false,
    showPhoneLoginModal: false,
    fields: [
      "请选择学科领域",
      "哲学",
      "理论经济学",
      "应用经济学",
      "法学",
      "政治学",
      "社会学",
      "民族学",
      "马克思主义理论",
      "教育学",
      "心理学",
      "体育学",
      "文学",
      "中国语言文学",
      "外国语言文学",
      "新闻传播学",
      "化学",
      "天文学",
      "地理学",
      "生态学",
      "统计学",
      "力学",
      "机械工程",
      "材料科学与工程",
      "电气工程",
      "电子科学与技术",
      "信息与通信工程",
      "控制科学与工程",
      "计算机科学与技术",
      "化学工程与技术",
      "纺织科学与工程",
      "轻工技术与工程",
      "交通运输工程",
      "兵器科学与技术",
      "农业工程",
      "林业工程",
      "环境科学与工程",
      "生物医学工程",
      "食品科学与工程",
      "城乡规划学",
      "风景园林学",
      "软件工程",
      "农学",
      "林学",
      "医学",
      "药学",
      "护理学",
      "工商管理",
      "农林经济管理",
      "公共管理",
      "图书情报与档案管理",
      "设计学",
      "其他"
    ],
    fieldIndex: 0,
    contentTypes: [
      { icon: "📝", label: "学术论文", value: "学术论文", description: "完整的学术研究论文", credits: 75, selected: false },
      { icon: "📄", label: "开题报告", value: "开题报告", description: "研究计划和方法说明", credits: 25, selected: false },
      { icon: "🛠️", label: "任务书", value: "任务书", description: "项目任务安排文档", credits: 20, selected: false },
      { icon: "📚", label: "文献综述", value: "文献综述", description: "多篇文献综述整合", credits: 35, selected: false },
      { icon: "🎤", label: "答辩稿", value: "答辩稿", description: "答辩演讲稿撰写", credits: 5, selected: false },
      { icon: "📎", label: "中期检查表", value: "中期检查表", description: "研究进度检查记录", credits: 10, selected: false },
      { icon: "📊", label: "答辩PPT", value: "答辩PPT", description: "答辩演示文稿", credits: 25, selected: false }
    ],
    requirements: "",
    titleSettingsOpen: true,
    detailSettingsOpen: false,
    titleLevel1Options: [
      "请选择一级标题格式",
      "一、罗马数字 (I、II、III)",
      "一、中文数字 (一、二、三)",
      "1. 阿拉伯数字 (1、2、3)",
      "章节标题 (第一章、第二章)",
      "无编号自定义"
    ],
    titleLevel2Options: [
      "请选择二级标题格式",
      "(一) 中文序号",
      "(1) 阿拉伯数字",
      "1.1 章节编号",
      "A. 字母序列",
      "无编号自定义"
    ],
    titleLevel1Index: 0,
    titleLevel2Index: 0,
    selectedSummary: "请选择生成类型",
    totalCost: 0,
    isBalanceNotEnough: false,
    generateState: "pending",
    generateDisabled: true,
    generateButtonText: "开始AI生成",
    generateBtnClass: "generate-btn generate-btn-disabled",
    credits: 0
  },
  onShow() {
    wx.setNavigationBarTitle({ title: "AI智能创作" });
    
    // 清除任何可能残留的loading遮罩
    wx.hideLoading();
    
    this.refreshCredits();
    this.updateSummary();
    this.checkLastGenerationStatus();
    
    // 恢复生成状态（从缓存）
    const generationState = wx.getStorageSync('currentGenerationState');
    if (generationState && generationState.isGenerating) {
      const now = Date.now();
      // 如果生成任务在5分钟内，恢复状态
      if (now - generationState.startTime < 5 * 60 * 1000) {
        this.setData({
          isGenerating: true,
          lastGenerateTopic: generationState.topic,
          lastGenerateCount: generationState.count,
          generatedContent: `论文《${generationState.topic}》正在生成中...\n\n✨ AI正在创作中，您可以切换查看其他内容\n\n生成完成后将自动显示`
        });
        
        // 继续轮询检查（不显示loading）
        if (generationState.orderId) {
          this.checkGenerationStatus(generationState.orderId, 0);
        }
      } else {
        // 超时则清除状态
        wx.removeStorageSync('currentGenerationState');
      }
    }
  },
  refreshCredits() {
    const balance = points.getCredits();
    this.setData({ credits: balance });
  },
  goToLibrary() {
    if (!auth.requireLogin(true)) {
      return;
    }
    wx.switchTab({ url: "/pages/library/index" });
  },
  openFieldSelector() {
    const allFields = this.data.fields.filter(f => f !== "请选择学科领域");
    // 优化：一次性设置所有数据，避免多次渲染
    this.setData({ 
      showFieldSelector: true,
      filteredFields: allFields,
      fieldSearchText: "",
      shouldFocusSearch: false,
      hasSearchText: false,
      showCustomOption: false
    });
  },
  
  closeFieldSelector() {
    this.setData({ 
      showFieldSelector: false,
      fieldSearchText: "",
      shouldFocusSearch: false,
      hasSearchText: false,
      showCustomOption: false
    });
  },
  
  onFieldSearch(e) {
    const searchText = e.detail.value;
    const allFields = this.data.fields.filter(f => f !== "请选择学科领域");
    
    const trimmedText = searchText.trim();
    const hasText = trimmedText.length > 0;
    
    if (!hasText) {
      this.setData({ 
        fieldSearchText: searchText,
        filteredFields: allFields,
        hasSearchText: false,
        showCustomOption: false
      });
      return;
    }
    
    const filtered = allFields.filter(field => field.includes(searchText));
    const showCustom = hasText && filtered.length === 0;
    
    this.setData({ 
      fieldSearchText: searchText,
      filteredFields: filtered,
      hasSearchText: hasText,
      showCustomOption: showCustom
    });
  },
  
  selectField(e) {
    const field = e.currentTarget.dataset.field;
    
    this.setData({ 
      "formData.field": field,
      showFieldSelector: false,
      fieldSearchText: "",
      shouldFocusSearch: false,
      generatedTitles: []
    });
    
    this.updateSummary();
    
    wx.showToast({ 
      title: "已选择：" + field, 
      icon: "success",
      duration: 1500
    });
  },
  
  useCustomField() {
    const customField = this.data.fieldSearchText.trim();
    if (!customField) {
      wx.showToast({ title: "请输入学科名称", icon: "none", duration: 2000 });
      return;
    }
    
    this.setData({ 
      "formData.field": customField,
      showFieldSelector: false,
      fieldSearchText: "",
      shouldFocusSearch: false,
      generatedTitles: []
    });
    
    this.updateSummary();
    
    wx.showToast({ 
      title: "已选择：" + customField, 
      icon: "success",
      duration: 1500
    });
  },
  onTopicInput(e) {
    this.setData({ "formData.topic": e.detail.value });
    this.updateSummary();
  },
  onRequirementsInput(e) {
    this.setData({ requirements: e.detail.value });
  },
  onGenerateTitle() {
    // 检查登录状态
    if (!auth.requireLogin(true)) {
      return;
    }
    
    if (!this.data.formData.field) {
      wx.showToast({ title: "请先选择学科领域", icon: "none" });
      return;
    }
    if (this.data.isGeneratingTitle) return;
    
    this.setData({ isGeneratingTitle: true });
    
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || app.globalData.apiBaseUrl || "http://127.0.0.1:3000";
    const token = auth.getToken();
    
    wx.request({
      url: `${apiBaseUrl}/api/title-generator/generate`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: { 
        field: this.data.formData.field,
        excludeTitles: this.data.generatedTitles
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.code === 'SUCCESS') {
          const title = res.data.data.title;
          
          const newTitles = [...this.data.generatedTitles];
          if (!newTitles.includes(title)) {
            newTitles.push(title);
            if (newTitles.length > 10) {
              newTitles.shift();
            }
          }
          
          this.setData({ 
            "formData.topic": title,
            generatedTitles: newTitles,
            isGeneratingTitle: false 
          });
      this.updateSummary();
          wx.showToast({ title: "AI生成完成", icon: "success" });
        } else {
          this.setData({ isGeneratingTitle: false });
          wx.showToast({ title: "生成失败，请重试", icon: "none", duration: 2000 });
        }
      },
      fail: (err) => {
        this.setData({ isGeneratingTitle: false });
        wx.showToast({ title: "网络错误，请重试", icon: "none", duration: 2000 });
      }
    });
  },
  toggleContentType(e) {
    const value = e.currentTarget.dataset.value;
    const types = this.data.contentTypes.map(item => item.value === value ? Object.assign({}, item, { selected: !item.selected }) : item);
    const selected = types.filter(item => item.selected).map(item => item.value);
    this.setData({ contentTypes: types, "formData.contentTypes": selected });
    this.updateSummary();
  },
  toggleTitleSettings() {
    this.setData({ titleSettingsOpen: !this.data.titleSettingsOpen });
  },
  toggleDetailSettings() {
    this.setData({ detailSettingsOpen: !this.data.detailSettingsOpen });
  },
  onSelectTitleLevel1(e) {
    this.setData({ titleLevel1Index: Number(e.detail.value) });
  },
  onSelectTitleLevel2(e) {
    this.setData({ titleLevel2Index: Number(e.detail.value) });
  },
  updateSummary() {
    const selected = this.data.contentTypes.filter(item => item.selected);
    const totalCost = selected.reduce((sum, item) => sum + item.credits, 0);
    const credits = points.getCredits();
    const isBalanceNotEnough = totalCost > credits;
    const selectedSummary = selected.length ? "已选择：" + selected.map(item => item.label).join("、") : "请选择生成类型";
    const ready = this.data.formData.field && this.data.formData.topic && selected.length && !isBalanceNotEnough;
    const generateState = this.data.isGenerating ? "loading" : (ready ? "active" : "pending");
    const generateDisabled = !ready;
    const generateButtonText = this.data.isGenerating
      ? "AI正在生成内容..."
      : isBalanceNotEnough
      ? "余额不足，需要 " + totalCost + " 积分"
      : "开始AI生成";
    this.setData({
      selectedSummary,
      totalCost,
      isBalanceNotEnough,
      generateState,
      generateDisabled,
      generateButtonText,
      generateBtnClass: this.computeBtnClass(generateDisabled, isBalanceNotEnough),
      credits
    });
  },
  computeBtnClass(disabled, notEnough) {
    if (notEnough || disabled) {
      return "generate-btn generate-btn-disabled";
    }
    return "generate-btn generate-btn-active";
  },
  onGenerate() {
    if (!auth.requireLogin(true)) {
      return;
    }
    if (this.data.isGenerating || this.data.generateDisabled) {
      return;
    }
    const { field, topic, contentTypes } = this.data.formData;
    if (!field) {
      wx.showToast({ title: "请选择学科领域", icon: "none" });
      return;
    }
    if (!topic.trim()) {
      wx.showToast({ title: "请输入题目", icon: "none" });
      return;
    }
    if (!contentTypes.length) {
      wx.showToast({ title: "请选择生成类型", icon: "none" });
      return;
    }
    if (this.data.isBalanceNotEnough) {
      wx.showModal({
        title: "积分不足",
        content: `当前积分：${this.data.credits}\n所需积分：${this.data.totalCost}\n\n请先充值后再生成论文`,
        showCancel: true,
        cancelText: "取消",
        confirmText: "去充值",
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ 
              url: "/pages/recharge/index",
              fail: () => {
                wx.switchTab({ url: "/pages/profile/index" });
              }
            });
          }
        }
      });
      return;
    }
    this.setData({ isGenerating: true });
    this.updateSummary();
    
    // 不使用 wx.showLoading，避免遮罩问题
    // 用户可以通过页面状态看到"正在生成中"
    
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    const token = auth.getToken();
    const selectedTypes = this.data.contentTypes.filter(item => item.selected);
    const expectedCredits = selectedTypes.reduce((sum, item) => sum + item.credits, 0);
    
    // 添加调试日志
    console.log('🔍 生成请求参数:', {
      topic: topic,
      field: field || "教育学",
      contentTypes: contentTypes,
      expectedCredits: expectedCredits
    });
    
    wx.request({
      url: `${apiBaseUrl}/api/coze/generate`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: {
        topic: topic,
        field: field || "教育学",
        contentTypes: contentTypes,
        expectedCredits: expectedCredits
      },
      success: (res) => {
        if (res.data && res.data.code === "PROCESSING") {
          const docCount = contentTypes.length;
          const estimatedMinutes = Math.ceil(docCount * 0.5);
          const timeText = estimatedMinutes < 2 ? "1-2分钟" : `${estimatedMinutes}分钟左右`;
          
          // 不使用 wx.showLoading，避免遮罩问题
          // 状态文本已经显示"正在生成中"
          
          // 保持isGenerating为true，直到生成完成
          this.setData({
            generatedContent: `论文《${topic}》正在生成中...\n\n✨ AI正在为您创作 ${docCount} 种文档\n⏱️ 预计 ${timeText}\n\n生成完成后，【文档库】将显示红点提示\n\n消耗积分：${this.data.totalCost}`,
            lastGenerateTime: new Date().getTime(),
            lastGenerateTopic: topic,
            lastGenerateCount: docCount
          });
          
          // 保存生成状态到缓存
          wx.setStorageSync('currentGenerationState', {
            isGenerating: true,
            orderId: res.data.data.orderId,
            topic: topic,
            count: docCount,
            startTime: Date.now()
          });
          
          this.checkGenerationStatus(res.data.data.orderId, 0);
        } else if (res.data && res.data.code === "INSUFFICIENT_CREDITS") {
          // 积分不足
          wx.showModal({
            title: "积分不足",
            content: `所需积分：${res.data.data.required}\n当前积分：${res.data.data.available}\n\n请先充值后再生成论文`,
            showCancel: true,
            cancelText: "取消",
            confirmText: "去充值",
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.navigateTo({ 
                  url: "/pages/recharge/index",
                  fail: () => {
                    wx.switchTab({ url: "/pages/profile/index" });
                  }
                });
              }
            }
          });
          this.setData({ isGenerating: false });
        } else {
          wx.showModal({ 
            title: "生成失败",
            content: res.data.message || res.data.error || "提交失败，请重试",
            showCancel: false
          });
          this.setData({ isGenerating: false });
        }
      },
      fail: (err) => {
        wx.showToast({ 
          title: "网络异常，请稍后重试", 
          icon: "none" 
        });
        this.setData({ isGenerating: false });
        this.updateSummary();
      }
    });
  },
  
  checkGenerationStatus(orderId, attempts) {
    if (!auth.requireLogin(true)) {
      return;
    }
    const MAX_ATTEMPTS = 30;
    
    let checkDelay;
    if (attempts === 0) {
      checkDelay = 35000;
    } else if (attempts <= 8) {
      checkDelay = 6000;
    } else {
      checkDelay = 20000;
    }
    
    if (attempts >= MAX_ATTEMPTS) {
      this.setData({ 
        isGenerating: false,
        generatedContent: `文档生成中...\n\n请稍后前往【文档库】或【订单】查看`
      });
      
      // 清除生成状态缓存
      wx.removeStorageSync('currentGenerationState');
      
      return;
    }
    
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    const token = auth.getToken();
    
    setTimeout(() => {
      wx.request({
        url: `${apiBaseUrl}/api/orders/${orderId}`,
        method: "GET",
        header: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        timeout: 30000,
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            let order = null;
            if (res.data.data) {
              order = res.data.data;
            } else if (res.data.status) {
              order = res.data;
            } else {
              this.checkGenerationStatus(orderId, attempts + 1);
              return;
            }
            
            if (order.status === 'completed') {
              this.setData({ isGenerating: false });
              
              // 清除生成状态缓存
              wx.removeStorageSync('currentGenerationState');
              
              points.syncCreditsFromServer();
              
              const docCount = this.data.lastGenerateCount || 1;
              const docTypeText = docCount > 1 ? `${docCount}个文档` : '文档';
              
              this.setData({
                generatedContent: `✅ ${docTypeText}已生成！\n\n《${this.data.lastGenerateTopic}》\n\n📁 已保存到文档库`,
                generateState: 'completed'
              });
              
              wx.setStorageSync('lastGenerationStatus', {
                orderId: orderId,
                status: 'completed',
                topic: this.data.lastGenerateTopic,
                count: docCount,
                time: new Date().getTime()
              });
              
              wx.setStorageSync('hasNewDocuments', true);
              wx.setStorageSync('newDocumentsCount', docCount);
              
              // 设置TabBar红点
              wx.setTabBarBadge({
                index: 1,
                text: docCount > 9 ? '9+' : String(docCount)
              });
              
              // 显示成功提示（使用modal避免被遮挡）
              wx.showModal({
                title: '生成成功',
                content: `${docCount > 1 ? `${docCount}个文档` : '文档'}已生成完成\n\n已保存到【文档库】，可前往查看`,
                showCancel: false,
                confirmText: '知道了'
              });
              
              return;
              
            } else if (order.status === 'failed' || order.status === 'partial') {
              this.setData({ isGenerating: false });
              
              // 清除生成状态缓存
              wx.removeStorageSync('currentGenerationState');
              
              // 检查是否部分成功
              const isPartial = order.status === 'partial';
              const successCount = order.success_count || 0;
              const failCount = order.fail_count || 0;
              
              if (isPartial && successCount > 0) {
                wx.showModal({
                  title: "部分生成成功",
                  content: `成功：${successCount}个文档\n失败：${failCount}个文档\n\n失败部分的积分已退还\n\n请前往【文档库】查看已生成的文档`,
                  showCancel: false,
                  confirmText: "知道了"
                });
                
                this.setData({
                  generatedContent: `⚠️ 部分生成成功\n\n成功：${successCount}个\n失败：${failCount}个\n\n📁 请查看文档库`,
                  generateState: 'partial'
                });
                
                // 设置文档库红点
                if (successCount > 0) {
                  wx.setTabBarBadge({
                    index: 1,
                    text: String(successCount)
                  });
                  wx.setStorageSync('hasNewDocuments', true);
                  wx.setStorageSync('newDocumentsCount', successCount);
                }
              } else {
                wx.showModal({
                  title: "生成失败",
                  content: `${order.failure_reason || '文档生成失败'}\n\n积分已退还，请重试`,
                  showCancel: false,
                  confirmText: "知道了"
                });
                
                this.setData({
                  generatedContent: `❌ 生成失败\n\n${order.failure_reason || '未知错误'}\n\n请重试或联系客服`,
                  generateState: 'failed'
                });
              }
              
              // 刷新积分
              points.syncCreditsFromServer();
              
              return;
              
            } else {
              this.checkGenerationStatus(orderId, attempts + 1);
            }
          } else {
            this.checkGenerationStatus(orderId, attempts + 1);
          }
        },
        fail: (err) => {
          if (attempts >= 3) {
            this.setData({
              isGenerating: false,
              generatedContent: `✅ 文档正在后台生成\n\n《${this.data.lastGenerateTopic}》\n\n生成完成后请前往【文档库】查看`,
              generateState: 'processing'
            });
          } else {
            this.checkGenerationStatus(orderId, attempts + 1);
          }
        }
      });
    }, checkDelay);
  },
  
  onHide() {
    wx.hideLoading();
  },
  
  checkLastGenerationStatus() {
    try {
      const lastStatus = wx.getStorageSync('lastGenerationStatus');
      if (lastStatus && lastStatus.status === 'completed') {
        const now = new Date().getTime();
        if (now - lastStatus.time < 5 * 60 * 1000) {
          this.setData({
            generatedContent: `✅ 文档生成完成！\n\n《${lastStatus.topic}》已保存\n\n📁 前往【文档库】查看（红点提示）`,
            generateState: 'completed',
            lastGenerateTopic: lastStatus.topic
          });
        }
      }
    } catch (e) {
      console.error('检查生成状态失败:', e);
    }
  },
  
  // 显示一键登录弹窗
  showPhoneLoginModal() {
    this.setData({ showPhoneLoginModal: true });
  },
  
  // 关闭一键登录弹窗
  onPhoneLoginClose() {
    this.setData({ showPhoneLoginModal: false });
  },
  
  // 一键登录成功
  onPhoneLoginSuccess(e) {
    console.log('[首页] 一键登录成功', e.detail);
    this.refreshCredits();
    this.updateSummary();
  }
  
});
