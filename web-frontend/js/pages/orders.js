router.register('orders', function() {
    buildOrdersUI();
    if (auth.isLoggedIn()) {
        auth.refreshUserInfo().then(function() {
            var ce = document.getElementById('ordersCredits');
            if (ce) ce.textContent = auth.getCredits();
        }).catch(function() {});
    }
});

function getOrdersDefaultTab() {
    try { return localStorage.getItem('ordersDefaultTab') || 'orders'; } catch (e) { return 'orders'; }
}

function setOrdersDefaultTab(tab) {
    try { localStorage.setItem('ordersDefaultTab', tab); } catch (e) {}
}

function goToRechargeTab() {
    setOrdersDefaultTab('recharge');
    router.navigate('orders');
}

function buildOrdersUI() {
    var credits = auth.getCredits();
    var mc = document.getElementById('mainContent');
    mc.innerHTML =
        '<div class="orders-page" style="min-height:100vh;background:#080b14;position:relative;overflow:hidden;padding-bottom:80px;">'
        + '<div class="orders-bg" style="position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 20% 10%,rgba(99,102,241,.12) 0%,transparent 60%),radial-gradient(ellipse 60% 50% at 80% 80%,rgba(139,92,246,.08) 0%,transparent 55%)"></div>'
        + '<div class="orders-orb" style="position:fixed;width:460px;height:460px;border-radius:50%;filter:blur(80px);pointer-events:none;z-index:0;top:-80px;right:-60px;background:radial-gradient(circle,rgba(99,102,241,.12),transparent 70%);"></div>'
        + '<style>'
        + '.otab{padding:9px 22px;border-radius:22px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;}'
        + '.otab.on{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 4px 14px rgba(99,102,241,.4);}'
        + '.otab:not(.on){background:rgba(255,255,255,.05);color:rgba(255,255,255,.45);border:1.5px solid rgba(255,255,255,.08);}'
        + '.otab:not(.on):hover{background:rgba(99,102,241,.12);color:#a5b4fc;border-color:rgba(99,102,241,.3);}'
        + '.pkg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:28px;}'
        + '@media(max-width:900px){.pkg-grid{grid-template-columns:repeat(2,1fr);}}'
        + '@media(max-width:560px){.pkg-grid{grid-template-columns:1fr;}}'
        + '.pkgcard{background:rgba(255,255,255,.03);border-radius:20px;padding:28px 22px 22px;border:1.5px solid rgba(255,255,255,.08);cursor:default;transition:all .28s;box-shadow:0 4px 24px rgba(0,0,0,.3);position:relative;overflow:hidden;backdrop-filter:blur(12px);display:flex;flex-direction:column;}'
        + '.pkgcard:hover{border-color:rgba(99,102,241,.4);transform:translateY(-5px);box-shadow:0 18px 44px rgba(99,102,241,.18);background:rgba(99,102,241,.06);}'
        + '.pkgcard.popular{border-color:rgba(99,102,241,.5);background:linear-gradient(145deg,rgba(99,102,241,.11),rgba(139,92,246,.07));box-shadow:0 8px 36px rgba(99,102,241,.22);}'
        + '.pkgcard.free-card{border-color:rgba(16,185,129,.3);background:linear-gradient(145deg,rgba(16,185,129,.07),rgba(5,150,105,.04));}'
        + '.pkgcard.free-card:hover{border-color:rgba(16,185,129,.5);box-shadow:0 18px 44px rgba(16,185,129,.14);background:rgba(16,185,129,.07);}'
        + '.pkgcard.used{opacity:0.5;pointer-events:none;}'
        + '.pkg-tag{position:absolute;top:14px;right:14px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;}'
        + '.pkg-tag.hot{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;}'
        + '.pkg-tag.free{background:linear-gradient(135deg,#10b981,#059669);color:#fff;left:14px;right:auto;}'
        + '.pkg-icon{font-size:30px;margin-bottom:10px;}'
        + '.pkg-name{font-size:16px;font-weight:700;color:#f0f4ff;margin-bottom:12px;}'
        + '.pkg-credits-row{display:flex;align-items:baseline;gap:4px;margin-bottom:6px;}'
        + '.pkg-credits-num{font-size:42px;font-weight:900;color:#a5b4fc;letter-spacing:-2px;line-height:1;}'
        + '.pkg-credits-label{font-size:13px;color:rgba(255,255,255,.4);font-weight:500;}'
        + '.pkg-desc{font-size:12px;color:rgba(255,255,255,.32);margin-bottom:18px;flex:1;}'
        + '.pkg-divider{height:1px;background:rgba(255,255,255,.07);margin-bottom:16px;}'
        + '.pkg-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;}'
        + '.pkg-price{font-size:20px;font-weight:800;}'
        + '.pkg-price.paid{color:#f0f4ff;}'
        + '.pkg-price.gratis{color:#10b981;font-size:16px;}'
        + '.pkg-buy-btn{padding:9px 20px;border-radius:12px;font-size:14px;font-weight:700;border:none;cursor:pointer;transition:all .2s;white-space:nowrap;}'
        + '.pkg-buy-btn.primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;}'
        + '.pkg-buy-btn.primary:hover{opacity:.88;transform:translateY(-1px);box-shadow:0 6px 18px rgba(99,102,241,.4);}'
        + '.pkg-buy-btn.green{background:linear-gradient(135deg,#10b981,#059669);color:#fff;}'
        + '.pkg-buy-btn.green:hover{opacity:.88;transform:translateY(-1px);box-shadow:0 6px 18px rgba(16,185,129,.35);}'
        + '.pkg-buy-btn.used{background:rgba(255,255,255,.07);color:rgba(255,255,255,.28);cursor:not-allowed;}'
        + '</style>'
        + '<div class="orders-wrap" style="position:relative;z-index:1;max-width:960px;margin:0 auto;padding:52px 24px 40px;">'
        + '<div class="orders-header" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:32px;">'
        + '<div>'
        + '<div class="orders-eyebrow" style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;background:rgba(99,102,241,.14);border:1px solid rgba(99,102,241,.28);font-size:10px;font-weight:700;letter-spacing:.14em;color:#a5b4fc;margin-bottom:10px;"><span style="width:5px;height:5px;border-radius:50%;background:#818cf8;box-shadow:0 0 7px #818cf8;"></span>订单中心</div>'
        + '<h1 class="orders-title" style="font-size:34px;font-weight:800;margin:0 0 6px;letter-spacing:-.8px;background:linear-gradient(135deg,#fff 30%,#a5b4fc 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">积分与订单</h1>'
        + '<p class="orders-subtitle" style="font-size:14px;color:rgba(255,255,255,.3);margin:0;">查看消费记录，购买与管理积分</p>'
        + '</div>'
        + '<div class="orders-credits" style="display:flex;align-items:center;gap:7px;padding:9px 18px;border-radius:50px;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.2);font-size:16px;font-weight:800;color:#fbbf24;white-space:nowrap;">'
        + '<i class="fas fa-coins" style="font-size:14px;"></i><span id="ordersCredits">' + credits + '</span><span class="orders-credits-label" style="font-size:11px;color:rgba(255,255,255,.32);font-weight:400;">\u79ef\u5206</span>'
        + '</div></div>'
        + '<div class="orders-tabs" style="display:flex;gap:8px;margin-bottom:12px;">'
        + '<button class="otab on" id="otab1" onclick="oTab(\'orders\')"><i class="fas fa-receipt"></i> \u8ba2\u5355\u8bb0\u5f55</button>'
        + '<button class="otab" id="otab2" onclick="oTab(\'recharge\')"><i class="fas fa-coins"></i> &#20805;&#20540;&#31215;&#20998;</button>'
        + '</div>'
        + '<div id="oOrders" class="orders-panel"><div class="orders-state" style="text-align:center;padding:60px;color:rgba(255,255,255,.3);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div></div>'
        + '<div id="oRecharge" class="orders-panel" style="display:none;"><div class="orders-state" style="text-align:center;padding:60px;color:rgba(255,255,255,.3);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div></div>'
        + '</div></div>';
    var defaultTab = getOrdersDefaultTab();
    oTab(defaultTab === 'recharge' ? 'recharge' : 'orders');
    loadOrders();
    loadPackages();
}

