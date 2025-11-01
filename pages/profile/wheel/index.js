const points = require("../../../utils/points.js");
const notifications = require("../../../utils/notifications.js");

const rewardPool = [
  { label: "积分 +20", type: "points", value: 20, desc: "积分增加 20" },
  { label: "积分 +50", type: "points", value: 50, desc: "积分增加 50" },
  { label: "降重券 x1", type: "coupon", value: 1, desc: "赠送 1 次降重机会" },
  { label: "VIP体验日", type: "vip", value: 1, desc: "赠送 1 天 VIP 体验" },
  { label: "积分 +80", type: "points", value: 80, desc: "积分增加 80" },
  { label: "再接再厉", type: "none", value: 0, desc: "感谢参与，再试一次" }
];

Page({
  data: {
    rewards: rewardPool,
    isSpinning: false,
    lastReward: null,
    history: [],
    hasDrawnToday: false,
    remainingChances: 1,
    nextDrawTime: null
  },
  onShow() {
    wx.setNavigationBarTitle({ title: "幸运转盘" });
    this.checkDailyStatus();
    this.loadHistory();
  },
  
  checkDailyStatus() {
    const auth = require("../../../utils/auth.js");
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    wx.request({
      url: `${apiBaseUrl}/api/wheel/check-daily`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          this.setData({
            hasDrawnToday: res.data.data.hasDrawnToday,
            remainingChances: res.data.data.remainingChances,
            nextDrawTime: res.data.data.nextDrawTime
          });
        }
      }
    });
  },
  
  loadHistory() {
    const auth = require("../../../utils/auth.js");
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    wx.request({
      url: `${apiBaseUrl}/api/wheel/history?limit=10`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          const history = res.data.data.records.map(record => ({
            label: record.reward_label,
            time: this.formatTime(record.created_at)
          }));
          this.setData({ history });
          
          // 如果有今天的记录，显示最新的奖励
          if (history.length > 0) {
            const latestRecord = res.data.data.records[0];
            const today = new Date().toDateString();
            const recordDate = new Date(latestRecord.created_at).toDateString();
            
            if (today === recordDate) {
              this.setData({
                lastReward: {
                  label: latestRecord.reward_label,
                  desc: latestRecord.reward_desc,
                  type: latestRecord.reward_type,
                  value: latestRecord.reward_value
                }
              });
            }
          }
        }
      }
    });
  },
  
  formatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const recordDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (recordDay.getTime() === today.getTime()) {
      return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (recordDay.getTime() === yesterday.getTime()) {
        return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      } else {
        return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
    }
  },
  onSpin() {
    if (this.data.isSpinning) {
      return;
    }
    
    if (this.data.hasDrawnToday) {
      const nextDay = new Date(this.data.nextDrawTime);
      wx.showModal({
        title: "今日已抽奖",
        content: `您今天已经抽过奖了\n\n明天 ${nextDay.toLocaleDateString()} 0点可再次抽奖`,
        showCancel: false,
        confirmText: "知道了",
        confirmColor: "#7c3aed"
      });
      return;
    }
    
    this.setData({ isSpinning: true });
    
    // 调用后端抽奖API
    const auth = require("../../../utils/auth.js");
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";
    
    wx.request({
      url: `${apiBaseUrl}/api/wheel/draw`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          const reward = res.data.data.reward;
          
          setTimeout(() => {
            this.setData({
              isSpinning: false,
              lastReward: reward,
              hasDrawnToday: true,
              remainingChances: 0,
              nextDrawTime: res.data.data.nextDrawTime
            });
            
            // 刷新积分和历史
            points.syncCreditsFromServer();
            this.loadHistory();
            
            // 显示奖励提示
            wx.showModal({
              title: "🎉 恭喜您！",
              content: `${reward.label}\n\n${reward.desc}\n\n明天再来抽奖吧！`,
              showCancel: false,
              confirmText: "太棒了",
              confirmColor: "#7c3aed"
            });
          }, 2200); // 等待转盘动画
        } else if (res.data && res.data.code === "ALREADY_DRAWN") {
          this.setData({ isSpinning: false });
          wx.showToast({ title: "今日已抽奖", icon: "none" });
        } else {
          this.setData({ isSpinning: false });
          wx.showToast({ title: "抽奖失败", icon: "none" });
        }
      },
      fail: (err) => {
        console.error("抽奖失败:", err);
        this.setData({ isSpinning: false });
        wx.showToast({ title: "网络异常", icon: "none" });
      }
    });
  },
  applyReward(reward) {
     if (reward.type === "points" && reward.value > 0) {
      points.addCredits(reward.value).catch(err => {
        console.error("积分奖励发放失败:", err);
      });
    }
  },
  appendHistory(reward) {
    const entry = {
      label: reward.label,
      time: new Date().toLocaleString()
    };
    const list = [entry].concat(this.data.history).slice(0, 10);
    this.setData({ history: list });
    wx.setStorageSync("wheelHistory", list);
  },
  clearHistory() {
    wx.removeStorageSync("wheelHistory");
    this.setData({ history: [] });
  }
});

