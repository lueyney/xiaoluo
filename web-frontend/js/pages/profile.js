function escapeProfileText(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

router.register('profile', function() {
    const mainContent = document.getElementById('mainContent');

    (async function() {
        if (!auth.isLoggedIn()) {
            mainContent.innerHTML = `
                <div class="profile-page account-page">
                    <div class="account-guest">
                        <span class="account-guest-icon"><i class="fas fa-user"></i></span>
                        <h1>登录后管理你的账户</h1>
                        <p>查看积分、文档、订单与邀请奖励。</p>
                        <button type="button" class="account-primary-btn" onclick="auth.showAuthModal()">立即登录</button>
                    </div>
                </div>`;
            return;
        }

        try { await auth.refreshUserInfo(); } catch (e) {}

        const userInfo = auth.getUserInfo() || {};
        const credits = Math.max(0, Number(userInfo.credits || 0));
        const rawName = userInfo.nickname || userInfo.phone || '小珞用户';
        const displayName = escapeProfileText(rawName);
        const phone = escapeProfileText(userInfo.phone || '--');
        const avatar = escapeProfileText(String(rawName).charAt(0).toUpperCase() || 'U');
        const joinDate = userInfo.created_at ? new Date(userInfo.created_at).toLocaleDateString('zh-CN') : '--';
        const inviteCode = escapeProfileText(userInfo.inviteCode || '--');
        const inviteUsed = !!userInfo.hasUsedInvite;

        mainContent.innerHTML = `
<div class="profile-page account-page">
    <div class="account-shell">
        <header class="account-header">
            <div>
                <span class="account-kicker">账户中心</span>
                <h1>我的账户</h1>
                <p>管理积分、内容和订单。</p>
            </div>
            <div class="account-support-wrap">
                <button type="button" class="account-support-btn" onclick="toggleContactQr()" aria-controls="contactQrPanel" aria-expanded="false">
                    <i class="fas fa-headset"></i><span>联系客服</span>
                </button>
                <div class="account-qr-panel" id="contactQrPanel" hidden>
                    <img src="assets/contact-wechat-qr.jpg" alt="联系客服二维码">
                    <strong>微信扫码联系</strong>
                </div>
            </div>
        </header>

        <section class="account-overview" aria-label="账户概览">
            <div class="account-identity">
                <div class="account-avatar">${avatar}</div>
                <div class="account-identity-copy">
                    <div class="account-name-row">
                        <h2>${displayName}</h2>
                        <span class="account-status"><i class="fas fa-circle-check"></i> 账户正常</span>
                    </div>
                    <p><i class="fas fa-mobile-screen-button"></i> ${phone}</p>
                    <small>加入时间 ${escapeProfileText(joinDate)}</small>
                </div>
            </div>
            <div class="account-balance">
                <span>可用积分</span>
                <strong>${credits.toLocaleString('zh-CN')}</strong>
                <button type="button" onclick="goToRechargeTab()">充值积分 <i class="fas fa-arrow-right"></i></button>
            </div>
        </section>

        <nav class="account-actions" aria-label="常用功能">
            <button type="button" class="account-action account-action-primary" onclick="router.navigate('writing')">
                <span class="account-action-icon"><i class="fas fa-pen-nib"></i></span>
                <span><strong>开始创作</strong><small>论文与学术材料</small></span>
                <i class="fas fa-arrow-right account-action-arrow"></i>
            </button>
            <button type="button" class="account-action" onclick="router.navigate('rewrite')">
                <span class="account-action-icon"><i class="fas fa-wand-magic-sparkles"></i></span>
                <span><strong>文本降重</strong><small>优化表达与重复率</small></span>
                <i class="fas fa-arrow-right account-action-arrow"></i>
            </button>
            <button type="button" class="account-action" onclick="router.navigate('library')">
                <span class="account-action-icon"><i class="fas fa-folder-open"></i></span>
                <span><strong>文档库</strong><small>查看生成内容</small></span>
                <i class="fas fa-arrow-right account-action-arrow"></i>
            </button>
            <button type="button" class="account-action" onclick="router.navigate('orders')">
                <span class="account-action-icon"><i class="fas fa-receipt"></i></span>
                <span><strong>订单记录</strong><small>消费与充值明细</small></span>
                <i class="fas fa-arrow-right account-action-arrow"></i>
            </button>
        </nav>

        <div class="account-content-grid">
            <section class="account-panel account-pricing-panel">
                <div class="account-panel-head">
                    <div><h2>积分规则</h2><p>生成前会显示本次预计消耗。</p></div>
                    <button type="button" class="account-text-btn" onclick="goToRechargeTab()">查看套餐 <i class="fas fa-chevron-right"></i></button>
                </div>
                <div class="account-price-grid">
                    <div><span class="account-price-icon"><i class="fas fa-file-lines"></i></span><span><strong>学术论文</strong><small>完整论文写作</small></span><b>120</b></div>
                    <div><span class="account-price-icon"><i class="fas fa-file-circle-question"></i></span><span><strong>开题报告</strong><small>选题与研究方案</small></span><b>40</b></div>
                    <div><span class="account-price-icon"><i class="fas fa-book-open"></i></span><span><strong>文献综述</strong><small>研究脉络整理</small></span><b>20</b></div>
                    <div><span class="account-price-icon"><i class="fas fa-list-check"></i></span><span><strong>任务书</strong><small>任务与进度规划</small></span><b>25</b></div>
                    <div><span class="account-price-icon"><i class="fas fa-microphone-lines"></i></span><span><strong>答辩稿</strong><small>陈述与答辩准备</small></span><b>10</b></div>
                    <div><span class="account-price-icon"><i class="fas fa-clipboard-check"></i></span><span><strong>中期检查</strong><small>进展总结材料</small></span><b>10</b></div>
                </div>
                <div class="account-rewrite-price">
                    <span><i class="fas fa-wand-magic-sparkles"></i><strong>文本降重</strong></span>
                    <span><b>18</b> 积分 / 千字</span>
                </div>
            </section>

            <aside class="account-side-stack">
                <section class="account-panel account-invite-panel">
                    <div class="account-panel-head compact">
                        <div><h2>邀请奖励</h2><p>好友填写后，你可领取 30 积分。</p></div>
                        <span class="account-reward-badge">+30</span>
                    </div>
                    <label>我的邀请码</label>
                    <div class="account-code-row">
                        <code id="profileInviteCode">${inviteCode}</code>
                        <button type="button" onclick="copyProfileInviteCode()"><i class="fas fa-copy"></i> 复制</button>
                    </div>
                    ${inviteUsed ? `
                        <div class="account-invite-complete"><i class="fas fa-circle-check"></i><span><strong>已填写邀请码</strong><small>该权益每个账户仅可使用一次</small></span></div>
                    ` : `
                        <div class="account-bind-row">
                            <input class="profile-input" id="inviteCodeInput" type="text" maxlength="20" autocomplete="off" placeholder="填写好友邀请码">
                            <button type="button" class="profile-submit-btn" onclick="bindInviteCode()">提交</button>
                        </div>
                    `}
                </section>

                <section class="account-panel account-service-panel">
                    <h2>账户服务</h2>
                    <button type="button" onclick="toggleContactQr()"><span><i class="fas fa-headset"></i> 联系客服</span><i class="fas fa-chevron-right"></i></button>
                    <div class="account-security-row"><span><i class="fas fa-shield-halved"></i> 内容与账户信息仅用于当前服务</span><i class="fas fa-lock"></i></div>
                    <button type="button" class="account-logout-btn" onclick="if(confirm('确定要退出登录吗？'))auth.logout()"><span><i class="fas fa-arrow-right-from-bracket"></i> 退出登录</span></button>
                </section>
            </aside>
        </div>
    </div>
</div>`;
    })();
});

window.toggleContactQr = function() {
    var panel = document.getElementById('contactQrPanel');
    var button = document.querySelector('.account-support-btn');
    if (!panel) return;
    var willOpen = panel.hasAttribute('hidden');
    if (willOpen) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
    if (button) button.setAttribute('aria-expanded', String(willOpen));
};

window.copyProfileInviteCode = async function() {
    var codeEl = document.getElementById('profileInviteCode');
    var code = codeEl ? codeEl.textContent.trim() : '';
    if (!code || code === '--') {
        utils.showToast('暂无可复制的邀请码', 'error');
        return;
    }
    try {
        await navigator.clipboard.writeText(code);
        utils.showToast('邀请码已复制', 'success');
    } catch (e) {
        utils.showToast('复制失败，请手动复制', 'error');
    }
};

window.bindInviteCode = async function() {
    if (!auth.requireLogin()) return;
    var input = document.getElementById('inviteCodeInput');
    if (!input || input.disabled) return;
    var code = (input.value || '').trim();
    if (!code) {
        utils.showToast('请输入邀请码', 'error');
        input.focus();
        return;
    }
    try {
        input.disabled = true;
        utils.showLoading('提交中...');
        var res = await api.bindInviteCode(code);
        utils.hideLoading();
        if (!res || res.code !== 'SUCCESS') throw new Error((res && res.error) || '提交失败');
        utils.showToast((res && res.message) || '邀请码绑定成功', 'success');
        await auth.refreshUserInfo();
        router.navigate('profile');
    } catch (e) {
        input.disabled = false;
        utils.hideLoading();
        utils.showToast(e.message || '提交失败', 'error');
    }
};