window.oTab = function(t) {
    var activeTab = t === 'recharge' ? 'recharge' : 'orders';
    setOrdersDefaultTab(activeTab);
    document.getElementById('otab1').classList.toggle('on', activeTab === 'orders');
    document.getElementById('otab2').classList.toggle('on', activeTab === 'recharge');
    document.getElementById('oOrders').style.display = activeTab === 'orders' ? 'block' : 'none';
    document.getElementById('oRecharge').style.display = activeTab === 'recharge' ? 'block' : 'none';
};

async function loadOrders() {
    try {
        if (!auth.isLoggedIn()) {
            var guestDiv = document.getElementById('oOrders');
            if (guestDiv) {
                guestDiv.innerHTML = '<div class="orders-empty" style="text-align:center;padding:70px 20px;"><div style="font-size:48px;margin-bottom:16px;">🧭</div><button class="orders-primary-btn" onclick="auth.showAuthModal()" style="padding:10px 22px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">立即登录</button></div>';
            }
            return;
        }
        var r  = await api.getOrders().catch(function(){return null;});
        var r2 = await api.get('/wechat-pay/orders').catch(function(){return null;});
        var orders = [];
        if (r && r.data && Array.isArray(r.data.orders)) orders = r.data.orders;
        else if (r && Array.isArray(r.orders)) orders = r.orders;
        else if (r && Array.isArray(r.data)) orders = r.data;
        if (r2 && r2.data && Array.isArray(r2.data.orders)) {
            var pay = r2.data.orders.map(function(o) {
                return { id:o.orderId, type:'\u79ef\u5206\u5145\u5024', credits:o.credits, amount:o.amount,
                    status:o.status==='paid'?'completed':(o.status==='pending'?'pending':'failed'),
                    created_at:o.createdAt, is_recharge:true };
            });
            orders = orders.concat(pay).sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});
        }
        var div = document.getElementById('oOrders');
        if (!div) return;
        if (!orders.length) {
            div.innerHTML = '<div class="orders-empty" style="text-align:center;padding:70px 20px;"><div style="font-size:48px;margin-bottom:16px;">&#128237;</div>'
                + '<p class="orders-empty-text" style="color:rgba(255,255,255,.35);font-size:14px;margin-bottom:20px;">\u6682\u65e0\u8ba2\u5355</p>'
                + '<button class="orders-primary-btn" onclick="router.navigate(\'writing\')">\u53bb\u521b\u4f5c</button></div>';
            return;
        }
        var tmap = { 'document':'\u521b\u4f5c\u8ba2\u5355','writing':'\u521b\u4f5c\u8ba2\u5355','rewrite':'AI\u964d\u91cd','ai_rewrite':'AI\u964d\u91cd','AI\u964d\u91cd':'AI\u964d\u91cd','\u79ef\u5206\u5145\u5024':'\u79ef\u5206\u5145\u5024' };
        function tl(t) { return tmap[t] || t || '\u670d\u52a1'; }
        function sb(s) {
            var lbl = { completed:'\u5df2\u5b8c\u6210', processing:'\u5904\u7406\u4e2d', failed:'\u5931\u8d25', pending:'\u7b49\u5f85\u652f\u4ed8' };
            var status = s === 'completed' || s === 'processing' || s === 'failed' ? s : 'pending';
            return '<span class="order-status status-' + status + '">'+(lbl[s]||s||'\u672a\u77e5')+'</span>';
        }
        div.innerHTML = orders.map(function(o) {
            var cv = Number(o.credits || o.credits_cost || 0);
            var isRecharge = !!o.is_recharge || /充值|首充|免费积分/.test(String(o.type || ''));
            var rechargeDone = isRecharge && o.status === 'completed';
            var d = o.created_at ? new Date(o.created_at).toLocaleString('zh-CN') : '--';
            var amt = o.amount && Number(o.amount) > 0 ? ' &middot; &yen;' + Number(o.amount).toFixed(2) : '';
            var rightHtml;
            if (isRecharge && !rechargeDone) {
                rightHtml = '<div class="order-points-pending" style="font-size:14px;font-weight:700;color:rgba(255,255,255,.5);">待到账</div><div class="order-points-label" style="font-size:11px;color:rgba(255,255,255,.3);">积分</div>';
            } else {
                var sign = rechargeDone ? '+' : '-';
                var col = rechargeDone ? '#34d399' : '#a5b4fc';
                rightHtml = '<div class="order-points-value' + (rechargeDone ? ' is-positive' : '') + '" style="font-size:22px;font-weight:800;color:' + col + ';">' + sign + cv + '</div><div class="order-points-label" style="font-size:11px;color:rgba(255,255,255,.3);">积分</div>';
            }
            return '<div class="order-card" style="background:rgba(255,255,255,.03);border-radius:14px;padding:18px 22px;margin-bottom:10px;border:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;align-items:center;">'
                + '<div style="flex:1;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><span class="order-card-title" style="font-weight:700;color:#f0f4ff;font-size:14px;">' + tl(o.type) + '</span>' + sb(o.status) + '</div>'
                + '<div class="order-card-meta" style="font-size:12px;color:rgba(255,255,255,.25);">' + d + amt + '</div></div>'
                + '<div style="text-align:right;">' + rightHtml + '</div></div>';
        }).join('');
    } catch(e) {
        var div = document.getElementById('oOrders');
        if (div) div.innerHTML = '<p style="color:#f87171;text-align:center;padding:40px;">' + (e.message || '\u52a0\u8f7d\u5931\u8d25') + '</p>';
    }
}

