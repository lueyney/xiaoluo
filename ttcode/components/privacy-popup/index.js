Component({
  data: {
    show: false
  },
  methods: {
    // 父组件调用，返回是否已同意
    checkPrivacy() {
      const agreed = tt.getStorageSync('privacy_agreed');
      if (!agreed) {
        this.setData({ show: true });
        return false;
      }
      return true;
    },
    handleAgree() {
      tt.setStorageSync('privacy_agreed', true);
      this.setData({ show: false });
      this.triggerEvent('agree');
    },
    handleDisagree() {
      this.setData({ show: false });
      tt.showToast({ title: '需同意隐私协议才能继续', icon: 'none' });
    },
    openPrivacyContract() {
      if (tt.openPrivacyContract) {
        tt.openPrivacyContract({});
      } else {
        tt.showToast({ title: '请在真机查看隐私协议', icon: 'none' });
      }
    }
  }
});

