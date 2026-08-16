const auth = require('./auth.js');

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_PROD_BASE = 'https://yaoguangxiaoluo.cn';
const DEFAULT_LOCAL_BASE = DEFAULT_PROD_BASE;

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return DEFAULT_PROD_BASE;
  }

  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return DEFAULT_PROD_BASE;
  }

  if (trimmed.includes('127.0.0.1') || trimmed.includes('localhost') || trimmed.includes('yaoguang.yaoguangxiaoluo.cn')) {
    return DEFAULT_PROD_BASE;
  }

  return trimmed.replace(/\/$/, '');
}

function getEnvVersion() {
  // 抖音小程序可能不支持 getAccountInfoSync，直接返回默认值
  // 由于统一使用公网域名，环境版本不影响实际请求地址
    return 'develop';
}

function resolveDefaultBaseUrl() {
  const app = getApp ? getApp() : null;
  const envVersion = getEnvVersion();

  if (envVersion === 'release' || envVersion === 'trial') {
    return normalizeBaseUrl((app && app.globalData && app.globalData.apiBaseUrlProd) || DEFAULT_PROD_BASE);
  }

  if (app && app.globalData) {
    return normalizeBaseUrl(app.globalData.apiBaseUrl || DEFAULT_LOCAL_BASE);
  }

  return DEFAULT_PROD_BASE;
}

function getApiBaseUrl() {
  const app = getApp();
  return normalizeBaseUrl(
    tt.getStorageSync('apiBaseUrl') ||
    (app && app.globalData && app.globalData.apiBaseUrl) ||
    resolveDefaultBaseUrl()
  );
}

function buildHeaders(extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };

  const token = auth.getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function handleUnauthorized(showToast = true) {
  auth.clearLoginInfo();
  tt.removeStorageSync('userToken');
  tt.removeStorageSync('userData');

  if (showToast) {
    tt.showToast({
      title: '登录已失效，请重新登录',
      icon: 'none'
    });
  }

  const pages = getCurrentPages();
  if (pages.length > 0) {
    const currentPage = pages[pages.length - 1];
    if (typeof currentPage.showPhoneLoginModal === 'function') {
      currentPage.showPhoneLoginModal();
      return;
    }
  }

  setTimeout(() => {
    tt.redirectTo({
      url: '/pages/login/index',
      fail: () => {
        tt.reLaunch({ url: '/pages/login/index' });
      }
    });
  }, 600);
}

function request(options) {
  const {
    url,
    method = 'GET',
    data = {},
    headers = {},
    timeout = DEFAULT_TIMEOUT,
    showLoading = false,
    loadingText = '加载中...',
    skipAuthHandling = false
  } = options;

  if (showLoading) {
    tt.showLoading({ title: loadingText, mask: false });
  }

  return new Promise((resolve, reject) => {
    tt.request({
      url: `${getApiBaseUrl()}${url}`,
      method,
      data,
      header: buildHeaders(headers),
      timeout,
      success: (res) => {
        if (res.statusCode === 401 && !skipAuthHandling) {
          handleUnauthorized();
          reject(res);
          return;
        }
        resolve(res);
      },
      fail: (err) => {
        reject(err);
      },
      complete: () => {
        if (showLoading) {
          tt.hideLoading();
        }
      }
    });
  });
}

module.exports = {
  request,
  getApiBaseUrl,
  normalizeBaseUrl,
  DEFAULT_PROD_BASE
};