async function loadPackages() {
    var div = document.getElementById('oRecharge');
    if (!div) return;
    try {
        if (!auth.isLoggedIn()) {
            div.innerHTML = '<div class="orders-empty" style="text-align:center;padding:60px 20px;"><div style="font-size:44px;margin-bottom:12px;">💳</div><p class="orders-empty-text" style="color:rgba(255,255,255,.35);margin-bottom:18px;">登录后可充值并查看积分到账记录</p><button class="orders-primary-btn" onclick="auth.showAuthModal()" style="padding:10px 22px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">立即登录</button></div>';
            return;
        }
        var res = await api.get('/orders/packages');
        var pkgs = (res && res.data) ? res.data : [];
        if (!pkgs.length) {
            div.innerHTML = '<p class="orders-empty-text" style="color:rgba(255,255,255,.35);text-align:center;padding:60px;">\u6682\u65e0\u5957\u9910</p>';
            return;
        }
        var hasFirstRecharge = false;
        try {
            var fr = await api.get('/wechat-pay/check-first-recharge');
            hasFirstRecharge = fr && fr.data && fr.data.hasFirstRecharge;
        } catch(e2) {}
        var icons = ['\ud83c\udf31','\u26a1','\ud83d\udd25','\ud83d\udcce','\ud83d\ude80'];
        var popularIdx = pkgs.findIndex(function(p){ return p.popular; });
        if (popularIdx === -1) {
            var paidPkgs = pkgs.filter(function(p){return Number(p.price)>0;});
            if (paidPkgs.length >= 3) popularIdx = pkgs.indexOf(paidPkgs[2]);
            else if (paidPkgs.length >= 2) popularIdx = pkgs.indexOf(paidPkgs[1]);
        }
        var userInfo = auth.getUserInfo() || {};
        var inviteCode = userInfo.inviteCode || '--';
        var claimableCount = 0;
        try {
            var inviteRes = await api.getInviteStatus();
            if (inviteRes && inviteRes.code === 'SUCCESS' && inviteRes.data) {
                inviteCode = inviteRes.data.inviteCode || inviteCode;
                claimableCount = Number(inviteRes.data.claimableCount || 0);
            }
        } catch(e3) {}
        window.__inviteCode = inviteCode;
        var inviteBtnText = claimableCount > 0 ? '立即领取' : '立即邀请';
        var inviteBtnBg = claimableCount > 0 ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)';
        var inviteCard = '<div class="pkgcard free-card">'
            + '<div class="pkg-tag free">邀请福利</div>'
            + '<div class="pkg-icon">🎁</div>'
            + '<div class="pkg-name">邀请好友再得30积分</div>'
            + '<div class="pkg-credits-row"><span class="pkg-credits-num">30</span><span class="pkg-credits-label">积分</span></div>'
            + '<div class="pkg-desc">好友填写你的邀请码后才可领取。未达成时可先邀请好友，达成后按钮自动变“立即领取”。</div>'
            + '<div class="pkg-divider"></div>'
            + '<div class="pkg-footer"><span class="pkg-price gratis">邀请专享</span>'
            + '<button class="pkg-buy-btn green" style="background:' + inviteBtnBg + ';" onclick="handleInviteAction()">' + inviteBtnText + '</button></div>'
            + '</div>';
        function buildPkgCard(p, i) {
            var isFree = Number(p.price) === 0;
            var isUsed = isFree && hasFirstRecharge;
            var isPopular = i === popularIdx;
            var cardClass = 'pkgcard' + (isPopular ? ' popular' : '') + (isFree ? ' free-card' : '') + (isUsed ? ' used' : '');
            var tagHtml = '';
            if (isFree) tagHtml = '<div class="pkg-tag free">新用户专享</div>';
            else if (isPopular) tagHtml = '<div class="pkg-tag hot">🔥 最受欢迎</div>';
            var priceHtml = isFree
                ? '<span class="pkg-price gratis">完全免费</span>'
                : '<span class="pkg-price paid">&yen;' + Number(p.price).toFixed(2).replace(/\.00$/, '') + '</span>';
            var btnClass = isUsed ? 'pkg-buy-btn used' : (isFree ? 'pkg-buy-btn green' : 'pkg-buy-btn primary');
            var btnText = isUsed ? '已领取' : (isFree ? '立即领取' : '立即充值');
            var btnAttr = isUsed ? 'disabled' : 'onclick="handleBuy(this)"';
            return '<div class="' + cardClass + '">' + tagHtml
                + '<div class="pkg-icon">' + (icons[i] || '💰') + '</div>'
                + '<div class="pkg-name">' + p.name + '</div>'
                + '<div class="pkg-credits-row"><span class="pkg-credits-num">' + Number(p.credits || 0) + '</span><span class="pkg-credits-label">积分</span></div>'
                + '<div class="pkg-desc">' + (p.description || '') + '</div>'
                + '<div class="pkg-divider"></div>'
                + '<div class="pkg-footer">' + priceHtml
                + '<button class="' + btnClass + '" ' + btnAttr
                + ' data-id="' + Number(p.id) + '"'
                + ' data-credits="' + Number(p.credits || 0) + '"'
                + ' data-price="' + Number(p.price || 0) + '"'
                + ' data-name="' + encodeURIComponent(p.name || '') + '">' + btnText + '</button>'
                + '</div></div>';
        }
        var cardParts = [];
        for (var pi = 0; pi < pkgs.length; pi++) {
            cardParts.push(buildPkgCard(pkgs[pi], pi));
            if (pi === 0) {
                cardParts.push(inviteCard);
            }
        }
        if (!pkgs.length) cardParts.push(inviteCard);
        var cards = cardParts.join('');
        div.innerHTML = '<p class="orders-recharge-intro" style="font-size:13px;color:rgba(255,255,255,.35);margin-bottom:20px;">当前充值规则：新用户可免费领取20积分一次；付费套餐按 1 元 = 10 积分到账。</p>'
            + '<div class="pkg-grid">' + cards + '</div>'
            + '<div class="orders-info-card" style="padding:20px 24px;background:rgba(255,255,255,.025);border-radius:16px;border:1px solid rgba(255,255,255,.07);">'
            + '<h3 class="orders-info-title" style="font-size:14px;font-weight:700;color:#f0f4ff;margin:0 0 12px;">积分消耗说明</h3>'
            + '<div class="orders-info-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;color:rgba(255,255,255,.4);">'
            + '<div>📝 学术论文 120分</div><div>📄 开题报告 40分</div>'
            + '<div>📚 文献综述 20分</div><div>🔧 任务书 25分</div>'
            + '<div>🎤 答辩稿 10分</div><div>📋 中期检查 10分</div>'
            + '<div class="orders-info-accent" style="grid-column:1/-1;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);color:#a5b4fc;font-weight:600;">AI降重 180积分/1万字（约18积分/千字）</div>'
            + '</div></div>';
    } catch(e) {
        div.innerHTML = '<p style="color:#f87171;text-align:center;padding:40px;">' + (e.message || '\u52a0\u8f7d\u5931\u8d25') + '</p>';
    }
}

