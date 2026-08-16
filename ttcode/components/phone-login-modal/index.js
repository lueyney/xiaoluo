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
            tt.showModal({
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
          tt.showToast({
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
        tt.showToast({
          title: '获取手机号失败',
          icon: 'none'
        });
        return;
      }

      // 调用 tt.login 获取 code 和 anonymous_code
      this.setData({ loading: true });
      
      tt.login({
        success: (res) => {
          if (res.code) {
            console.log('[一键登录] 获取到 code:', res.code);
            console.log('[一键登录] anonymous_code:', res.anonymous_code);
            // 传递 code 和 anonymous_code（抖音官方建议）
            this.sendToServer(res.code, res.anonymous_code, encryptedData, iv);
          } else {
            console.error('[一键登录] tt.login 失败:', res.errMsg);
            tt.showToast({
              title: '登录失败，请重试',
              icon: 'none'
            });
            this.setData({ loading: false });
          }
        },
        fail: (err) => {
          console.error('[一键登录] tt.login 调用失败:', err);
          tt.showToast({
            title: '登录失败',
            icon: 'none'
          });
          this.setData({ loading: false });
        }
      });
    },

    // 发送到后端服务器
    sendToServer(code, anonymousCode, encryptedData, iv) {
      const app = getApp();
      const apiBaseUrl = tt.getStorageSync('apiBaseUrl') || 
                        (app && app.globalData && app.globalData.apiBaseUrl) || 
                        'https://yaoguang.yaoguangxiaoluo.cn';

      tt.request({
        url: `${apiBaseUrl}/api/douyin/auth/login`,
        method: 'POST',
        data: {
          code: code,
          anonymousCode: anonymousCode, // 传递 anonymous_code
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
            const needSetPassword = !!res.data.data.needSetPassword;
            const message = '登录成功！';

            tt.showToast({
              title: message,
              icon: 'success',
              duration: 1500
            });

            // 关闭弹窗，触发成功回调
            setTimeout(() => {
              this.triggerEvent('success', { isNewUser, needSetPassword });
              this.onClose();
              if (needSetPassword) {
                tt.showModal({
                  title: '建议设置密码',
                  content: '为保障账号安全，建议您前往个人中心设置登录密码，方便后续使用密码登录。',
                  confirmText: '去设置',
                  cancelText: '稍后再说',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      tt.navigateTo({
                        url: '/pages/profile/settings/index?open=password',
                        fail: () => {
                          tt.switchTab({ url: '/pages/profile/index' });
                        }
                      });
                    }
                  }
                });
              }
            }, 1500);
          } else {
            tt.showToast({
              title: res.data.message || '登录失败，请重试',
              icon: 'none',
              duration: 2000
            });
            this.setData({ loading: false });
          }
        },
        fail: (err) => {
          console.error('[一键登录] 请求失败:', err);
          tt.showToast({
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
      tt.redirectTo({
        url: '/pages/login/index',
        fail: () => {
          tt.reLaunch({ url: '/pages/login/index' });
        }
      });
    }
  }
});

