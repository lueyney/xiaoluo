const auth = require("../../utils/auth.js");
const points = require("../../utils/points.js");
const { getApiBaseUrl } = require("../../utils/request.js");

Page({
  data: {
    credits: 0,
    rechargePackages: [],
    firstTimePackage: null,
    hasFirstRecharge: false,
    selectedPackage: null,
    isLoading: true,
    isCheckingFirstRecharge: false
  },

  onLoad() {
    // 立即显示页面，避免白屏
    this.setData({ isLoading: false });
    wx.hideLoading();
    
    if (!auth.requireLogin(true)) {
      return;
    }
    this.initPage();
  },

  onShow() {
    wx.setNavigationBarTitle({ title: "积分充值" });
    // 清除可能的loading遮罩
    wx.hideLoading();
    // 只在必要时刷新
    this.loadCredits();
  },
  
  initPage() {
    this.setData({ isLoading: true });
    this.loadCredits();
    this.loadRechargePackages();
    this.checkFirstRecharge();
    this.setData({ isLoading: false });
  },

  loadRechargePackages() {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    if (!token) {
      return;
    }

    wx.request({
      url: `${apiBaseUrl}/api/orders/packages`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (!(res.data && res.data.code === "SUCCESS" && Array.isArray(res.data.data))) {
          return;
        }

        const packages = res.data.data;
        const firstTimePackage = packages.find(item => Number(item.price) === 0) || null;
        const rechargePackages = packages.filter(item => Number(item.price) > 0).map(item => ({
          id: item.id,
          credits: item.credits,
          price: item.price,
          bonus: 0,
          label: item.description || item.name,
          recommended: !!item.popular,
          isFirstTime: false,
          name: item.name,
          description: item.description || ''
        }));

        this.setData({
          rechargePackages,
          firstTimePackage: firstTimePackage ? {
            id: firstTimePackage.id,
            credits: firstTimePackage.credits,
            price: firstTimePackage.price,
            bonus: 0,
            label: firstTimePackage.name,
            recommended: !!firstTimePackage.popular,
            isFirstTime: true,
            name: firstTimePackage.name,
            description: firstTimePackage.description || ''
          } : null
        });
      },
      fail: (err) => {
        console.error("加载充值套餐失败:", err);
      }
    });
  },

  loadCredits() {
    const credits = points.getCredits();
    this.setData({ credits });

    if (auth.getToken()) {
      points
        .syncCreditsFromServer()
        .then((fresh) => {
          this.setData({ credits: fresh });
        })
        .catch((err) => {
          console.error("同步积分失败:", err);
        });
    }
  },

  checkFirstRecharge() {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    wx.request({
      url: `${apiBaseUrl}/api/wechat-pay/check-first-recharge`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          const hasFirstRecharge = res.data.data.hasFirstRecharge;
          this.setData({ hasFirstRecharge });
          
          // 如果已经首充，从列表中移除首充套餐
          if (hasFirstRecharge) {
            this.setData({ firstTimePackage: null });
          }
        }
      },
      fail: (err) => {
        console.error("检查首充状态失败:", err);
      }
    });
  },

  selectPackage(e) {
    const packageId = Number(e.currentTarget.dataset.id);
    const isFirstTime = !!e.currentTarget.dataset.firsttime;
    
    if (isFirstTime) {
      this.selectRecommendPackage();
    } else {
      const selected = this.data.rechargePackages.find(p => Number(p.id) === packageId);
      if (selected) {
        this.processPayment(selected);
      }
    }
  },

  processPayment(pkg) {
    const token = auth.getToken();
    if (!token) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    wx.showLoading({ title: '正在准备支付...' });

    // 1. 先获取微信登录code
    wx.login({
      success: (loginRes) => {
        if (loginRes.code) {
          console.log('获取到code:', loginRes.code);
          this.createPaymentOrder(pkg, loginRes.code);
        } else {
          wx.hideLoading();
          wx.showToast({ title: '获取登录信息失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('wx.login失败:', err);
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  // 创建支付订单
  createPaymentOrder(pkg, code) {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    wx.showLoading({ title: '正在创建订单...' });

    wx.request({
      url: `${apiBaseUrl}/api/wechat-pay/create-order`,
      method: "POST",
      header: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: {
        code: code,  // 传递code给后端
        packageId: pkg.id,
        amount: pkg.price,
        credits: pkg.credits,
        isFirstTime: pkg.isFirstTime || false
      },
      success: (res) => {
        wx.hideLoading();
        
        if (res.data && res.data.code === "SUCCESS") {
          const orderId = res.data.data.orderId;
          const payParams = res.data.data.payParams;
          
          console.log('订单创建成功:', orderId);
          console.log('支付参数:', payParams);
          
          if (payParams && payParams.free) {
            this.requestWeChatPayment(payParams, orderId, pkg);
          } else if (payParams && !payParams.mock) {
            this.requestWeChatPayment(payParams, orderId, pkg);
          } else {
            wx.showModal({
              title: '配置未完成',
              content: '微信支付未配置完整，请联系管理员',
              showCancel: false
            });
          }
        } else {
          // 创建订单失败
          const errorMsg = res.data.message || res.data.error || "创建订单失败";
          console.error("创建订单失败:", res.data);
          
          wx.showModal({
            title: '创建订单失败',
            content: errorMsg,
            showCancel: false,
            confirmText: '我知道了'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("网络请求失败:", err);
        
        wx.showModal({
          title: '网络异常',
          content: '无法连接到服务器，请检查网络设置',
          showCancel: false,
          confirmText: '确定'
        });
      }
    });
  },

  // 调用微信支付
  requestWeChatPayment(payParams, orderId, pkg) {
    console.log('拉起微信支付:', payParams);

    if (payParams && payParams.free) {
      wx.showToast({ title: '领取成功', icon: 'success', duration: 2000 });
      this.loadCredits();
      this.checkFirstRecharge();
      return;
    }
    
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType,
      paySign: payParams.paySign,
      success: (res) => {
        // ✅ 支付成功，不要等！立刻去后端查
        console.log('微信支付成功:', res);
        this.checkPaymentStatus(orderId);
      },
      fail: (err) => {
        console.error("支付失败:", err);
        
        // 详细的错误提示
        if (err.errMsg === 'requestPayment:fail cancel') {
          wx.showToast({ title: '支付已取消', icon: 'none' });
        } else if (err.errMsg.includes('参数错误')) {
          wx.showToast({ title: '支付失败', icon: 'none' });
        } else {
          wx.showToast({ title: '支付失败', icon: 'none' });
        }
      }
    });
  },


  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/profile/index' });
      }
    });
  },
  
  // 选择推荐套餐（首次充值1元）
  selectRecommendPackage() {
    const firstTimePkg = this.data.firstTimePackage;
    if (firstTimePkg && !this.data.hasFirstRecharge) {
      this.processPayment(firstTimePkg);
    } else {
      wx.showToast({ title: "该优惠已使用", icon: "none" });
    }
  },

  // 跳转到支付记录页面
  goToPaymentRecords() {
    wx.navigateTo({ url: "/pages/payment-records/index" });
  },

  // 主动查询支付结果并更新积分（支付成功后立即调用）
  checkPaymentStatus(orderId) {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    // 立即显示 loading，防止用户乱点
    wx.showLoading({ title: '确认中...', mask: true });

    wx.request({
      url: `${apiBaseUrl}/api/wechat-pay/poll-order/${orderId}`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        wx.hideLoading();

        if (res.data && res.data.code === "SUCCESS") {
          // ✅ 验证成功，积分已发放
          const credits = res.data.data.credits || 0;
          const balance = res.data.data.balance;
          
          // 1. 提示成功
          wx.showToast({ 
            title: '充值成功', 
            icon: 'success',
            duration: 2000
          });
          
          // 2. 更新本地显示的积分（使用后端返回的最新余额）
          if (typeof balance === 'number') {
            points.setCredits(balance);
            this.setData({ credits: balance });
          } else {
            // 如果没有返回余额，重新拉取
            this.loadCredits();
          }
          
          // 3. 刷新首充状态
          this.checkFirstRecharge();
        } else if (res.data && res.data.code === "ORDER_NOT_PAID") {
          // 极少见情况：微信那边还没显示支付成功（通常稍等重试即可）
          wx.showToast({ 
            title: '系统处理中，请稍后查看', 
            icon: 'none',
            duration: 2000
          });
          
          // 兜底：延迟刷新积分（等待回调）
          setTimeout(() => {
            this.loadCredits();
            this.checkFirstRecharge();
          }, 2000);
        } else {
          // 其他错误
          const errorMsg = res.data.error || res.data.message || "验证失败";
          wx.showToast({ 
            title: '结果同步中，请刷新查看', 
            icon: 'none',
            duration: 2000
          });
          
          // 兜底：延迟刷新积分（等待回调）
          setTimeout(() => {
            this.loadCredits();
            this.checkFirstRecharge();
          }, 2000);
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("查单失败:", err);
        
        // 查单接口挂了不代表支付挂了，提示用户稍后看
        wx.showToast({ 
          title: '结果同步中，请刷新查看', 
          icon: 'none',
          duration: 2000
        });
        
        // 兜底：延迟刷新积分（等待回调）
        setTimeout(() => {
          this.loadCredits();
          this.checkFirstRecharge();
        }, 2000);
      }
    });
  }
});