window.handleInviteAction = async function() {
    if (!auth.requireLogin()) return;
    try {
        var statusRes = await api.getInviteStatus();
        var data = (statusRes && statusRes.data) ? statusRes.data : {};
        window.__inviteCode = data.inviteCode || window.__inviteCode || '--';
        var claimableCount = Number(data.claimableCount || 0);
        if (claimableCount > 0) {
            await window.claimInviteRewards();
            await loadPackages();
            return;
        }
        showInviteCodeModal(window.__inviteCode || '--');
    } catch (e) {
        utils.showToast(e.message || '操作失败', 'error');
    }
};

window.showInviteCodeModal = function(inviteCode) {
    var old = document.getElementById('inviteCodeModal');
    if (old) old.remove();
    var modal = document.createElement('div');
    modal.id = 'inviteCodeModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
    modal.innerHTML = '<div style="background:#0f1221;border:1px solid rgba(99,102,241,.4);border-radius:20px;padding:28px 24px;text-align:center;max-width:360px;width:92%;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.6);">'
        + '<button onclick="closeInviteCodeModal()" style="position:absolute;top:12px;right:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>'
        + '<div style="font-size:20px;font-weight:800;color:#f0f4ff;margin-bottom:8px;">邀请好友再得30分</div>'
        + '<p style="font-size:13px;color:rgba(226,232,240,.75);line-height:1.75;margin:0 0 14px;">把邀请码发给好友，好友在“我的页面”填写后，你回到订单页面点击“立即领取”，即可到账30积分。</p>'
        + '<div style="padding:12px;border-radius:12px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.35);margin-bottom:12px;">'
        + '<div style="font-size:12px;color:rgba(255,255,255,.45);margin-bottom:4px;">我的邀请码</div>'
        + '<div id="inviteCodeText" style="font-size:22px;font-weight:800;color:#c4b5fd;letter-spacing:.08em;">' + inviteCode + '</div>'
        + '</div>'
        + '<button onclick="copyInviteCode()" style="padding:10px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">复制邀请码</button>'
        + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeInviteCodeModal(); });
};

