const auth = require('../../utils/auth.js');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    loading: false,
    errorShown: false
  },

  methods: {
    // 防止穿透
    preventTouchMove() {},

    // 关闭弹窗
    onClose() {
      this.setData({ errorShown: false });
      this.triggerEvent('close');
    },

    // 获取手机号回调
    onGetPhoneNumber(e) {
      console.log('[一键登录] 获取手机号回调:', e.detail);

      // 检查用户是否同意授权或模拟器环境报错
      if (e.detail.errMsg !== 'getPhoneNumber:ok') {
        // 模拟器环境或用户拒绝授权
        if (e.detail.errMsg.includes('fail') || e.detail.errMsg.includes('missing')) {
          // 只显示一次提示（避免重复弹窗）
          if (!this.data.errorShown) {
            this.setData({ errorShown: true });
            wx.showModal({
              title: '温馨提示',
              content: '模拟器环境无法获取手机号\n\n请点击下方"使用其他手机号登录"跳转到登录页，或使用真机调试体验完整功能',
              showCancel: true,
              cancelText: '关闭',
              confirmText: '去登录',
              success: (res) => {
                if (res.confirm) {
                  this.goToLoginPage();
                }
              }
            });
          }
        } else {
          wx.showToast({
            title: '您取消了授权',
            icon: 'none',
            duration: 2000
          });
        }
        return;
      }

      // 获取加密数据
      const encryptedData = e.detail.encryptedData;
      const iv = e.detail.iv;

      if (!encryptedData || !iv) {
        wx.showToast({
          title: '获取手机号失败',
          icon: 'none'
        });
        return;
      }

      // 调用 wx.login 获取 code
      this.setData({ loading: true });
      
      wx.login({
        success: (res) => {
          if (res.code) {
            console.log('[一键登录] 获取到 code:', res.code);
            this.sendToServer(res.code, encryptedData, iv);
          } else {
            console.error('[一键登录] wx.login 失败:', res.errMsg);
            wx.showToast({
              title: '登录失败，请重试',
              icon: 'none'
            });
            this.setData({ loading: false });
          }
        },
        fail: (err) => {
          console.error('[一键登录] wx.login 调用失败:', err);
          wx.showToast({
            title: '登录失败',
            icon: 'none'
          });
          this.setData({ loading: false });
        }
      });
    },

    // 发送到后端服务器
    sendToServer(code, encryptedData, iv) {
      const app = getApp();
      const apiBaseUrl = wx.getStorageSync('apiBaseUrl') || 
                        (app && app.globalData && app.globalData.apiBaseUrl) || 
                        'http://127.0.0.1:3000';

      wx.request({
        url: `${apiBaseUrl}/api/auth/wechat-phone-login`,
        method: 'POST',
        data: {
          code: code,
          encryptedData: encryptedData,
          iv: iv
        },
        header: {
          'Content-Type': 'application/json'
        },
        timeout: 15000,
        success: (res) => {
          if (res.data && res.data.code === 'SUCCESS' && res.data.data && res.data.data.token) {
            // 保存登录信息
            auth.saveLoginInfo(res.data.data.token, res.data.data.user || {});
            
            // 同步积分
            const points = require('../../utils/points.js');
            if (res.data.data.user && typeof res.data.data.user.credits === 'number') {
              points.setCredits(res.data.data.user.credits);
            }

            const isNewUser = res.data.data.isNewUser;
            const message = isNewUser ? '注册成功！已赠送50积分' : '登录成功！';

            wx.showToast({
              title: message,
              icon: 'success',
              duration: 1500
            });

            // 关闭弹窗，触发成功回调
            setTimeout(() => {
              this.triggerEvent('success', { isNewUser });
              this.onClose();
            }, 1500);
          } else {
            wx.showToast({
              title: res.data.message || '登录失败，请重试',
              icon: 'none',
              duration: 2000
            });
            this.setData({ loading: false });
          }
        },
        fail: (err) => {
          console.error('[一键登录] 请求失败:', err);
          wx.showToast({
            title: '网络异常，请稍后重试',
            icon: 'none',
            duration: 2000
          });
          this.setData({ loading: false });
        }
      });
    },

    // 跳转到登录页面（使用redirectTo避免返回）
    goToLoginPage() {
      this.onClose();
      wx.redirectTo({
        url: '/pages/login/index',
        fail: () => {
          wx.reLaunch({ url: '/pages/login/index' });
        }
      });
    }
  }
});

