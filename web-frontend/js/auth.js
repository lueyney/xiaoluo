// 认证管理
class Auth {
    constructor() {
        this.token = null;
        this.userInfo = null;
        this.init();
    }

    init() {
        this.token = localStorage.getItem('auth_token');
        const userInfoStr = localStorage.getItem('user_info');
        
        if (userInfoStr && userInfoStr !== 'undefined' && userInfoStr !== 'null') {
            try {
                this.userInfo = JSON.parse(userInfoStr);
            } catch (e) {
                console.error('解析用户信息失败:', e);
                this.userInfo = null;
                localStorage.removeItem('user_info');
            }
        }
        
        if (this.token && this.userInfo) {
            setTimeout(() => {
                this.updateUI();
                this.refreshUserInfo();
            }, 100);
        }
    }

    async login(phone, password) {
        try {
            utils.showLoading();
            const response = await api.login(phone, password);
            
            // 适配后端响应格式: {message, code, data: {token, user}}
            if (!response || !response.data) {
                throw new Error('登录响应格式错误');
            }
            
            const { token, user, profile } = response.data;
            
            if (!token) {
                throw new Error('未获取到token');
            }
            
            this.token = token;
            this.userInfo = user || profile || {};
            
            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('user_info', JSON.stringify(this.userInfo));
            
            this.updateUI();
            this.closeAuthModal();
            utils.showToast('登录成功', 'success');
            if (window.router) window.router.navigate('writing');
            
            setTimeout(() => this.refreshUserInfo(), 500);
            
            return true;
        } catch (error) {
            console.error('登录失败:', error);
            utils.showToast(error.message || '登录失败', 'error');
            return false;
        } finally {
            utils.hideLoading();
        }
    }

    async loginByCode(phone, code) {
        try {
            utils.showLoading();
            const response = await api.post('/auth/login', { phone, code });
            if (!response || !response.data) {
                throw new Error('登录响应格式错误');
            }

            const { token, user, profile } = response.data;
            if (!token) {
                throw new Error('未获取到token');
            }

            this.token = token;
            this.userInfo = user || profile || {};

            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('user_info', JSON.stringify(this.userInfo));

            this.updateUI();
            this.closeAuthModal();
            utils.showToast('登录成功', 'success');
            if (window.router) window.router.navigate('writing');
            setTimeout(() => this.refreshUserInfo(), 500);
            return true;
        } catch (error) {
            console.error('验证码登录失败:', error);
            utils.showToast(error.message || '登录失败', 'error');
            return false;
        } finally {
            utils.hideLoading();
        }
    }

    async register(phone, password, code) {
        try {
            utils.showLoading();
            const response = await api.register(phone, password, code);
            
            if (!response || !response.data) {
                throw new Error('注册响应格式错误');
            }
            
            const { token, user, profile } = response.data;
            
            if (!token) {
                throw new Error('未获取到token');
            }
            
            this.token = token;
            this.userInfo = user || profile || {};
            
            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('user_info', JSON.stringify(this.userInfo));
            
            this.updateUI();
            this.closeAuthModal();
            utils.showToast('注册成功', 'success');
            if (window.router) window.router.navigate('writing');
            setTimeout(() => this.refreshUserInfo(), 500);
            return true;
        } catch (error) {
            console.error('注册失败:', error);
            utils.showToast(error.message || '注册失败', 'error');
            return false;
        } finally {
            utils.hideLoading();
        }
    }

    logout() {
        if (window.closeAccountMenu) window.closeAccountMenu();
        this.token = null;
        this.userInfo = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_info');
        localStorage.removeItem('user_credits');
        this.updateUI();
        window.router.navigate('home');
        utils.showToast('已退出登录', 'success');
    }

    async refreshUserInfo() {
        try {
            const response = await api.getUserInfo();
            // /user/profile 返回 { data: { userInfo: {...} } }
            const info = (response && response.data)
                ? (response.data.userInfo || response.data.user || response.data)
                : null;
            if (info && info.id) {
                // 合并积分字段，确保 credits 正确
                this.userInfo = Object.assign({}, this.userInfo || {}, info);
                if (info.credits !== undefined) this.userInfo.credits = info.credits;
                localStorage.setItem('user_info', JSON.stringify(this.userInfo));
                localStorage.setItem('user_credits', String(this.userInfo.credits || 0));
                this.updateUI();
                console.log('用户信息已刷新, credits=', this.userInfo.credits);
            }
        } catch (error) {
            console.error('刷新用户信息失败:', error);
            // 401由api.js统一处理，这里不重复处理
        }
    }