window.closeInviteCodeModal = function() {
    var modal = document.getElementById('inviteCodeModal');
    if (modal) modal.remove();
};

window.copyInviteCode = async function() {
    try {
        var textEl = document.getElementById('inviteCodeText');
        var code = textEl ? textEl.textContent.trim() : (window.__inviteCode || '');
        await navigator.clipboard.writeText(code);
        utils.showToast('邀请码已复制', 'success');
    } catch (e) {
        utils.showToast('复制失败，请手动复制', 'error');
    }
};

window.claimInviteRewards = async function() {
    if (!auth.requireLogin()) return;
    try {
        utils.showLoading('领取中...');
        var res = await api.claimInviteRewards();
        utils.hideLoading();
        if (!res || res.code !== 'SUCCESS') throw new Error((res && res.error) || '领取失败');
        var claimed = (res.data && res.data.claimedCredits) || 0;
        if (claimed > 0) {
            utils.showToast('领取成功，+' + claimed + '积分', 'success');
            await auth.refreshUserInfo();
            var ce = document.getElementById('ordersCredits');
            if (ce) ce.textContent = auth.getCredits();
            loadOrders();
            loadPackages();
        } else {
            utils.showToast('暂无可领取邀请奖励', 'success');
        }
    } catch (e) {
        utils.hideLoading();
        utils.showToast(e.message || '领取失败', 'error');
    }
};

