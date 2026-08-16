const points = require("../../utils/points.js");
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
    tt.setNavigationBarTitle({ title: "AI智能降重" });
    tt.hideLoading();
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
      tt.showToast({ title: "请输入需要降重的文本", icon: "none" });
      return;
    }
    if (this.data.credits < this.data.expectedCost) {
      tt.showToast({ title: "积分不足，请充值", icon: "none" });
      return;
    }
    this.callRewriteAPI();
  },
  
  callRewriteAPI() {
    const auth = require("../../utils/auth.js");
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    this.setData({
      isRewriting: true, progress: 0, rewrittenText: "",
      disableStart: true, startButtonClass: "generate-btn generate-btn-disabled"
    });

    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => {
      let p = this.data.progress + Math.floor(Math.random() * 4) + 2;
      if (p >= 90) { p = 90; clearInterval(this.progressTimer); }
      this.setData({ progress: p });
    }, 800);

    tt.showLoading({ title: "AI降重中...", mask: true });

    tt.request({
      url: `${apiBaseUrl}/api/rewrite/start`,
      method: "POST",
      header: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      data: { originalText: this.data.originalText, rewriteLevel: this.data.rewriteLevel },
      success: (res) => {
        tt.hideLoading();
        if (res.data && res.data.code === "SUCCESS") {
          const { orderId } = res.data.data;
          this.pollRewriteResult(orderId);
        } else {
          const msg = (res.data && res.data.error) || "提交失败";
          tt.showToast({ title: msg, icon: "none" });
          this.resetRewriteState();
        }
      },
      fail: (err) => {
        console.error("调用降重 API 失败:", err);
        tt.hideLoading();
        tt.showToast({ title: "您的网络存在波动，请稍后再试", icon: "none", duration: 3000 });
        this.resetRewriteState();
      }
    });
  },

  pollRewriteResult(orderId) {
    const auth = require("../../utils/auth.js");
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    const checkResult = () => {
      tt.request({
        url: `${apiBaseUrl}/api/rewrite/result/${orderId}`,
        method: "GET",
        header: { "Authorization": `Bearer ${token}` },
        success: (res) => {
          if (res.data && res.data.code === "SUCCESS" && res.data.data && res.data.data.document) {
            clearInterval(this.progressTimer);
            if (this.resultPoller) { clearInterval(this.resultPoller); this.resultPoller = null; }
            const doc = res.data.data.document;
            const similarity = this.calculateSimilarity(this.data.rewriteLevel);
            this.setData({ progress: 100, rewrittenText: doc.content, similarity, isRewriting: false, isPaused: false });
            points.syncCreditsFromServer && points.syncCreditsFromServer();
            this.updateExpectedCost();
            tt.showToast({ title: "降重完成！", icon: "success", duration: 2000 });
          } else if (res.data && res.data.code === "FAILED") {
            clearInterval(this.resultPoller); this.resultPoller = null;
            clearInterval(this.progressTimer);
            this.setData({ isRewriting: false, isPaused: false });
            tt.showToast({ title: "降重失败", icon: "none" });
          }
        },
        fail: () => {}
      });
    };

    checkResult();
    this.resultPoller = setInterval(() => {
      if (!this.data.isPaused) checkResult();
    }, 3000);

    setTimeout(() => {
      if (this.resultPoller) {
        clearInterval(this.resultPoller); this.resultPoller = null;
        if (this.data.isRewriting) {
          this.setData({ isRewriting: false, isPaused: false });
          tt.showToast({ title: "降重超时，请稍后再试", icon: "none" });
        }
      }
    }, 180000);
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
  calculateSimilarity(level) {
    const map = { 1: 35, 2: 25, 3: 15 };
    return map[level] || 25;
  }
});