    updateUI() {
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const username = document.getElementById('username');
        const userCredits = document.getElementById('userCredits');
        const avatarLetter = document.getElementById('accountAvatarLetter');
        const inviteCode = document.getElementById('navInviteCode');
        const homeNavLink = document.querySelector('.nav-link[data-page="home"]');
        const authOnlyLinks = document.querySelectorAll('.nav-link[data-auth-only]');

        if (!loginBtn || !userInfo) {
            return;
        }

        if (this.isLoggedIn()) {
            if (homeNavLink) homeNavLink.style.display = 'none';
            authOnlyLinks.forEach(link => { link.style.display = ''; });
            loginBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            const displayName = this.userInfo.nickname || this.userInfo.phone || '用户';
            if (username) username.textContent = displayName;
            if (userCredits) userCredits.textContent = this.userInfo.credits || 0;
            if (avatarLetter) avatarLetter.textContent = String(displayName).trim().charAt(0).toUpperCase() || '用';
            if (inviteCode) inviteCode.textContent = this.userInfo.inviteCode || '--';
        } else {
            if (homeNavLink) homeNavLink.style.display = '';
            authOnlyLinks.forEach(link => { link.style.display = 'none'; });
            if (window.closeAccountMenu) window.closeAccountMenu();
            loginBtn.style.display = 'block';
            userInfo.style.display = 'none';
        }
    }

    isLoggedIn() {
        return !!(this.token && this.userInfo && this.userInfo.id);
    }

    getUserInfo() {
        return this.userInfo || {};
    }

    getCredits() {
        return this.userInfo?.credits || 0;
    }

    requireLogin() {
        if (!this.isLoggedIn()) {
            this.showAuthModal();
            return false;
        }
        return true;
    }

    showAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    closeAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
}