window.handleBuy = function(btn) {
    var id      = parseInt(btn.dataset.id);
    var credits = parseInt(btn.dataset.credits);
    var price   = parseFloat(btn.dataset.price);
    var name    = decodeURIComponent(btn.dataset.name);
    buyPackage(id, name, credits, price);
};

window.buyPackage = async function(id, name, credits, price) {
    if (!auth.requireLogin()) return;
    try {
        utils.showLoading('创建订单...');
        var req = {
            packageId: Number(id),
            amount: Number(price),
            credits: Number(credits),
            isFirstTime: Number(price) === 0
        };
        var res = await api.post('/wechat-pay/create-web-order', req);
        utils.hideLoading();
        if (!res || res.code !== 'SUCCESS') throw new Error((res && res.error) || '创建订单失败');
        if (res.data && res.data.free) {
            var arrivedCredits = Number((res.data && res.data.credits) || credits || 0);
            utils.showToast('领取成功！' + arrivedCredits + '积分已到账', 'success');
            await auth.refreshUserInfo();
            buildOrdersUI();
            setTimeout(function() {
                setOrdersDefaultTab('orders');
                oTab('orders');
            }, 300);
            return;
        }
        var paidOrderId = res.data && res.data.orderId;
        var paidCredits = Number((res.data && res.data.credits) || credits || 0);
        var paidAmount = Number((res.data && res.data.amount) || price || 0);
        showPayQrModal(paidOrderId, name, paidCredits, paidAmount, res.data && res.data.codeUrl);
    } catch(e) {
        utils.hideLoading();
        utils.showToast(e.message || '购买失败', 'error');
    }
};

