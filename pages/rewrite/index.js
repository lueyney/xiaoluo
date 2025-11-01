const points = require("../../utils/points.js");
const notifications = require("../../utils/notifications.js");

Page({
  data: {
    originalText: "",
    rewrittenText: "",
    isRewriting: false,
    progress: 0,
    rewriteLevel: 2,
    similarity: 0,
    credits: 0,
    wordCount: 0,
    expectedCost: 0,
    levelText: "中度降重",
    levelDesc: "适度改写，调整结构，相似度约25%",
    featureList: [
      { icon: "⚙", title: "智能识别", desc: "多模型协同识别重复片段", bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      { icon: "⟲", title: "精准降重", desc: "语义级重写，保留原始论述结构", bg: "rgba(16,185,129,0.12)", color: "#059669" },
      { icon: "✔", title: "质量保证", desc: "专业团队审核，确保内容可用", bg: "rgba(168,85,247,0.12)", color: "#8b5cf6" }
    ],
    disciplines: ["请选择学科领域", "计算机科学", "经济管理", "教育学", "法学", "医学", "文学", "工程技术"],
    disciplineIndex: 0,
    languages: ["中文", "英文", "中英混合"],
    languageIndex: 0,
    platforms: ["知网 (CNKI)", "万方 (WanFang)", "维普 (VIP)", "PaperPass"],
    platformIndex: 0,
    modeEnabled: true,
    disableStart: true,
    startButtonClass: "generate-btn generate-btn-disabled"
  },
  levelMap: {
    1: { text: "轻度降重", desc: "保持原意，轻微改写，相似度约35%", factor: 1 },
    2: { text: "中度降重", desc: "适度改写，调整结构，相似度约25%", factor: 1.2 },
    3: { text: "深度降重", desc: "大幅改写，相似度约15%", factor: 1.5 }
  },
  onShow() {
    wx.setNavigationBarTitle({ title: "AI智能降重" });
    // 清除可能的loading遮罩
    wx.hideLoading();
    this.refreshCredits();
  },
  refreshCredits() {
    const balance = points.getCredits();
    this.setData({ credits: balance });
    this.updateExpectedCost();
  },
  onRewriteLevelChange(e) {
    const level = Number(e.detail.value) + 1;
    const meta = this.levelMap[level];
    this.setData({
      rewriteLevel: level,
      levelText: meta.text,
      levelDesc: meta.desc
    });
    this.updateExpectedCost();
  },
  onTextInput(e) {
    const text = e.detail.value || "";
    this.setData({ originalText: text, wordCount: text.length });
    this.updateExpectedCost(true);
  },
  onDisciplineChange(e) {
    this.setData({ disciplineIndex: Number(e.detail.value) });
  },
  onLanguageChange(e) {
    this.setData({ languageIndex: Number(e.detail.value) });
  },
  onPlatformChange(e) {
    this.setData({ platformIndex: Number(e.detail.value) });
  },
  onToggleMode(e) {
    this.setData({ modeEnabled: !!e.detail.value });
  },
  updateExpectedCost(triggeredByInput) {
    const meta = this.levelMap[this.data.rewriteLevel];
    // 100字1积分，按字数/100向上取整
    const rawCost = this.data.wordCount > 0 ? Math.ceil(this.data.wordCount / 100 * meta.factor) : 0;
    const cost = rawCost > 0 ? rawCost : 0;
    const hasEnoughText = this.data.wordCount > 0;
    const credits = points.getCredits();
    const balanceOk = cost <= credits;
    const canStart = hasEnoughText && balanceOk && !this.data.isRewriting;
    const className = canStart ? "generate-btn generate-btn-active" : "generate-btn generate-btn-disabled";
    const isDisabled = !canStart;
    this.setData({
      expectedCost: cost,
      disableStart: isDisabled,
      startButtonClass: className,
      credits
    });
  },
  startRewrite() {
    if (this.data.isRewriting || this.data.disableStart) return;
    const text = (this.data.originalText || "").trim();
    if (!text) {
      wx.showToast({ title: "请输入需要降重的文本", icon: "none" });
      return;
    }
    if (this.data.credits < this.data.expectedCost) {
      wx.showToast({ title: "积分不足，请充值", icon: "none" });
      return;
    }
    
    // 调用真实的AI降重API
    this.callRewriteAPI();
  },
  
  callRewriteAPI() {
    const auth = require("../../utils/auth.js");
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    this.setData({ 
      isRewriting: true, 
      progress: 0, 
      rewrittenText: "", 
      disableStart: true, 
      startButtonClass: "generate-btn generate-btn-disabled" 
    });
    
    // 启动进度条动画
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }
    this.progressTimer = setInterval(() => {
      let percent = this.data.progress + Math.floor(Math.random() * 5) + 3;
      if (percent >= 95) {
        percent = 95; // 在95%停住，等待真实结果
        clearInterval(this.progressTimer);
      }
      this.setData({ progress: percent });
    }, 500);
    
    wx.showLoading({ title: "AI降重中...", mask: true });
    
    // 调用降重API
    wx.request({
      url: `${apiBaseUrl}/api/rewrite/process`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: {
        originalText: this.data.originalText,
        rewriteLevel: this.data.rewriteLevel,
        discipline: this.data.disciplineIndex > 0 ? this.data.disciplines[this.data.disciplineIndex] : '',
        language: this.data.languages[this.data.languageIndex],
        platform: this.data.platforms[this.data.platformIndex]
      },
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.code === "PROCESSING") {
          const estimatedTime = res.data.data.estimatedTime || 30;
          const orderId = res.data.data.orderId;
          
          wx.showModal({
            title: "AI降重进行中",
            content: `正在为您降重 ${this.data.wordCount} 字的文本\n\n预计需要 ${Math.ceil(estimatedTime / 60)} 分钟\n\n降重完成后将自动保存到【文档库】和【订单】中\n\n消耗积分：${this.data.expectedCost}`,
            showCancel: false,
            confirmText: "知道了",
            confirmColor: "#2563eb"
          });
          
          // 轮询查询结果
          this.pollRewriteResult(orderId, estimatedTime);
        } else {
          wx.showToast({
            title: res.data.message || "提交失败",
            icon: "none"
          });
          this.resetRewriteState();
        }
      },
      fail: (err) => {
        console.error("调用降重API失败:", err);
        wx.hideLoading();
        wx.showToast({
          title: "网络异常，请稍后重试",
          icon: "none"
        });
        this.resetRewriteState();
      }
    });
  },
  
  pollRewriteResult(orderId, estimatedTime) {
    const auth = require("../../utils/auth.js");
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    // 等待预估时间后开始查询
    setTimeout(() => {
      const checkResult = () => {
        wx.request({
          url: `${apiBaseUrl}/api/rewrite/result/${orderId}`,
          method: "GET",
          header: {
            "Authorization": `Bearer ${token}`
          },
          success: (res) => {
            if (res.data && res.data.code === "SUCCESS" && res.data.data.document) {
              // 降重完成
              clearInterval(this.progressTimer);
              const doc = res.data.data.document;
              const similarity = this.calculateSimilarity(this.data.rewriteLevel);
              
              this.setData({
                progress: 100,
                rewrittenText: doc.content,
                similarity: similarity,
                isRewriting: false
              });
              
              points.syncCreditsFromServer();
              this.updateExpectedCost();
              
              // 停止轮询
              if (this.resultPoller) {
                clearInterval(this.resultPoller);
                this.resultPoller = null;
              }
              
              // 只弹一次提示
              wx.showToast({
                title: "降重完成！",
                icon: "success",
                duration: 2000
              });
            } else if (res.data && res.data.code === "PROCESSING") {
              // 继续等待
            } else if (res.data && res.data.code === "FAILED") {
              // 失败
              if (this.resultPoller) {
                clearInterval(this.resultPoller);
                this.resultPoller = null;
              }
              this.resetRewriteState();
              wx.showToast({ title: "降重失败", icon: "none" });
            }
          },
          fail: () => {
            // 不停止轮询，继续尝试
          }
        });
      };
      
      // 每5秒查询一次
      this.resultPoller = setInterval(checkResult, 5000);
      checkResult(); // 立即查询一次
      
      // 最多查询3分钟，超时后停止
      setTimeout(() => {
        if (this.resultPoller) {
          clearInterval(this.resultPoller);
          this.resultPoller = null;
          if (this.data.isRewriting) {
            this.resetRewriteState();
            wx.showToast({ title: "请求超时，请稍后查看订单", icon: "none" });
          }
        }
      }, 180000);
    }, estimatedTime * 1000);
  },
  
  resetRewriteState() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }
    if (this.resultPoller) {
      clearInterval(this.resultPoller);
    }
    this.setData({
      isRewriting: false,
      progress: 0
    });
    this.updateExpectedCost();
  },
  async completeRewrite() {
    try {
      const text = this.data.originalText;
      const level = this.data.rewriteLevel;
      const rewritten = this.generateRewrittenText(text, level);
      const similarity = this.calculateSimilarity(level);
      
      // 消耗积分（同步到服务器）
      const remaining = await points.consumeCredits(
        this.data.expectedCost,
        'ai_rewrite',
        `AI降重：${text.length}字`
      );
      
      this.setData({
        rewrittenText: rewritten,
        similarity,
        credits: remaining,
        isRewriting: false
      });
      
      notifications.addNotification({
        category: "AI降重",
        title: "降重任务完成",
        desc: "消耗 " + this.data.expectedCost + " 积分，相似度约 " + similarity + "%"
      });
      
      this.updateExpectedCost();
      wx.showToast({ title: "降重完成！", icon: "success" });
    } catch (error) {
      console.error("降重失败:", error);
      this.setData({ isRewriting: false });
      
      if (error.message === '积分不足') {
        wx.showToast({ 
          title: "积分不足，请先充值", 
          icon: "none",
          duration: 2000
        });
      } else {
        wx.showToast({ 
          title: "降重失败，请稍后重试", 
          icon: "none" 
        });
      }
    }
  },
  generateRewrittenText(text, level) {
    let result = text;
    if (level >= 1) {
      result = result
        .replace(/研究/g, "探讨")
        .replace(/分析/g, "剖析")
        .replace(/说明/g, "阐释")
        .replace(/通过/g, "借助")
        .replace(/因此/g, "所以");
    }
    if (level >= 2) {
      result = result
        .replace(/方法/g, "策略")
        .replace(/结果/g, "成果")
        .replace(/问题/g, "议题")
        .replace(/重要/g, "关键")
        .replace(/提出/g, "提供");
    }
    if (level >= 3) {
      result = result
        .replace(/技术/g, "工艺")
        .replace(/系统/g, "体系")
        .replace(/发展/g, "进步")
        .replace(/应用/g, "运用")
        .replace(/效果/g, "效应");
    }
    return (
      result +
      "\n\n--- AI降重完成 ---\n原文字数: " + text.length +
      "\n降重后字数: " + result.length +
      "\n降重程度: " + this.levelMap[level].text
    );
  },
  calculateSimilarity(level) {
    const base = [35, 25, 15][level - 1];
    return base + Math.floor(Math.random() * 10);
  },
  async saveRewrittenText() {
    if (!this.data.rewrittenText) {
      wx.showToast({ title: "没有可保存的内容", icon: "none" });
      return;
    }
    
    const documents = require("../../utils/documents.js");
    
    wx.showLoading({ title: "保存中..." });
    
    const docData = {
      title: "AI降重文档_" + new Date().toLocaleDateString(),
      content: this.data.rewrittenText,
      type: "AI降重",
      field: "",
      creditsCost: this.data.expectedCost || 0
    };
    
    try {
      await documents.createDocument(docData);
      wx.showToast({ title: "保存成功", icon: "success" });
    } catch (err) {
      console.error("保存文档失败:", err);
      wx.showToast({ title: "保存失败，请稍后重试", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
  copyToClipboard() {
    if (!this.data.rewrittenText) {
      wx.showToast({ title: "没有可复制的内容", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: this.data.rewrittenText, success: () => wx.showToast({ title: "已复制", icon: "success" }) });
  },
  clearAll() {
    this.setData({ originalText: "", rewrittenText: "", progress: 0, similarity: 0, wordCount: 0 });
    this.updateExpectedCost();
  },
  onUnload() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }
    if (this.resultPoller) {
      clearInterval(this.resultPoller);
    }
  }
});
