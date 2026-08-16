/**
 * 创作页面 — 学术写作与社交发布
 */
(function () {
    'use strict';

    router.register('writing', function () {
        const credits = auth.isLoggedIn() ? auth.getCredits() : 0;
        document.getElementById('mainContent').innerHTML = buildWritingHTML(credits);
        initWritingPage();
    });

    let state = {
        selectedTypes: [], field: '', topic: '', requirements: '',
        isGenerating: false, isGeneratingTitle: false,
        generatedTitles: [], lastOrderId: null,
        pollTimer: null, pollAttempts: 0,
        lastTopic: '', lastDocCount: 0
    };

    function buildWritingHTML(credits) {
        const typeCards = CONFIG.DOC_TYPES.map(t => `
            <button type="button" class="wrt-type-card" aria-pressed="false"
                data-value="${t.value}" data-label="${t.label}"
                data-credits="${t.credits}" data-icon="${t.icon}">
                <span class="wrt-type-icon" aria-hidden="true">${t.icon}</span>
                <div class="wrt-type-name">${t.label}</div>
                <div class="wrt-type-cost">${t.credits} 积分</div>
                <div class="wrt-type-chk">✓</div>
            </button>`).join('');
        return buildWritingTemplate(credits, typeCards);
    }

    function buildWritingTemplate(credits, typeCards) {
        return `
<div class="wrt-page">
    <div class="wrt-bg"></div>
    <div class="wrt-orb wrt-orb1"></div>
    <div class="wrt-orb wrt-orb2"></div>
    <div class="wrt-wrap">
        <div class="wrt-workspace-switch" role="tablist" aria-label="创作工作区">
            <button type="button" class="wrt-workspace-tab is-active" data-workspace="academic" role="tab" aria-selected="true"><span class="wrt-workspace-icon"><i class="fas fa-graduation-cap"></i></span><strong>学术写作</strong></button>
            <button type="button" class="wrt-workspace-tab" data-workspace="social" role="tab" aria-selected="false"><span class="wrt-workspace-icon"><i class="fas fa-pen-nib"></i></span><strong>社交发布</strong></button>
        </div>
        <div id="wrtAcademicWorkspace" class="wrt-workspace-panel is-active">
        <div class="wrt-header-card">
            <div>
                <h1 class="wrt-title">学术写作</h1>
                <p class="wrt-subtitle">选择文档类型，填写学科与题目后生成。</p>
            </div>
            <div class="wrt-credits-pill">
                <i class="fas fa-coins"></i>
                <span><strong id="wrtCreditsNum">${credits}</strong><small class="wrt-credits-label">可用积分</small></span>
            </div>
        </div>
        <div id="wrtSocialWorkspace" class="wrt-workspace-panel" hidden>
            <div class="social-workbench">
                <div class="social-workbench-head">
                    <div>
                        <h2>社交发布</h2>
                        <p>选择平台，填写素材和内容目标。</p>
                    </div>
                </div>
                <div class="social-workbench-main">
                    <section class="social-input-panel">
                        <div class="social-field-label"><span>发布平台</span></div>
                        <div class="social-platform-row" role="tablist" aria-label="发布平台"><button type="button" class="social-platform is-active" data-platform="xiaohongshu" role="tab" aria-selected="true"><span><i class="fas fa-bookmark"></i></span><b>小红书</b><small>图文笔记</small></button><button type="button" class="social-platform" data-platform="douyin" role="tab" aria-selected="false"><span><i class="fas fa-circle-play"></i></span><b>抖音</b><small>视频文案</small></button><button type="button" class="social-platform" data-platform="wechat" role="tab" aria-selected="false"><span><i class="fas fa-newspaper"></i></span><b>公众号</b><small>长文内容</small></button><button type="button" class="social-platform" data-platform="zhihu" role="tab" aria-selected="false"><span><i class="fas fa-circle-question"></i></span><b>知乎</b><small>问答内容</small></button></div>
                        <div class="social-field-label social-material-label"><span>你的素材或想法</span></div>
                        <textarea id="socialInput" class="social-textarea" placeholder="例如：周末去看了一场展览，动线很舒服，适合慢慢逛……&#10;&#10;也可以粘贴原稿、会议记录、产品信息或一段生活经历。"></textarea>
                        <div class="social-input-meta"><button type="button" class="social-attach-btn" id="socialUploadBtn"><i class="fas fa-paperclip"></i> 添加参考文件</button><input id="socialFileInput" type="file" accept="image/*,.pdf,.doc,.docx" hidden><span id="socialFileName">支持图片、PDF、Word；文字素材仍需填写</span><span class="social-counter" id="socialInputCount">0 字</span></div>
                        <div class="social-field-label"><span>补充要求</span><small>可选</small></div>
                        <input id="socialRequirements" class="social-requirements" placeholder="例如：面向新手，语气轻松，保留价格和型号">
                        <div class="social-field-label social-goal-label"><span>内容目标</span></div>
                        <div class="social-goal-row" role="group" aria-label="内容目标"><button type="button" class="social-goal is-active" data-goal="产品推荐" aria-pressed="true">产品推荐</button><button type="button" class="social-goal" data-goal="经验分享" aria-pressed="false">经验分享</button><button type="button" class="social-goal" data-goal="产品测评" aria-pressed="false">产品测评</button><button type="button" class="social-goal" data-goal="知识科普" aria-pressed="false">知识科普</button></div>
                        <button class="social-generate-btn" id="socialGenerateBtn" disabled><i class="fas fa-pen-nib"></i><span>生成内容</span></button><p class="social-generate-hint" id="socialGenerateHint">填写素材后即可生成</p>
                    </section>
                    <section class="social-output-panel">
                        <div class="social-card-head"><div><h3>内容预览</h3></div><span class="social-output-status"><i class="fas fa-circle"></i> 待生成</span></div>
                        <div class="social-preview" id="socialPreview"><div class="social-preview-empty"><div class="social-empty-icon"><i class="fas fa-file-lines"></i></div><strong>暂无内容</strong><span>生成结果将在这里显示</span></div></div>
                    </section>
                </div>
                <div class="social-check-card"><div class="social-card-head"><div><h3>发布检查</h3></div><span class="social-check-score" id="socialCheckScore">未检测</span></div><div class="social-check-list"><span><i class="fas fa-check"></i> 平台长度</span><span><i class="fas fa-check"></i> 标题结构</span><span><i class="fas fa-check"></i> 话题数量</span><span><i class="fas fa-check"></i> 敏感表达</span></div></div>
            </div>
        </div>
        <div class="wrt-academic-layout">
            <div class="wrt-form-shell">
                <section class="wrt-form-section">
                    <div class="wrt-form-section-head">
                        <span class="wrt-step-index">01</span>
                        <div><h2>选择文档类型</h2></div>
                    </div>
                    <div class="wrt-type-grid" id="wrtTypeGrid">${typeCards}</div>
                    <div class="wrt-summary" id="wrtSummary" style="display:none" role="status" aria-live="polite">
                        <div class="wrt-summary-main">
                            <span class="wrt-summary-icon" aria-hidden="true"><i class="fas fa-check"></i></span>
                            <span class="wrt-summary-label">已选择</span>
                            <span id="wrtSummaryTypes" class="wrt-summary-types"></span>
                        </div>
                        <div class="wrt-summary-meta"><span>预计消耗</span><strong id="wrtSummaryCredits" class="wrt-summary-cost">0</strong><span>积分</span></div>
                    </div>
                </section>

                <section class="wrt-form-section">
                    <div class="wrt-form-section-head">
                        <span class="wrt-step-index">02</span>
                        <div><h2>填写研究信息</h2></div>
                    </div>
                    <label class="wrt-control-label" for="wrtFieldDisplay">学科领域</label>
                    <div class="wrt-field-display" id="wrtFieldDisplay" role="button" tabindex="0" onclick="window._wrtOpenField()">
                        <span id="wrtFieldText" class="wrt-field-placeholder">搜索或选择你的学科领域</span>
                        <i class="fas fa-chevron-down" id="wrtFieldArrow"></i>
                    </div>
                    <div class="wrt-field-panel" id="wrtFieldPanel" style="display:none">
                        <div class="wrt-field-search-wrap">
                            <i class="fas fa-search wrt-field-search-icon"></i>
                            <input id="wrtFieldSearch" class="wrt-field-search" placeholder="搜索或输入自定义学科..." autocomplete="off">
                            <button id="wrtFieldClear" class="wrt-field-clear" style="display:none" onclick="window._wrtClearSearch()">✕</button>
                        </div>
                        <div class="wrt-field-list" id="wrtFieldList"></div>
                        <div class="wrt-field-custom" id="wrtFieldCustom" style="display:none">
                            <button onclick="window._wrtUseCustomField()" class="wrt-field-custom-btn">使用自定义学科："<span id="wrtFieldCustomText"></span>"</button>
                        </div>
                    </div>

                    <label class="wrt-control-label" for="wrtTopic">论文题目</label>
                    <div class="wrt-topic-row">
                        <input id="wrtTopic" class="wrt-input" placeholder="例如：人工智能在医疗诊断中的应用研究">
                        <button id="wrtGenTitleBtn" class="wrt-gen-title-btn" onclick="window._wrtGenerateTitle()" title="AI生成题目">
                            <i class="fas fa-wand-magic-sparkles"></i><span>生成题目</span>
                        </button>
                    </div>
                </section>

                <details class="wrt-advanced" id="wrtAdvanced">
                    <summary><span><i class="fas fa-sliders"></i><strong>高级设置</strong><small>字数、格式等</small></span><i class="fas fa-chevron-down wrt-advanced-arrow"></i></summary>
                    <div class="wrt-advanced-body">
                        <label class="wrt-control-label" for="wrtRequirements">补充说明 <span class="wrt-optional">可选</span></label>
                        <textarea id="wrtRequirements" class="wrt-input wrt-textarea" rows="4" placeholder="例如：约 5000 字，重点分析应用风险，采用规范学术表达，并包含参考文献建议。"></textarea>
                    </div>
                </details>
            </div>

            <aside class="wrt-checkout" aria-label="生成信息">
                <div class="wrt-checkout-head">
                    <div class="wrt-checkout-heading"><strong>准备生成</strong><small>完成 3 项信息后即可开始</small></div>
                    <span class="wrt-checkout-status" id="wrtCheckoutStatus">0/3</span>
                </div>
                <div class="wrt-checkout-list">
                    <div id="wrtCheckoutTypeItem"><span class="wrt-checkout-item-icon"><i class="fas fa-file-lines"></i></span><span class="wrt-checkout-item-copy"><span>文档类型</span><strong id="wrtCheckoutTypes">请选择</strong></span><i class="fas fa-check wrt-checkout-item-check"></i></div>
                    <div id="wrtCheckoutFieldItem"><span class="wrt-checkout-item-icon"><i class="fas fa-graduation-cap"></i></span><span class="wrt-checkout-item-copy"><span>学科领域</span><strong id="wrtCheckoutField">请选择</strong></span><i class="fas fa-check wrt-checkout-item-check"></i></div>
                    <div id="wrtCheckoutTopicItem"><span class="wrt-checkout-item-icon"><i class="fas fa-heading"></i></span><span class="wrt-checkout-item-copy"><span>论文题目</span><strong id="wrtCheckoutTopic">请填写</strong></span><i class="fas fa-check wrt-checkout-item-check"></i></div>
                </div>
                <div class="wrt-checkout-footer">
                    <div class="wrt-checkout-cost"><span>预计消耗</span><strong><b id="wrtCheckoutCost">0</b> 积分</strong></div>
                    <button id="wrtGenBtn" class="wrt-gen-btn" onclick="window._wrtGenerate()">
                        <span id="wrtGenBtnText">开始生成</span><i class="fas fa-arrow-right"></i>
                    </button>
                    <p class="wrt-checkout-next" id="wrtCheckoutNext"><i class="fas fa-arrow-right"></i> 下一步：选择文档类型</p>
                </div>
            </aside>
        </div>
        <div class="wrt-status-panel" id="wrtStatusPanel" style="display:none;position:fixed;top:84px;right:20px;left:auto;bottom:auto;z-index:50;pointer-events:none;max-width:420px;">
            <div class="wrt-status-inner">
                <div id="wrtStatusIcon" class="wrt-status-icon">⏳</div>
                <div id="wrtStatusTitle" class="wrt-status-title">AI 正在创作中...</div>
                <div id="wrtStatusBody" class="wrt-status-body">请稍候，生成完成后将自动提示</div>
                <div class="wrt-status-actions">
                    <button onclick="router.navigate('library')" class="wrt-status-link">前往文档库查看</button>
                </div>
            </div>
        </div>
        </div>
    </div>
</div>`;
    }

    // ─── 初始化 ────────────────────────────────────────────────
    function initWritingPage() {
        state.selectedTypes = []; state.field = ''; state.topic = '';
        state.requirements = ''; state.isGenerating = false;
        state.isGeneratingTitle = false; state.generatedTitles = [];
        state.lastOrderId = null; state.pollTimer = null; state.pollAttempts = 0;
        initWorkspaceTabs();

        document.querySelectorAll('.wrt-type-card').forEach(btn =>
            btn.addEventListener('click', () => toggleType(btn)));

        document.getElementById('wrtTopic').addEventListener('input', e => {
            state.topic = e.target.value.trim(); updateGenBtn();
        });
        document.getElementById('wrtRequirements').addEventListener('input', e => {
            state.requirements = e.target.value;
        });

        renderFieldList('');
        document.getElementById('wrtFieldSearch').addEventListener('input', e => {
            const v = e.target.value;
            document.getElementById('wrtFieldClear').style.display = v ? 'block' : 'none';
            renderFieldList(v);
        });
        const fieldDisplay = document.getElementById('wrtFieldDisplay');
        if (fieldDisplay) fieldDisplay.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window._wrtOpenField(); }
        });

        document.addEventListener('click', outsideClickHandler, true);
        resumeGenerationIfNeeded();
        updateGenBtn();
    }

    function initWorkspaceTabs() {
        const tabs = document.querySelectorAll('.wrt-workspace-tab');
        const academic = document.getElementById('wrtAcademicWorkspace');
        const social = document.getElementById('wrtSocialWorkspace');
        // The social prototype is rendered while the academic template is built.
        // Reparent it once so each workspace is an independent sibling panel;
        // otherwise hiding the academic panel would also hide the social panel.
        if (academic && social && social.parentElement === academic) {
            academic.parentElement.insertBefore(social, academic.nextSibling);
        }
        tabs.forEach(tab => tab.addEventListener('click', () => {
            const isSocial = tab.dataset.workspace === 'social';
            tabs.forEach(item => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); });
            academic.hidden = isSocial; social.hidden = !isSocial;
            academic.classList.toggle('is-active', !isSocial); social.classList.toggle('is-active', isSocial);
            if (isSocial) initSocialWorkspace();
        }));
    }

    function initSocialWorkspace() {
        const input = document.getElementById('socialInput'), count = document.getElementById('socialInputCount');
        const generate = document.getElementById('socialGenerateBtn');
        const hint = document.getElementById('socialGenerateHint');
        const updateCount = () => {
            const length = (input?.value || '').replace(/\s/g, '').length;
            if (count) count.textContent = `${length} 字`;
            if (generate) generate.disabled = length < 6;
            if (hint) hint.textContent = length < 6 ? '填写至少 6 个字的素材后即可生成' : '素材已填写，可以生成';
        };
        if (input && !input.dataset.bound) { input.dataset.bound = '1'; input.addEventListener('input', updateCount); }
        document.querySelectorAll('.social-platform').forEach(btn => btn.onclick = () => document.querySelectorAll('.social-platform').forEach(x => {
            const active = x === btn;
            x.classList.toggle('is-active', active);
            x.setAttribute('aria-selected', String(active));
        }));
        document.querySelectorAll('.social-goal').forEach(btn => btn.onclick = () => document.querySelectorAll('.social-goal').forEach(x => {
            const active = x === btn;
            x.classList.toggle('is-active', active);
            x.setAttribute('aria-pressed', String(active));
        }));
        if (generate && !generate.dataset.bound) { generate.dataset.bound = '1'; generate.addEventListener('click', renderSocialPreview); }
        const upload = document.getElementById('socialUploadBtn'), fileInput = document.getElementById('socialFileInput'), fileName = document.getElementById('socialFileName');
        if (upload && fileInput && !upload.dataset.bound) {
            upload.dataset.bound = '1';
            upload.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (fileName) fileName.textContent = file ? `已添加：${file.name}` : '支持图片、PDF、Word；文字素材仍需填写'; });
        }
        updateCount();
    }

    function renderSocialPreview() {
        const input = document.getElementById('socialInput'), preview = document.getElementById('socialPreview'), status = document.querySelector('.social-output-status'), score = document.getElementById('socialCheckScore');
        const text = (input && input.value.trim()) || '把你的素材整理成一段真实、具体、愿意被分享的内容。';
        const title = text.replace(/[。！？!?].*$/, '').slice(0, 24) || '今天想分享的一件小事';
        const requirements = document.getElementById('socialRequirements')?.value.trim();
        const body = `${text}${requirements ? `\n\n补充要求：${requirements}` : ''}\n\n把重点说清楚，也把自己的体验留下来。读者能快速知道发生了什么、为什么值得看，以及可以从中得到什么。`;
        const activePlatform = document.querySelector('.social-platform.is-active');
        const platformLabel = activePlatform?.querySelector('b')?.textContent?.trim() || '小红书';
        const goal = document.querySelector('.social-goal.is-active')?.dataset.goal || '产品推荐';
        const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        if (preview) preview.innerHTML = `<div class="social-preview-content"><span class="social-preview-platform">${escapeHtml(platformLabel)} · ${escapeHtml(goal)}</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body).replace(/\n/g, '<br>')}</p><div class="social-preview-tags">#真实分享　#经验记录　#生活灵感</div><div class="social-comment">评论引导：你也遇到过类似情况吗？</div><button class="social-copy-btn" onclick="window._copySocialPreview()"><i class="fas fa-copy"></i> 复制内容</button></div>`;
        if (status) status.innerHTML = '<i class="fas fa-circle"></i> 已生成预览';
        if (score) score.textContent = '4 项通过';
    }
    window._copySocialPreview = function () { const content = document.querySelector('.social-preview-content'); if (!content) return; navigator.clipboard?.writeText(content.innerText).then(() => utils.showToast('内容已复制', 'success')).catch(() => utils.showToast('复制失败，请手动选择', 'warning')); };

    function outsideClickHandler(e) {
        const panel   = document.getElementById('wrtFieldPanel');
        const display = document.getElementById('wrtFieldDisplay');
        if (!panel) { document.removeEventListener('click', outsideClickHandler, true); return; }
        if (!panel.contains(e.target) && !display.contains(e.target)) {
            panel.style.display = 'none';
            const arrow = document.getElementById('wrtFieldArrow');
            if (arrow) arrow.style.transform = '';
        }
    }

    // ─── 文档类型选择 ─────────────────────────────────────────────
    function toggleType(btn) {
        if (!auth.requireLogin()) return;
        const value = btn.dataset.value, label = btn.dataset.label;
        const credits = parseInt(btn.dataset.credits, 10), icon = btn.dataset.icon;
        const idx = state.selectedTypes.findIndex(t => t.value === value);
        if (idx >= 0) { state.selectedTypes.splice(idx, 1); btn.classList.remove('selected'); btn.setAttribute('aria-pressed', 'false'); }
        else          { state.selectedTypes.push({ value, label, credits, icon }); btn.classList.add('selected'); btn.setAttribute('aria-pressed', 'true'); }
        updateSummaryBar(); updateGenBtn();
    }

    function updateSummaryBar() {
        const panel = document.getElementById('wrtSummary');
        const hasTypes = state.selectedTypes.length > 0;
        const labels = state.selectedTypes.map(t => t.label).join('、');
        const cost = state.selectedTypes.reduce((s, t) => s + t.credits, 0);
        if (panel) panel.style.display = hasTypes ? 'flex' : 'none';
        const summaryTypes = document.getElementById('wrtSummaryTypes');
        const summaryCredits = document.getElementById('wrtSummaryCredits');
        if (summaryTypes) summaryTypes.textContent = labels;
        if (summaryCredits) summaryCredits.textContent = cost;
        updateCheckout();
    }

    // ─── 学科领域 ─────────────────────────────────────────────────
    window._wrtOpenField = function () {
        const panel = document.getElementById('wrtFieldPanel');
        const arrow = document.getElementById('wrtFieldArrow');
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
        if (!isOpen) {
            document.getElementById('wrtFieldSearch').value = '';
            document.getElementById('wrtFieldClear').style.display = 'none';
            renderFieldList('');
            setTimeout(() => document.getElementById('wrtFieldSearch').focus(), 50);
        }
    };

    window._wrtClearSearch = function () {
        const inp = document.getElementById('wrtFieldSearch');
        inp.value = '';
        document.getElementById('wrtFieldClear').style.display = 'none';
        renderFieldList(''); inp.focus();
    };

    window._wrtUseCustomField = function () {
        const text = document.getElementById('wrtFieldSearch').value.trim();
        if (!text) return;
        selectField(text);
    };

    window._wrtSelectField = function (field) { selectField(field); };

    function renderFieldList(keyword) {
        const list = document.getElementById('wrtFieldList');
        const customBox = document.getElementById('wrtFieldCustom');
        const kw = keyword.trim().toLowerCase();
        const filtered = kw ? CONFIG.FIELDS.filter(f => f.toLowerCase().includes(kw)) : CONFIG.FIELDS;
        list.innerHTML = filtered.map(f => {
            const display = kw
                ? f.replace(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>')
                : f;
            return `<div class="wrt-field-item${f === state.field ? ' active' : ''}" onclick="window._wrtSelectField('${f.replace(/'/g, "\\'")}')">` + display + '</div>';
        }).join('');
        if (kw && filtered.length === 0) {
            customBox.style.display = 'block';
            document.getElementById('wrtFieldCustomText').textContent = keyword.trim();
        } else {
            customBox.style.display = 'none';
        }
    }

    function selectField(field) {
        state.field = field;
        state.generatedTitles = [];
        const txt = document.getElementById('wrtFieldText');
        txt.textContent = field;
        txt.classList.remove('wrt-field-placeholder');
        document.getElementById('wrtFieldPanel').style.display = 'none';
        const arrow = document.getElementById('wrtFieldArrow');
        if (arrow) arrow.style.transform = '';
        updateGenBtn();
    }

    // ─── AI 生成题目 ──────────────────────────────────────────────
    window._wrtGenerateTitle = async function () {
        if (!state.field) { utils.showToast('请先选择学科领域', 'warning'); return; }
        if (state.isGeneratingTitle) return;
        if (!auth.requireLogin()) return;
        state.isGeneratingTitle = true;
        const btn = document.getElementById('wrtGenTitleBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>生成中...</span>'; }
        try {
            const res = await api.generateTitle(state.field, state.generatedTitles);
            if (res && res.code === 'SUCCESS' && res.data && res.data.title) {
                const title = res.data.title;
                state.generatedTitles.push(title);
                if (state.generatedTitles.length > 10) state.generatedTitles.shift();
                const inp = document.getElementById('wrtTopic');
                if (inp) inp.value = title;
                state.topic = title;
                updateGenBtn();
                utils.showToast('AI题目已生成', 'success');
            } else {
                utils.showToast('题目生成失败，请重试', 'error');
            }
        } catch (e) {
            utils.showToast(e.message || '网络错误，请重试', 'error');
        } finally {
            state.isGeneratingTitle = false;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i><span>生成题目</span>'; }
        }
    };

    // ─── 按钮状态 ─────────────────────────────────────────────────
    function updateGenBtn() {
        const btn = document.getElementById('wrtGenBtn');
        const txt = document.getElementById('wrtGenBtnText');
        if (!btn) return;
        const totalCost = state.selectedTypes.reduce((s, t) => s + t.credits, 0);
        const credits   = auth.isLoggedIn() ? auth.getCredits() : 0;
        const ready     = state.selectedTypes.length > 0 && state.topic.length > 0 && state.field.length > 0;
        const notEnough = totalCost > credits;
        const num = document.getElementById('wrtCreditsNum');
        if (num) num.textContent = credits;
        updateCheckout();
        if (state.isGenerating) {
            btn.disabled = true; btn.className = 'wrt-gen-btn generating';
            txt.textContent = 'AI 正在创作中...';
        } else if (!auth.isLoggedIn()) {
            btn.disabled = false; btn.className = 'wrt-gen-btn';
            txt.textContent = '登录后开始生成';
        } else if (!ready) {
            btn.disabled = true; btn.className = 'wrt-gen-btn disabled';
            txt.textContent = '开始生成';
        } else if (notEnough) {
            btn.disabled = false; btn.className = 'wrt-gen-btn insufficient';
            txt.textContent = `积分不足（需 ${totalCost} 积分）→ 去充值`;
        } else {
            btn.disabled = false; btn.className = 'wrt-gen-btn';
            txt.textContent = `开始生成 · ${totalCost} 积分`;
        }
    }

    function updateCheckout() {
        const types = document.getElementById('wrtCheckoutTypes');
        const field = document.getElementById('wrtCheckoutField');
        const topic = document.getElementById('wrtCheckoutTopic');
        const cost = document.getElementById('wrtCheckoutCost');
        const status = document.getElementById('wrtCheckoutStatus');
        const next = document.getElementById('wrtCheckoutNext');
        const totalCost = state.selectedTypes.reduce((s, t) => s + t.credits, 0);
        const typeReady = state.selectedTypes.length > 0;
        const fieldReady = state.field.length > 0;
        const topicReady = state.topic.length > 0;
        const completeCount = [typeReady, fieldReady, topicReady].filter(Boolean).length;
        const ready = completeCount === 3;
        if (types) types.textContent = typeReady ? state.selectedTypes.map(t => t.label).join('、') : '请选择';
        if (field) field.textContent = state.field || '请选择';
        if (topic) topic.textContent = state.topic || '请填写';
        if (cost) cost.textContent = totalCost;
        [['wrtCheckoutTypeItem', typeReady], ['wrtCheckoutFieldItem', fieldReady], ['wrtCheckoutTopicItem', topicReady]].forEach(([id, complete]) => {
            const item = document.getElementById(id);
            if (item) item.classList.toggle('is-complete', complete);
        });
        if (status) {
            status.classList.toggle('is-ready', ready);
            status.textContent = ready ? '已就绪' : `${completeCount}/3`;
        }
        if (next) {
            const message = !typeReady ? '下一步：选择文档类型' : !fieldReady ? '下一步：选择学科领域' : !topicReady ? '最后一步：填写论文题目' : '信息完整，可以开始生成';
            next.innerHTML = `<i class="fas ${ready ? 'fa-circle-check' : 'fa-arrow-right'}"></i> ${message}`;
            next.classList.toggle('is-ready', ready);
        }
    }

    function goToRechargeTab() {
        try { localStorage.setItem('ordersDefaultTab', 'recharge'); } catch (e) {}
        router.navigate('orders');
    }

    // ─── 提交生成 ─────────────────────────────────────────────────
    window._wrtGenerate = async function () {
        if (!auth.requireLogin()) return;
        if (state.isGenerating) return;

        const totalCost = state.selectedTypes.reduce((s, t) => s + t.credits, 0);
        const credits   = auth.getCredits();

        if (!state.selectedTypes.length) { utils.showToast('请选择至少一个文档类型', 'error'); return; }
        if (!state.field)                { utils.showToast('请选择学科领域', 'error'); return; }
        if (!state.topic)                { utils.showToast('请输入论文题目', 'error'); return; }

        if (totalCost > credits) {
            if (confirm(`积分不足\n当前：${credits} 积分，需要：${totalCost} 积分\n\n是否前往充值？`)) {
                goToRechargeTab();
            }
            return;
        }

        const typeNames = state.selectedTypes.map(t => t.label).join('、');
        if (!confirm(`确认生成以下内容？\n\n📝 题目：${state.topic}\n📚 类型：${typeNames}\n💰 消耗积分：${totalCost}\n\n生成后保存到文档库`)) return;

        await startGeneration();
    };

    async function startGeneration() {
        state.isGenerating  = true;
        state.lastTopic     = state.topic;
        state.lastDocCount  = state.selectedTypes.length;
        updateGenBtn();
        showStatusPanel('generating', '正常创作中', 'thinking....');

        try {
            const res = await api.generateDocument({
                topic:        state.topic,
                field:        state.field,
                contentTypes: state.selectedTypes.map(t => t.value),
                requirements: state.requirements
            });

            if (res && res.code === 'PROCESSING' && res.data && res.data.orderId) {
                state.lastOrderId  = res.data.orderId;
                state.pollAttempts = 0;
                // 保存生成状态（对标小程序 currentGenerationState）
                try {
                    localStorage.setItem(CONFIG.STORAGE_KEYS.GENERATION_STATE, JSON.stringify({
                        isGenerating: true,
                        orderId:  res.data.orderId,
                        topic:    state.topic,
                        field:    state.field,
                        count:    state.lastDocCount,
                        startTime: Date.now()
                    }));
                } catch(e) {}
                schedulePoll(res.data.orderId, 0);

            } else if (res && res.code === 'INSUFFICIENT_CREDITS') {
                state.isGenerating = false; updateGenBtn();
                hideStatusPanel();
                const need = (res.data && res.data.required) || '?';
                const have = (res.data && res.data.available) || '?';
                if (confirm(`积分不足\n所需：${need}，当前：${have}\n\n是否前往充值？`)) goToRechargeTab();

            } else {
                state.isGenerating = false; updateGenBtn();
                const msg = (res && (res.message || res.error)) || '提交失败，请重试';
                showStatusPanel('failed', '生成失败', msg);
            }
        } catch (e) {
            state.isGenerating = false; updateGenBtn();
            showStatusPanel('failed', '提交失败', e.message || '网络异常，请稍后重试');
        }
    }

    // ─── 轮询订单状态（对标小程序 checkGenerationStatus）────────────
    function schedulePoll(orderId, attempts) {
        const cfg = CONFIG.POLL_CONFIG;
        if (attempts >= cfg.MAX_ATTEMPTS) {
            state.isGenerating = false; updateGenBtn();
            showStatusPanel('timeout', '生成中（后台）', '请稍后前往「文档库」或「订单」查看结果');
            clearGenerationState();
            return;
        }
        const delay = attempts === 0 ? cfg.FIRST_DELAY
                    : attempts <= cfg.SLOW_AFTER ? cfg.NORMAL_DELAY
                    : cfg.SLOW_DELAY;
        state.pollTimer = setTimeout(() => pollOnce(orderId, attempts), delay);
    }

    async function pollOnce(orderId, attempts) {
        try {
            const res = await api.getOrderStatus(orderId);
            let order = null;
            if (res && res.data)   order = res.data;
            else if (res && res.status) order = res;

            if (!order) { schedulePoll(orderId, attempts + 1); return; }

            if (order.status === 'completed') {
                onGenerationComplete(order);
            } else if (order.status === 'failed' || order.status === 'partial') {
                onGenerationPartialOrFailed(order);
            } else {
                schedulePoll(orderId, attempts + 1);
            }
        } catch (e) {
            if (e && e.message && e.message.includes('401')) {
                state.isGenerating = false; updateGenBtn();
                showStatusPanel('failed', '登录已过期', '请重新登录后在文档库查看进度');
            } else if (attempts >= 3) {
                // 网络抖动超过3次，静默转后台
                state.isGenerating = false; updateGenBtn();
                showStatusPanel('timeout', '正在后台生成', '生成完成后请前往「文档库」查看');
            } else {
                schedulePoll(orderId, attempts + 1);
            }
        }
    }

    function onGenerationComplete(order) {
        state.isGenerating = false; updateGenBtn();
        clearGenerationState();
        const docCount = state.lastDocCount || 1;
        // 刷新积分
        auth.refreshUserInfo();
        // 标记文档库有新文档（对标小程序 hasNewDocuments）
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.HAS_NEW_DOCS, 'true');
            localStorage.setItem('newDocumentsCount', String(docCount));
            const notified = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.GENERATION_NOTIFIED) || '{}');
            const oid = state.lastOrderId || '';
            if (oid && !notified[oid]) {
                notified[oid] = true;
                localStorage.setItem(CONFIG.STORAGE_KEYS.GENERATION_NOTIFIED, JSON.stringify(notified));
                showStatusPanel('success', '✅ 生成完成！',
                    `《${state.lastTopic}》已保存到文档库，共 ${docCount} 个文档`);
                if (confirm(`${docCount} 个文档已生成完成！\n是否前往「文档库」查看？`)) {
                    router.navigate('library');
                }
            } else {
                showStatusPanel('success', '✅ 生成完成！',
                    `《${state.lastTopic}》已保存到文档库，共 ${docCount} 个文档`);
            }
        } catch(e) {
            showStatusPanel('success', '✅ 生成完成！', `文档已保存到文档库`);
        }
    }

    function onGenerationPartialOrFailed(order) {
        state.isGenerating = false; updateGenBtn();
        clearGenerationState();
        auth.refreshUserInfo();
        const isPartial    = order.status === 'partial';
        const successCount = order.success_count || 0;
        const failCount    = order.fail_count    || 0;
        if (isPartial && successCount > 0) {
            showStatusPanel('partial', '⚠️ 部分生成成功',
                `成功：${successCount} 个，失败：${failCount} 个（失败积分已退还）`);
            try { localStorage.setItem(CONFIG.STORAGE_KEYS.HAS_NEW_DOCS, 'true'); } catch(e) {}
        } else {
            const reason = order.failure_reason || '文档生成失败，积分已退还，请重试';
            showStatusPanel('failed', '❌ 生成失败', reason);
        }
    }

    // ─── 状态面板 ─────────────────────────────────────────────────
    function showStatusPanel(type, title, body) {
        const panel = document.getElementById('wrtStatusPanel');
        const icon  = document.getElementById('wrtStatusIcon');
        const ttl   = document.getElementById('wrtStatusTitle');
        const bdy   = document.getElementById('wrtStatusBody');
        if (!panel) return;
        panel.style.display = 'block';
        panel.className = `wrt-status-panel wrt-status-${type}`;
        const icons = { generating:'⏳', success:'✅', failed:'❌', partial:'⚠️', timeout:'🕐' };
        if (icon) { icon.textContent = icons[type] || '⏳'; }
        if (ttl)  ttl.textContent  = title;
        if (bdy)  bdy.textContent  = body;
    }

    function hideStatusPanel() {
        const panel = document.getElementById('wrtStatusPanel');
        if (panel) panel.style.display = 'none';
    }

    // ─── 状态持久化 ───────────────────────────────────────────────
    function clearGenerationState() {
        try { localStorage.removeItem(CONFIG.STORAGE_KEYS.GENERATION_STATE); } catch(e) {}
    }

    function resumeGenerationIfNeeded() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.GENERATION_STATE);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (!saved || !saved.isGenerating) return;
            const elapsed = Date.now() - (saved.startTime || 0);
            if (elapsed > 5 * 60 * 1000) { clearGenerationState(); return; } // 超5分钟放弃
            state.isGenerating = true;
            state.lastTopic    = saved.topic   || '';
            state.lastDocCount = saved.count   || 1;
            state.lastOrderId  = saved.orderId || null;
            state.pollAttempts = 0;
            updateGenBtn();
            showStatusPanel('generating', '正常创作中', '思考中...');
            if (saved.orderId) schedulePoll(saved.orderId, 0);
        } catch(e) {}
    }
})();