function refreshAfterRechargeOnce() {
    if (window.__rechargeRefreshedOnce) return;
    window.__rechargeRefreshedOnce = true;
    setTimeout(function() {
        window.location.reload();
    }, 900);
}

async function checkRechargeOrderPaid(orderId, fallbackCredits) {
    if (!orderId) return false;
    try {
        var r = await api.get('/wechat-pay/poll-order/' + orderId);
        if (r && r.data && r.data.status === 'paid') {
            utils.showToast('充值成功！' + (r.data.credits || fallbackCredits || '') + '积分已到账', 'success');
            await auth.refreshUserInfo();
            var ce = document.getElementById('ordersCredits');
            if (ce) ce.textContent = auth.getCredits();
            loadOrders();
            refreshAfterRechargeOnce();
            return true;
        }
    } catch(e) {}
    return false;
}

window.closePayModal = async function(orderId, credits) {
    if (window._pollTimer) { clearInterval(window._pollTimer); window._pollTimer = null; }
    var modal = document.getElementById('payQrModal');
    if (modal) modal.remove();
    if (orderId) {
        var paid = await checkRechargeOrderPaid(orderId, credits);
        if (paid) return;
    }
    try {
        await auth.refreshUserInfo();
        var ce = document.getElementById('ordersCredits');
        if (ce) ce.textContent = auth.getCredits();
    } catch(e) {}
    loadOrders();
};

