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
            const response = await api.login(phone, password);
            
            // 适配后端响应格式: {message, code, data: {token, user}}
            if (!response || !response.data) {
                throw new Error('登录响应格式错误');
            }
            
            const { token, user, profile, isNewUser } = response.data;
            
            if (!token) {
                throw new Error('未获取到token');
            }
            
            this.token = token;
            this.userInfo = user || profile || {};
            
            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('user_info', JSON.stringify(this.userInfo));
            
            this.updateUI();
            this.closeAuthModal();
            utils.showToast(isNewUser ? '账户已自动创建，欢迎来到小珞' : '登录成功', 'success');
            if (window.router) window.router.navigate('writing');
            
            setTimeout(() => this.refreshUserInfo(), 500);
            
            return true;
        } catch (error) {
            console.error('登录失败:', error);
            utils.showToast(error.message || '登录失败', 'error');
            return false;
        }
    }

    async loginByCode(phone, code) {
        try {
            const response = await api.post('/auth/login', { phone, code });
            if (!response || !response.data) {
                throw new Error('登录响应格式错误');
            }

            const { token, user, profile, isNewUser } = response.data;
            if (!token) {
                throw new Error('未获取到token');
            }

            this.token = token;
            this.userInfo = user || profile || {};

            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('user_info', JSON.stringify(this.userInfo));

            this.updateUI();
            this.closeAuthModal();
            utils.showToast(isNewUser ? '账户已自动创建，欢迎来到小珞' : '登录成功', 'success');
            if (window.router) window.router.navigate('writing');
            setTimeout(() => this.refreshUserInfo(), 500);
            return true;
        } catch (error) {
            console.error('验证码登录失败:', error);
            utils.showToast(error.message || '登录失败', 'error');
            return false;
        }
    }

    async register(phone, code) {
        try {
            const response = await api.register(phone, code);
            
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
            utils.showToast('验证成功，已登录', 'success');
            if (window.router) window.router.navigate('writing');
            setTimeout(() => this.refreshUserInfo(), 500);
            return true;
        } catch (error) {
            console.error('注册失败:', error);
            utils.showToast(error.message || '注册失败', 'error');
            return false;
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
        window.router.navigate('writing');
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
        const authOnlyLinks = document.querySelectorAll('.nav-link[data-auth-only]');

        if (!loginBtn || !userInfo) {
            return;
        }

        if (this.isLoggedIn()) {
            authOnlyLinks.forEach(link => { link.style.display = ''; });
            loginBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            const displayName = this.userInfo.nickname || this.userInfo.phone || '用户';
            if (username) username.textContent = displayName;
            if (userCredits) userCredits.textContent = this.userInfo.credits || 0;
            if (avatarLetter) avatarLetter.textContent = String(displayName).trim().charAt(0).toUpperCase() || '用';
            if (inviteCode) inviteCode.textContent = this.userInfo.inviteCode || '--';
        } else {
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
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('auth-modal-open');
            window.setTimeout(() => {
                const activeForm = modal.querySelector('.auth-form.active');
                const firstInput = activeForm && activeForm.querySelector('input:not([type="checkbox"])');
                if (firstInput) firstInput.focus();
            }, 120);
        }
    }

    closeAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('auth-modal-open');
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
    let authReturnFocus = null;
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target.id === 'authModal') auth.closeAuthModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && authModal.classList.contains('active')) auth.closeAuthModal();

            if (e.key === 'Tab' && authModal.classList.contains('active')) {
                const focusable = Array.from(authModal.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
                    .filter(element => element.offsetParent !== null);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
    }

    const originalShowAuthModal = auth.showAuthModal.bind(auth);
    auth.showAuthModal = function() {
        authReturnFocus = document.activeElement;
        originalShowAuthModal();
    };

    const originalCloseAuthModal = auth.closeAuthModal.bind(auth);
    auth.closeAuthModal = function() {
        const wasOpen = authModal && authModal.classList.contains('active');
        originalCloseAuthModal();
        if (wasOpen && authReturnFocus && typeof authReturnFocus.focus === 'function') {
            window.setTimeout(() => authReturnFocus.focus(), 0);
        }
    };

    const modalContent = document.querySelector('#authModal .modal-content');
    if (modalContent) {
        modalContent.addEventListener('click', (e) => e.stopPropagation());
    }

    const accountTabs = Array.from(document.querySelectorAll('.auth-tab'));

    function activateAccountTab(tab, focusInput = true) {
        if (!tab) return;
        const tabName = tab.dataset.tab;
        if (authModal) authModal.setAttribute('aria-label', tabName === 'register' ? '注册账户' : '登录账户');
        accountTabs.forEach(t => {
            const isActive = t === tab;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', String(isActive));
            t.tabIndex = isActive ? 0 : -1;
        });
        document.querySelectorAll('.auth-form').forEach(form => {
            const isActive = form.id === tabName + 'Form';
            form.classList.toggle('active', isActive);
            form.setAttribute('aria-hidden', String(!isActive));
        });
        const targetForm = document.getElementById(tabName + 'Form');
        setFormMessage(tabName + 'Form', '');
        if (targetForm && focusInput) {
            const firstInput = targetForm.querySelector('input:not([type="checkbox"])');
            if (firstInput) window.setTimeout(() => firstInput.focus(), 80);
        }
    }

    accountTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activateAccountTab(tab);
        });
        tab.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = accountTabs.indexOf(tab);
            let nextIndex = currentIndex;
            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % accountTabs.length;
            if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + accountTabs.length) % accountTabs.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = accountTabs.length - 1;
            const nextTab = accountTabs[nextIndex];
            activateAccountTab(nextTab, false);
            nextTab.focus();
        });
    });

    activateAccountTab(accountTabs.find(tab => tab.classList.contains('active')) || accountTabs[0], false);

    function setFieldMessage(inputId, message, type = 'error') {
        const input = document.getElementById(inputId);
        const group = input && input.closest('.form-group');
        const messageElement = document.getElementById(inputId + 'Error');
        if (!group || !messageElement) return;
        group.classList.toggle('has-error', Boolean(message) && type === 'error');
        messageElement.classList.toggle('auth-field-hint', type === 'hint');
        messageElement.textContent = message || '';
        if (input) input.setAttribute('aria-invalid', message && type === 'error' ? 'true' : 'false');
    }

    function clearFieldMessage(inputId, hint = '') {
        setFieldMessage(inputId, hint, hint ? 'hint' : 'error');
    }

    function setFormMessage(formId, message) {
        const messageElement = document.getElementById(formId + 'Message');
        if (messageElement) messageElement.textContent = message || '';
    }

    function setSubmitState(button, isBusy, idleLabel) {
        if (!button) return;
        button.disabled = isBusy;
        button.classList.toggle('is-loading', isBusy);
        button.setAttribute('aria-busy', String(isBusy));
        button.textContent = isBusy ? '请稍候...' : idleLabel;
    }

    function setCodeButtonState(button, isBusy, label) {
        if (!button) return;
        button.disabled = isBusy;
        button.classList.toggle('is-loading', isBusy);
        button.setAttribute('aria-busy', String(isBusy));
        button.textContent = label;
    }

    document.querySelectorAll('.auth-form input:not([type="checkbox"])').forEach(input => {
        input.addEventListener('input', () => {
            clearFieldMessage(input.id);
            const form = input.closest('.auth-form');
            if (form) setFormMessage(form.id, '');
        });
    });

    document.querySelectorAll('.auth-password-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const input = document.getElementById(toggle.dataset.target);
            if (!input) return;
            const shouldShow = input.type === 'password';
            input.type = shouldShow ? 'text' : 'password';
            toggle.setAttribute('aria-pressed', String(shouldShow));
            toggle.setAttribute('aria-label', shouldShow ? '隐藏密码' : '显示密码');
            const icon = toggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye', !shouldShow);
                icon.classList.toggle('fa-eye-slash', shouldShow);
            }
            input.focus({ preventScroll: true });
        });
    });

    const loginForm = document.getElementById('loginForm');
    const loginCodeInput = document.getElementById('loginCode');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const sendLoginCodeBtn = document.getElementById('sendLoginCodeBtn');

    ['loginPhone', 'registerPhone', 'loginCode', 'registerCode'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '');
            });
        }
    });

    let loginCodeTimer = null;
    if (sendLoginCodeBtn) {
        sendLoginCodeBtn.addEventListener('click', async () => {
            const phone = document.getElementById('loginPhone').value.trim();
            if (!phone || phone.length !== 11) {
                setFieldMessage('loginPhone', '请输入 11 位手机号');
                document.getElementById('loginPhone').focus();
                utils.showToast('请输入正确的手机号', 'error');
                return;
            }
            if (sendLoginCodeBtn.disabled) return;

            try {
                setFormMessage('loginForm', '');
                setCodeButtonState(sendLoginCodeBtn, true, '发送中...');
                await api.sendSms(phone, 'login');
                utils.showToast('验证码已发送', 'success');
                let countdown = 60;
                setCodeButtonState(sendLoginCodeBtn, true, countdown + '秒后重试');
                loginCodeTimer = setInterval(() => {
                    countdown--;
                    if (countdown <= 0) {
                        clearInterval(loginCodeTimer);
                        setCodeButtonState(sendLoginCodeBtn, false, '重新发送');
                    } else {
                        sendLoginCodeBtn.textContent = countdown + '秒后重试';
                    }
                }, 1000);
            } catch (error) {
                setCodeButtonState(sendLoginCodeBtn, false, '重新发送');
                setFormMessage('loginForm', error.message || '验证码发送失败，请稍后重试');
                utils.showToast(error.message || '发送失败', 'error');
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('loginPhone').value.trim();
            const idleLabel = '验证并进入工作台';
            setFormMessage('loginForm', '');
            
            if (!phone || phone.length !== 11) {
                setFieldMessage('loginPhone', '请输入 11 位手机号');
                document.getElementById('loginPhone').focus();
                utils.showToast('请输入正确的手机号', 'error');
                return;
            }

            const code = loginCodeInput?.value.trim() || '';
            if (!code || code.length !== 6) {
                setFieldMessage('loginCode', '请输入 6 位验证码');
                loginCodeInput?.focus();
                utils.showToast('请输入6位验证码', 'error');
                return;
            }
            setSubmitState(loginSubmitBtn, true, idleLabel);
            const success = await auth.loginByCode(phone, code);
            setSubmitState(loginSubmitBtn, false, idleLabel);
            if (!success) setFormMessage('loginForm', '登录未完成，请检查验证码后重试');
        });
    }

    const registerForm = document.getElementById('registerForm');
    const registerSubmitBtn = document.getElementById('registerSubmitBtn');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            setFormMessage('registerForm', '');
            const phone = document.getElementById('registerPhone').value.trim();
            const code = document.getElementById('registerCode').value.trim();
            
            if (!phone || phone.length !== 11) {
                setFieldMessage('registerPhone', '请输入 11 位手机号');
                document.getElementById('registerPhone').focus();
                utils.showToast('请输入正确的手机号', 'error');
                return;
            }
            
            if (!code || code.length !== 6) {
                setFieldMessage('registerCode', '请输入 6 位验证码');
                document.getElementById('registerCode').focus();
                utils.showToast('请输入6位验证码', 'error');
                return;
            }
            
            const agreeEl = document.getElementById('registerAgree');
            if (!agreeEl || !agreeEl.checked) {
                setFieldMessage('registerAgree', '请先阅读并同意协议');
                if (agreeEl) agreeEl.focus();
                utils.showToast('请阅读并同意用户协议与隐私政策', 'error');
                return;
            }
            
            setSubmitState(registerSubmitBtn, true, '验证并登录');
            const success = await auth.register(phone, code);
            setSubmitState(registerSubmitBtn, false, '验证并登录');
            if (!success) setFormMessage('registerForm', '注册未完成，请检查信息后重试');
        });
    }

    const registerAgree = document.getElementById('registerAgree');
    if (registerAgree) {
        registerAgree.addEventListener('change', () => {
            if (registerAgree.checked) {
                clearFieldMessage('registerAgree');
                setFormMessage('registerForm', '');
            }
        });
    }

    let codeTimer = null;
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    if (sendCodeBtn) {
        sendCodeBtn.addEventListener('click', async () => {
            const phone = document.getElementById('registerPhone').value.trim();
            
            if (!phone || phone.length !== 11) {
                setFieldMessage('registerPhone', '请输入 11 位手机号');
                document.getElementById('registerPhone').focus();
                utils.showToast('请输入正确的手机号', 'error');
                return;
            }
            
            if (sendCodeBtn.disabled) return;
            
            try {
                setFormMessage('registerForm', '');
                setCodeButtonState(sendCodeBtn, true, '发送中...');
                await api.sendSms(phone, 'register');
                utils.showToast('验证码已发送', 'success');
                
                let countdown = 60;
                setCodeButtonState(sendCodeBtn, true, countdown + '秒后重试');
                
                codeTimer = setInterval(() => {
                    countdown--;
                    if (countdown <= 0) {
                        clearInterval(codeTimer);
                        setCodeButtonState(sendCodeBtn, false, '重新发送');
                    } else {
                        sendCodeBtn.textContent = countdown + '秒后重试';
                    }
                }, 1000);
            } catch (error) {
                setCodeButtonState(sendCodeBtn, false, '重新发送');
                setFormMessage('registerForm', error.message || '验证码发送失败，请稍后重试');
                utils.showToast(error.message, 'error');
            }
        });
    }

    console.log('Auth: 事件绑定完成');
});