const auth = new Auth();
window.auth = auth;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Auth: 开始绑定事件');
    auth.updateUI();

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => auth.showAuthModal());
    }

    const accountMenuButton = document.getElementById('accountMenuButton');
    const accountMenu = document.getElementById('accountMenu');
    const copyNavInviteCode = document.getElementById('copyNavInviteCode');
    const accountLogoutButton = document.getElementById('accountLogoutButton');

    window.closeAccountMenu = function() {
        if (accountMenu) accountMenu.setAttribute('hidden', '');
        if (accountMenuButton) accountMenuButton.setAttribute('aria-expanded', 'false');
    };

    if (accountMenuButton && accountMenu) {
        accountMenuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            const willOpen = accountMenu.hasAttribute('hidden');
            if (willOpen) accountMenu.removeAttribute('hidden');
            else accountMenu.setAttribute('hidden', '');
            accountMenuButton.setAttribute('aria-expanded', String(willOpen));
        });
        accountMenu.addEventListener('click', (event) => event.stopPropagation());
        document.addEventListener('click', () => window.closeAccountMenu());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') window.closeAccountMenu();
        });
    }

    if (copyNavInviteCode) {
        copyNavInviteCode.addEventListener('click', async () => {
            const codeElement = document.getElementById('navInviteCode');
            const code = codeElement ? codeElement.textContent.trim() : '';
            if (!code || code === '--') {
                utils.showToast('暂无可复制的邀请码', 'error');
                return;
            }
            try {
                await navigator.clipboard.writeText(code);
                utils.showToast('邀请码已复制', 'success');
            } catch (error) {
                utils.showToast('复制失败，请手动复制', 'error');
            }
        });
    }

    if (accountLogoutButton) {
        accountLogoutButton.addEventListener('click', () => {
            if (confirm('确定要退出登录吗？')) auth.logout();
        });
    }

    const modalClose = document.getElementById('modalClose');
    if (modalClose) {
        modalClose.addEventListener('click', () => auth.closeAuthModal());
    }

    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target.id === 'authModal') auth.closeAuthModal();
        });
    }

    const modalContent = document.querySelector('#authModal .modal-content');
    if (modalContent) {
        modalContent.addEventListener('click', (e) => e.stopPropagation());
    }

    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            const targetForm = document.getElementById(tabName + 'Form');
            if (targetForm) targetForm.classList.add('active');
        });
    });

    const loginForm = document.getElementById('loginForm');
    const smsLoginBtn = document.getElementById('smsLoginBtn');
    const loginPasswordGroup = document.getElementById('loginPasswordGroup');
    const loginCodeGroup = document.getElementById('loginCodeGroup');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginCodeInput = document.getElementById('loginCode');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const sendLoginCodeBtn = document.getElementById('sendLoginCodeBtn');

    function setLoginMode(mode) {
        if (!loginForm) return;
        loginForm.dataset.mode = mode;
        const isSms = mode === 'sms';
        if (loginPasswordGroup) loginPasswordGroup.style.display = isSms ? 'none' : 'block';
        if (loginCodeGroup) loginCodeGroup.style.display = isSms ? 'block' : 'none';
        if (loginPasswordInput) loginPasswordInput.required = !isSms;
        if (loginCodeInput) loginCodeInput.required = isSms;
        if (smsLoginBtn) smsLoginBtn.textContent = isSms ? '密码登录' : '验证码登录';
        if (loginSubmitBtn) loginSubmitBtn.textContent = isSms ? '验证码登录' : '登录';
    }

    setLoginMode('password');

    if (smsLoginBtn) {
        smsLoginBtn.addEventListener('click', () => {
            const mode = loginForm && loginForm.dataset.mode === 'sms' ? 'password' : 'sms';
            setLoginMode(mode);
        });
    }

    let loginCodeTimer = null;
    if (sendLoginCodeBtn) {
        sendLoginCodeBtn.addEventListener('click', async () => {
            const phone = document.getElementById('loginPhone').value.trim();
            if (!phone || phone.length !== 11) {
                utils.showToast('请输入正确的手机号', 'error');
                return;
            }
            if (sendLoginCodeBtn.disabled) return;

            try {
                utils.showLoading();
                await api.sendSms(phone, 'login');
                utils.showToast('验证码已发送', 'success');
                let countdown = 60;
                sendLoginCodeBtn.disabled = true;
                sendLoginCodeBtn.textContent = countdown + '秒后重试';
                loginCodeTimer = setInterval(() => {
                    countdown--;
                    if (countdown <= 0) {
                        clearInterval(loginCodeTimer);
                        sendLoginCodeBtn.disabled = false;
                        sendLoginCodeBtn.textContent = '发送验证码';
                    } else {
                        sendLoginCodeBtn.textContent = countdown + '秒后重试';
                    }
                }, 1000);
            } catch (error) {
                utils.showToast(error.message || '发送失败', 'error');
            } finally {
                utils.hideLoading();
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('loginPhone').value.trim();
            const mode = loginForm.dataset.mode || 'password';
            
            if (!phone || phone.length !== 11) {
                utils.showToast('请输入正确的手机号', 'error');
                return;
            }

            if (mode === 'sms') {
                const code = (document.getElementById('loginCode') || {}).value?.trim() || '';
                if (!code || code.length !== 6) {
                    utils.showToast('请输入6位验证码', 'error');
                    return;
                }
                await auth.loginByCode(phone, code);
                return;
            }

            const password = document.getElementById('loginPassword').value;
            if (!password || password.length < 6) {
                utils.showToast('密码长度至少6位', 'error');
                return;
            }
            
            await auth.login(phone, password);
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('registerPhone').value.trim();
            const code = document.getElementById('registerCode').value.trim();
            const password = document.getElementById('registerPassword').value;
            const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
            
            if (!phone || phone.length !== 11) {
                utils.showToast('请输入正确的手机号', 'error');
                return;
            }
            
            if (!code || code.length !== 6) {
                utils.showToast('请输入6位验证码', 'error');
                return;
            }
            
            if (!password || password.length < 6) {
                utils.showToast('密码长度至少6位', 'error');
                return;
            }
            
            if (password !== passwordConfirm) {
                utils.showToast('两次密码输入不一致', 'error');
                return;
            }

            const agreeEl = document.getElementById('registerAgree');
            if (!agreeEl || !agreeEl.checked) {
                utils.showToast('请阅读并同意用户协议与隐私政策', 'error');
                return;
            }
            
            await auth.register(phone, password, code);
        });
    }

    let codeTimer = null;
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    if (sendCodeBtn) {
        sendCodeBtn.addEventListener('click', async () => {
            const phone = document.getElementById('registerPhone').value.trim();
            
            if (!phone || phone.length !== 11) {
                utils.showToast('请输入正确的手机号', 'error');
                return;
            }
            
            if (sendCodeBtn.disabled) return;
            
            try {
                utils.showLoading();
                await api.sendSms(phone, 'register');
                utils.showToast('验证码已发送', 'success');
                
                let countdown = 60;
                sendCodeBtn.disabled = true;
                sendCodeBtn.textContent = countdown + '秒后重试';
                
                codeTimer = setInterval(() => {
                    countdown--;
                    if (countdown <= 0) {
                        clearInterval(codeTimer);
                        sendCodeBtn.disabled = false;
                        sendCodeBtn.textContent = '发送验证码';
                    } else {
                        sendCodeBtn.textContent = countdown + '秒后重试';
                    }
                }, 1000);
            } catch (error) {
                utils.showToast(error.message, 'error');
            } finally {
                utils.hideLoading();
            }
        });
    }

    console.log('Auth: 事件绑定完成');
});