function showPayQrModal(orderId, name, credits, price, codeUrl) {
    var old = document.getElementById('payQrModal');
    if (old) old.remove();
    if (window._pollTimer) { clearInterval(window._pollTimer); window._pollTimer = null; }
    var qrContent = codeUrl
        ? '<div id="qrcode" style="width:200px;height:200px;margin:0 auto 8px;"></div><p style="font-size:12px;color:rgba(255,255,255,.4);margin:0 0 4px;">\u8bf7\u4f7f\u7528\u5fae\u4fe1\u626b\u7801\u652f\u4ed8</p>'
        : '<div style="padding:20px;background:rgba(251,191,36,.08);border-radius:12px;border:1px solid rgba(251,191,36,.2);"><p style="color:#fbbf24;font-size:13px;margin:0;">\u5fae\u4fe1\u652f\u4ed8\u672a\u914d\u7f6e\uff08\u5f00\u53d1\u6a21\u5f0f\uff09</p></div>';
    var modal = document.createElement('div');
    modal.id = 'payQrModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
    modal.innerHTML = '<div style="background:#0f1221;border:1px solid rgba(99,102,241,.4);border-radius:24px;padding:36px 32px 28px;text-align:center;max-width:320px;width:90%;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.6);">'
        + '<button onclick="closePayModal(' + orderId + ',' + credits + ')" style="position:absolute;top:14px;right:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:16px;cursor:pointer;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>'
        + '<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:22px;">\ud83d\udcce</div>'
        + '<div style="font-size:20px;font-weight:800;color:#f0f4ff;margin-bottom:4px;">' + name + '</div>'
        + '<div style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:20px;">' + credits + ' \u79ef\u5206 &nbsp;/&nbsp; <span style="color:#fbbf24;font-weight:700;">&yen;' + price + '</span></div>'
        + qrContent
        + '<div id="payStatus" style="font-size:13px;color:#a5b4fc;margin-top:16px;padding:10px 16px;background:rgba(99,102,241,.08);border-radius:10px;border:1px solid rgba(99,102,241,.15);">\u23f3 \u7b49\u5f85\u652f\u4ed8...</div>'
        + '<p style="font-size:11px;color:rgba(255,255,255,.2);margin:12px 0 0;">\u652f\u4ed8\u5b8c\u6210\u540e\u53ef\u5173\u95ed\u6b64\u7a97\u53e3\uff0c\u79ef\u5206\u5c06\u81ea\u52a8\u5230\u8d26</p>'
        + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closePayModal(orderId, credits); });
    if (codeUrl) {
        var qrEl = document.getElementById('qrcode');
        if (qrEl) {
            var renderQR = function() {
                qrEl.innerHTML = '';
                new QRCode(qrEl, { text: codeUrl, width: 200, height: 200, colorDark:'#000', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M });
            };
            if (window.QRCode) { renderQR(); }
            else {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
                s.onload = renderQR;
                s.onerror = function() { qrEl.innerHTML = '<p style="color:#a5b4fc;font-size:11px;word-break:break-all;padding:8px;">' + codeUrl + '</p>'; };
                document.head.appendChild(s);
            }
        }
    }
    var attempts = 0;
    window._pollTimer = setInterval(async function() {
        attempts++;
        if (attempts > 90) {
            clearInterval(window._pollTimer); window._pollTimer = null;
            var st = document.getElementById('payStatus');
            if (st) st.innerHTML = '\u26a0\ufe0f \u652f\u4ed8\u8d85\u65f6\uff0c\u8bf7\u5173\u95ed\u540e\u91cd\u8bd5';
            return;
        }
        try {
            var r = await api.get('/wechat-pay/poll-order/' + orderId);
            if (r && r.data && r.data.status === 'paid') {
                clearInterval(window._pollTimer); window._pollTimer = null;
                var m = document.getElementById('payQrModal');
                if (m) m.remove();
                utils.showToast('\u5145\u5024\u6210\u529f\uff01' + (r.data.credits || credits) + '\u79ef\u5206\u5df2\u5230\u8d26', 'success');
                await auth.refreshUserInfo();
                var ce = document.getElementById('ordersCredits');
                if (ce) ce.textContent = auth.getCredits();
                loadOrders();
                setOrdersDefaultTab('orders');
                setTimeout(function() { oTab('orders'); }, 300);
                refreshAfterRechargeOnce();
            } else {
                var st2 = document.getElementById('payStatus');
                if (st2) st2.innerHTML = '\u23f3 \u7b49\u5f85\u652f\u4ed8... (' + attempts + '/90)';
            }
        } catch(e) {}
    }, 2000);
}
