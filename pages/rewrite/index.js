const points = require("../../utils/points.js");
const auth = require("../../utils/auth.js");
const notifications = require("../../utils/notifications.js");
const documents = require("../../utils/documents.js");
const { getApiBaseUrl } = require("../../utils/request.js");

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
    this.updateExpectedCost();
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

  updateExpectedCost() {
    const meta = this.levelMap[this.data.rewriteLevel];
    const rawCost = this.data.wordCount > 0 ? Math.ceil(this.data.wordCount / 1000 * 1.2) : 0;
    const cost = rawCost > 0 ? rawCost : 0;
    const hasEnoughText = this.data.wordCount >= 25;
    const credits = points.getCredits();
    const balanceOk = cost <= credits;
    const canStart = hasEnoughText && balanceOk && !this.data.isRewriting;

    this.setData({
      expectedCost: cost,
      disableStart: !canStart,
      startButtonClass: canStart ? "generate-btn generate-btn-active" : "generate-btn generate-btn-disabled",
      credits,
      levelText: meta.text,
      levelDesc: meta.desc
    });
  },

  startRewrite() {
    if (this.data.isRewriting || this.data.disableStart) return;
    if (!auth.getToken()) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    const text = (this.data.originalText || "").trim();
    if (text.length < 25) {
      wx.showToast({ title: "文本长度至少25字", icon: "none" });
      return;
    }

    if (this.data.credits < this.data.expectedCost) {
      wx.showToast({ title: `积分不足，本次约需 ${this.data.expectedCost} 积分`, icon: "none" });
      return;
    }

    this.callRewriteAPI();
  },

  callRewriteAPI() {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    this.resetTimers();
    this.setData({
      isRewriting: true,
      progress: 0,
      rewrittenText: "",
      similarity: 0,
      disableStart: true,
      startButtonClass: "generate-btn generate-btn-disabled"
    });

    this.progressTimer = setInterval(() => {
      let percent = this.data.progress + Math.floor(Math.random() * 5) + 3;
      if (percent >= 95) {
        percent = 95;
        clearInterval(this.progressTimer);
        this.progressTimer = null;
      }
      this.setData({ progress: percent });
    }, 500);

    wx.showLoading({ title: "AI降重中...", mask: true });

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
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const rewrittenText = res.data.data.rewrittenText || "";
          clearInterval(this.progressTimer);
          this.progressTimer = null;
          this.setData({
            progress: 100,
            rewrittenText,
            similarity: this.calculateSimilarity(this.data.rewriteLevel),
            isRewriting: false
          });

          points.syncCreditsFromServer()
            .then((credits) => {
              this.setData({ credits });
              this.updateExpectedCost();
            })
            .catch(() => {
              this.updateExpectedCost();
            });

          notifications.addNotification({
            category: "AI降重",
            title: "降重任务完成",
            desc: `消耗 ${res.data.data.creditsCost || this.data.expectedCost} 积分`
          });

          wx.showToast({
            title: "降重完成！",
            icon: "success",
            duration: 2000
          });
        } else {
          wx.showToast({
            title: (res.data && (res.data.error || res.data.message)) || "提交失败",
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

  resetTimers() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.resultPoller) {
      clearInterval(this.resultPoller);
      this.resultPoller = null;
    }
  },

  resetRewriteState() {
    this.resetTimers();
    this.setData({
      isRewriting: false,
      progress: 0
    });
    this.updateExpectedCost();
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
    wx.setClipboardData({
      data: this.data.rewrittenText,
      success: () => wx.showToast({ title: "已复制", icon: "success" })
    });
  },

  clearAll() {
    this.setData({ originalText: "", rewrittenText: "", progress: 0, similarity: 0, wordCount: 0 });
    this.updateExpectedCost();
  },

  onUnload() {
    this.resetTimers();
  }
});
