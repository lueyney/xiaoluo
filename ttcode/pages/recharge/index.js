const auth = require("../../utils/auth.js");
const points = require("../../utils/points.js");
const { getApiBaseUrl } = require("../../utils/request.js");

Page({
  data: {
    credits: 0,
    rechargePackages: [
      { id: 1, credits: 1, price: 1, bonus: 0, label: "体验套餐", recommended: false, isFirstTime: false },
      { id: 2, credits: 10, price: 10, bonus: 0, label: "可生成任务书", recommended: false, isFirstTime: false },
      { id: 3, credits: 20, price: 20, bonus: 0, label: "可生成开题报告", recommended: false, isFirstTime: false },
      { id: 4, credits: 50, price: 50, bonus: 0, label: "热门套餐", recommended: true, isFirstTime: false },
      { id: 5, credits: 100, price: 100, bonus: 0, label: "豪华套餐", recommended: false, isFirstTime: false }
    ],
    firstTimePackage: { id: 1, credits: 50, price: 1, bonus: 49, label: "首充特惠", recommended: true, isFirstTime: true },
    hasFirstRecharge: false,
    selectedPackage: null,
    isLoading: true,
    isCheckingFirstRecharge: false,
    showPay: true // iOS 屏蔽控制
  },

  onLoad() {
    // iOS 屏蔽充值入口
    try {
      const sys = tt.getSystemInfoSync();
      if (sys.platform === 'ios') {
        this.setData({ showPay: false });
        tt.showModal({
          title: '提示',
          content: 'iOS 暂不支持充值功能，请使用 Android 设备或 PC 端进行充值',
          showCancel: false,
          confirmText: '我知道了'
        });
        return;
      }
    } catch (e) {
      console.warn('获取系统信息失败:', e);
    }

    // 立即显示页面，避免白屏
    this.setData({ isLoading: false });
    tt.hideLoading();
    
    if (!auth.requireLogin(true)) {
      return;
    }
    this.initPage();
  },

  onShow() {
    tt.setNavigationBarTitle({ title: "积分充值" });
    // 清除可能的loading遮罩
    tt.hideLoading();
    // 只在必要时刷新
    this.loadCredits();
  },
  
  initPage() {
    // 显示loading
    this.setData({ isLoading: true });
    
    // 先加载本地数据
    this.loadCredits();
    
    // 异步检查首充状态（不阻塞页面）
    this.checkFirstRecharge();
    
    // 页面加载完成
    this.setData({ isLoading: false });
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

  // 检查是否已经首充
  checkFirstRecharge() {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    tt.request({
      url: `${apiBaseUrl}/api/douyin/pay/check-first-recharge`,
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
    const packageId = e.currentTarget.dataset.id;
    const isFirstTime = e.currentTarget.dataset.firsttime;
    
    if (isFirstTime) {
      this.selectRecommendPackage();
    } else {
      const selected = this.data.rechargePackages.find(p => p.id === packageId);
      if (selected) {
        this.processPayment(selected);
      }
    }
  },

  processPayment(pkg) {
    const token = auth.getToken();
    if (!token) {
      tt.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    tt.showLoading({ title: '正在准备支付...' });

    // 1. 先获取抖音登录code和anonymous_code
    tt.login({
      success: (loginRes) => {
        if (loginRes.code) {
          console.log('获取到code:', loginRes.code);
          console.log('获取到anonymous_code:', loginRes.anonymous_code);
          // 传递 code 和 anonymous_code
          this.createPaymentOrder(pkg, loginRes.code, loginRes.anonymous_code);
        } else {
          tt.hideLoading();
          tt.showToast({ title: '获取登录信息失败', icon: 'none' });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        console.error('tt.login失败:', err);
        tt.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  // 创建支付订单
  createPaymentOrder(pkg, code, anonymousCode) {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    tt.showLoading({ title: '正在创建订单...' });

    tt.request({
      url: `${apiBaseUrl}/api/douyin/pay/create-order`,
      method: "POST",
      header: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: {
        code: code,  // 传递code给后端
        anonymousCode: anonymousCode, // 传递anonymous_code给后端
        packageId: pkg.id,
        amount: pkg.price,
        credits: pkg.credits,
        isFirstTime: pkg.isFirstTime || false
      },
      success: (res) => {
        tt.hideLoading();
        
        if (res.data && res.data.code === "SUCCESS") {
          const orderId = res.data.data.orderId;
          const payInfo = res.data.data.payInfo;
          
          console.log('订单创建成功:', orderId);
          console.log('支付参数:', payInfo);
          
          // 调用抖音支付
          if (payInfo && !payInfo.mock) {
            this.requestDouyinPayment(payInfo, orderId, pkg);
          } else {
            tt.showModal({
              title: '配置未完成',
              content: '抖音支付未配置完整，请联系管理员',
              showCancel: false
            });
          }
        } else {
          // 创建订单失败
          const errorMsg = res.data.message || res.data.error || "创建订单失败";
          console.error("创建订单失败:", res.data);
          
          tt.showModal({
            title: '创建订单失败',
            content: errorMsg,
            showCancel: false,
            confirmText: '我知道了'
          });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        console.error("网络请求失败:", err);
        
        tt.showModal({
          title: '网络异常',
          content: '无法连接到服务器，请检查网络设置',
          showCancel: false,
          confirmText: '确定'
        });
      }
    });
  },

  // 调用抖音支付
  requestDouyinPayment(payInfo, orderId, pkg) {
    console.log('拉起抖音支付:', payInfo);
    
    // 抖音支付参数格式：order_id 和 order_token（担保交易）
    tt.pay({
      orderInfo: {
        order_id: payInfo.order_id,
        order_token: payInfo.order_token
      },
      service: 5, // 担保交易固定值
      success: (res) => {
        console.log('抖音支付回调:', res);
        // 抖音支付成功回调：code 0 表示成功，其他值表示失败或取消
        if (res.code === 0) {
          // ✅ 支付成功，立即查询订单状态
          console.log('抖音支付成功');
          this.checkPaymentStatus(orderId);
        } else {
          // 支付失败或取消 (code 1, 2, 3, 4...)
          console.log('抖音支付未完成，code:', res.code);
          tt.showToast({ 
            title: res.msg || '支付未完成', 
            icon: 'none' 
          });
        }
      },
      fail: (err) => {
        console.error("支付调起失败:", err);
        
        // 详细的错误提示
        if (err.errMsg === 'pay:fail cancel' || err.errMsg.includes('cancel')) {
          tt.showToast({ title: '支付已取消', icon: 'none' });
        } else if (err.errMsg.includes('参数错误')) {
          tt.showToast({ title: '支付参数错误', icon: 'none' });
        } else {
          tt.showToast({ title: '支付异常，请重试', icon: 'none' });
        }
      }
    });
  },


  goBack() {
    tt.navigateBack({
      fail: () => {
        tt.switchTab({ url: '/pages/profile/index' });
      }
    });
  },
  
  // 选择推荐套餐（首次充值1元）
  selectRecommendPackage() {
    const firstTimePkg = this.data.firstTimePackage;
    if (firstTimePkg && !this.data.hasFirstRecharge) {
      this.processPayment(firstTimePkg);
    } else {
      tt.showToast({ title: "该优惠已使用", icon: "none" });
    }
  },

  // 跳转到支付记录页面
  goToPaymentRecords() {
    tt.navigateTo({ url: "/pages/payment-records/index" });
  },

  // 主动查询支付结果并更新积分（支付成功后立即调用）
  checkPaymentStatus(orderId) {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    // 立即显示 loading，防止用户乱点
    tt.showLoading({ title: '确认中...', mask: true });

    tt.request({
      url: `${apiBaseUrl}/api/douyin/pay/query-and-complete`,
      method: "POST",
      header: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: { orderId },
      success: (res) => {
        tt.hideLoading();

        if (res.data && res.data.code === "SUCCESS") {
          // ✅ 验证成功，积分已发放
          const credits = res.data.data.credits || 0;
          const balance = res.data.data.balance;
          
          // 1. 提示成功
          tt.showToast({ 
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
          // 极少见情况：抖音那边还没显示支付成功（通常稍等重试即可）
          tt.showToast({ 
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
          tt.showToast({ 
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
        tt.hideLoading();
        console.error("查单失败:", err);
        
        // 查单接口挂了不代表支付挂了，提示用户稍后看
        tt.showToast({ 
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


