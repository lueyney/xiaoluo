/**
 * 文档库页面
 */
(function () {
    'use strict';
    var _docCache = {};
    router.register('library', function () {
        if (false && !auth.isLoggedIn()) {
            document.getElementById('mainContent').innerHTML =
                '<div style="min-height:100vh;background:#080b14;display:flex;align-items:center;justify-content:center;">'
                + '<div style="text-align:center;padding:48px 32px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:20px;">'
                + '<div style="font-size:52px;margin-bottom:16px;">&#128274;</div>'
                + '<h2 style="color:#f0f4ff;margin:0 0 8px;font-size:22px;">请先登录</h2>'
                + '<p style="color:rgba(255,255,255,.4);margin:0 0 24px;">登录后查看您的文档</p>'
                + '<button style="padding:10px 28px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-size:14px;font-weight:600;cursor:pointer;" onclick="auth.showAuthModal()">立即登录</button>'
                + '</div></div>';
            return;
        }
        document.getElementById('mainContent').innerHTML = buildLibraryHTML();
        initLibraryPage();
    });

    var libState = { allDocs: [], filter: 'all', search: '', loading: false, expanded: new Set() };

    function buildLibraryHTML() {
        var credits = auth.isLoggedIn() ? auth.getCredits() : 0;
        return '<style>' + LIB_CSS + '</style>' + buildLibraryDOM(credits);
    }

    function buildLibraryDOM(credits) {
        return '<div class="lib-page">'
            + '<div class="lib-bg"></div>'
            + '<div class="lib-orb lib-orb1"></div>'
            + '<div class="lib-orb lib-orb2"></div>'
            + '<div class="lib-wrap">'
            + '<div class="lib-header-card">'
            + '<div><h1 class="lib-header-title">文档库</h1></div>'
            + '<div class="lib-header-btns">'
            + '<div class="lib-credits-pill"><i class="fas fa-coins"></i><span id="libCredits">' + credits + '</span><span class="lib-credits-label">积分</span></div>'
            + '<button class="lib-new-btn" onclick="window._libGoWrite()">+ 新建文档</button>'
            + '</div></div>'
            + '<div class="lib-toolbar-card">'
            + '<div class="lib-toolbar-row"><div class="lib-search-wrap"><i class="fas fa-search lib-search-icon"></i><input id="libSearch" class="lib-search" placeholder="搜索文档"></div></div>'
             + '<div class="lib-toolbar-row"><div class="lib-filters" id="libFilters">'
             + '<button class="lib-filter active" data-filter="all">全部</button>'
             + '<button class="lib-filter" data-filter="creation">创作稿</button>'
             + '<button class="lib-filter" data-filter="ai-rewrite">AI降重稿</button>'
             + '<button class="lib-filter" data-filter="completed">已完成</button>'
            + '<button class="lib-filter" data-filter="processing">生成中</button>'
            + '<button class="lib-filter" data-filter="failed">失败</button>'
            + '</div></div></div>'
            + '<div class="lib-body" id="libBody"><div class="lib-loading"><i class="fas fa-spinner fa-spin"></i><span>加载中...</span></div></div>'
            + '</div></div>';
    }

    function initLibraryPage() {
        libState.allDocs = []; libState.filter = 'all'; libState.search = ''; libState.expanded = new Set();
        var searchEl = document.getElementById('libSearch');
        if (searchEl) {
            searchEl.addEventListener('input', utils.debounce(function(e) {
                libState.search = e.target.value.trim();
                renderDocs();
            }, 200));
        }
        var filtersEl = document.getElementById('libFilters');
        if (filtersEl) {
            filtersEl.addEventListener('click', function(e) {
                var btn = e.target.closest('.lib-filter');
                if (!btn) return;
                filtersEl.querySelectorAll('.lib-filter').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                 libState.filter = btn.dataset.filter;
                renderDocs();
            });
        }
        try {
            if (localStorage.getItem(CONFIG.STORAGE_KEYS.HAS_NEW_DOCS) === 'true') {
                localStorage.removeItem(CONFIG.STORAGE_KEYS.HAS_NEW_DOCS);
                localStorage.removeItem('newDocumentsCount');
            }
        } catch(e) {}
        loadDocuments();
    }

    var LIB_CSS = [
        '.lib-page{min-height:100vh;background:#080b14;padding:0;position:relative;overflow-x:hidden}',
        '.lib-bg{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 20% 10%,rgba(99,102,241,.12) 0%,transparent 60%),radial-gradient(ellipse 60% 50% at 80% 80%,rgba(139,92,246,.08) 0%,transparent 55%)}',
        '.lib-orb{position:fixed;border-radius:50%;filter:blur(80px);pointer-events:none;z-index:0;animation:libOrbFloat 8s ease-in-out infinite alternate}',
        '.lib-orb1{width:460px;height:460px;top:-80px;right:-60px;background:radial-gradient(circle,rgba(99,102,241,.15),transparent 70%)}',
        '.lib-orb2{width:340px;height:340px;bottom:10%;left:-60px;background:radial-gradient(circle,rgba(139,92,246,.12),transparent 70%);animation-delay:3s}',
        '@keyframes libOrbFloat{from{transform:translateY(0) scale(1)}to{transform:translateY(-30px) scale(1.05)}}',
        '.lib-wrap{max-width:1100px;margin:0 auto;padding:32px 24px 80px;position:relative;z-index:1;box-sizing:border-box}',
        '.lib-header-card{display:flex;align-items:flex-end;justify-content:space-between;padding:0 0 20px;margin-bottom:0}',
        '.lib-hbadge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;background:rgba(99,102,241,.14);border:1px solid rgba(99,102,241,.28);font-size:10px;font-weight:700;letter-spacing:.14em;color:#a5b4fc;margin-bottom:10px}',
        '.lib-hbadge-dot{width:5px;height:5px;border-radius:50%;background:#818cf8;box-shadow:0 0 7px #818cf8}',
        '.lib-header-title{font-size:34px;font-weight:800;margin:0 0 6px;background:linear-gradient(135deg,#fff 30%,#a5b4fc 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}',
        '.lib-header-sub{font-size:14px;color:rgba(255,255,255,.3);margin:0}',
        '.lib-credits-pill{display:flex;align-items:center;gap:7px;padding:9px 18px;border-radius:50px;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.2);font-size:16px;font-weight:800;color:#fbbf24;white-space:nowrap}',
        '.lib-credits-label{font-size:11px;color:rgba(255,255,255,.32);font-weight:400}',
        '.lib-header-btns{display:flex;align-items:center;gap:10px}',
        '.lib-new-btn{padding:9px 20px;border-radius:11px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(99,102,241,.4);transition:all .25s}',
        '.lib-new-btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(99,102,241,.5)}',
        '.lib-toolbar-card{display:flex;flex-direction:column;gap:8px;padding:12px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;margin-bottom:20px;backdrop-filter:blur(18px);box-sizing:border-box}',
        '.lib-body{box-sizing:border-box}',
        '.lib-toolbar-row{display:flex;align-items:center;width:100%;box-sizing:border-box}',
        '.lib-search-wrap{position:relative;width:100%;box-sizing:border-box}',
        '.lib-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,.25);font-size:12px;pointer-events:none}',
        '.lib-search{width:100%;padding:9px 12px 9px 32px;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.08);border-radius:10px;color:#f0f4ff;font-size:13px;outline:none;transition:border-color .2s;box-sizing:border-box}',
        '.lib-search:focus{border-color:rgba(99,102,241,.5)}.lib-search::placeholder{color:rgba(255,255,255,.2)}',
        '.lib-filters{display:flex;gap:6px;flex-wrap:wrap}',
        '.lib-filter{padding:7px 14px;border-radius:20px;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.08);color:rgba(255,255,255,.4);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s}',
        '.lib-filter:hover{border-color:rgba(99,102,241,.4);color:#a5b4fc}',
        '.lib-filter.active{background:rgba(99,102,241,.18);border-color:rgba(99,102,241,.45);color:#c7d2fe}',
        '.lib-group{margin-bottom:16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;backdrop-filter:blur(18px);box-shadow:0 8px 32px rgba(0,0,0,.3);animation:libCardUp .45s both;box-sizing:border-box}',
        '@keyframes libCardUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}',
        '.lib-group:nth-child(2){animation-delay:.06s}.lib-group:nth-child(3){animation-delay:.12s}.lib-group:nth-child(4){animation-delay:.18s}',
        '.lib-group:hover{border-color:rgba(99,102,241,.22)}',
        '.lib-group-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:rgba(255,255,255,.02);border-bottom:1px solid rgba(255,255,255,.05)}',
        '.lib-group-meta{display:flex;align-items:center;gap:10px}',
        '.lib-group-label{font-size:10px;font-weight:700;letter-spacing:.1em;color:#818cf8;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.22);padding:3px 10px;border-radius:20px}',
        '.lib-group-topic{font-size:13px;color:rgba(240,244,255,.7);font-weight:500}',
        '.lib-group-date{font-size:11px;color:rgba(240,244,255,.45)}',
        '.lib-group-cards{padding:12px;display:flex;flex-direction:column;gap:10px}',
        '.lib-card{border-radius:14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);overflow:hidden;transition:all .25s}',
        '.lib-card:hover{border-color:rgba(99,102,241,.3);background:rgba(99,102,241,.05);box-shadow:0 8px 28px rgba(0,0,0,.3);transform:translateY(-2px)}',
        '.lib-card-completed{border-left:3px solid rgba(16,185,129,.5)}',
        '.lib-card-processing,.lib-card-pending{border-left:3px solid rgba(245,158,11,.5)}',
        '.lib-card-failed{border-left:3px solid rgba(239,68,68,.5)}',
        '.lib-card-partial{border-left:3px solid rgba(245,158,11,.4)}',
        '.lib-card-main{display:flex;align-items:flex-start;gap:14px;padding:16px 18px 10px}',
        '.lib-card-icon-wrap{width:40px;height:40px;border-radius:11px;flex-shrink:0;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center;font-size:18px}',
        '.lib-card-info{flex:1;min-width:0}',
        '.lib-card-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;width:100%}',
        '.lib-card-title{font-size:14px;font-weight:700;color:#f0f4ff;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px}',
        '.lib-card-meta{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:7px}',
        '.lib-card-meta span{font-size:11px;color:rgba(240,244,255,.55);display:flex;align-items:center;gap:3px}',
        '.lib-card-preview{font-size:12px;color:rgba(240,244,255,.75);line-height:1.65;padding:6px 0 4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}',
        '.lib-card-preview.expanded{-webkit-line-clamp:unset;display:block}',
        '.lib-card-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;padding:0 16px 14px;flex-wrap:wrap}',
        '.lib-card-hint{font-size:11px;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:8px;font-weight:600}',
                '.lib-card-hint-warn{color:#fbbf24;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2)}',
        '.lib-card-hint-err{color:#f87171;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2)}',
        '.lib-btn-view{padding:7px 14px;border-radius:9px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);color:#a5b4fc;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:5px}',
        '.lib-btn-view:hover{background:rgba(99,102,241,.25);border-color:rgba(99,102,241,.6);color:#c7d2fe;transform:translateY(-1px)}',
        '.lib-btn-export{padding:7px 14px;border-radius:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s;box-shadow:0 2px 10px rgba(99,102,241,.35);display:inline-flex;align-items:center;gap:5px}',
        '.lib-btn-export:hover{transform:translateY(-1px);box-shadow:0 5px 16px rgba(99,102,241,.55)}',
        '.lib-btn-expand{padding:4px 10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);font-size:11px;cursor:pointer;transition:all .2s;white-space:nowrap;flex-shrink:0}',
        '.lib-btn-expand:hover{border-color:rgba(99,102,241,.4);color:#a5b4fc}',
        '.lib-btn-delete{width:32px;height:32px;border-radius:50%;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:rgba(239,68,68,.6);font-size:13px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
        '.lib-btn-delete:hover{background:rgba(239,68,68,.25);border-color:rgba(239,68,68,.5);color:#f87171;transform:scale(1.12)}',
        '.lib-status-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:600;white-space:nowrap;flex-shrink:0}',
        '.lib-badge-success{background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);color:#34d399}',
        '.lib-badge-warning{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:#fbbf24}',
        '.lib-badge-danger{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171}',
        '.lib-badge-secondary{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4)}',
        '.lib-loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:80px 20px;color:rgba(255,255,255,.35);font-size:14px}',
        '.lib-empty{text-align:center;padding:80px 20px;color:rgba(255,255,255,.35)}',
        '.lib-empty p{font-size:15px;margin:12px 0 20px}',
        '.lib-error{text-align:center;padding:60px 20px;color:rgba(239,68,68,.7);font-size:14px}',
        '.lib-btn-primary{padding:9px 22px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 3px 12px rgba(99,102,241,.4);transition:all .2s}',
        '.lib-btn-primary:hover{transform:translateY(-2px)}',
        '.lib-viewer-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;animation:lvFadeIn .2s ease}',
        '@keyframes lvFadeIn{from{opacity:0}to{opacity:1}}',
        '.lib-viewer{width:100%;max-width:820px;max-height:88vh;display:flex;flex-direction:column;background:#0d1025;border:1px solid rgba(99,102,241,.28);border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,.7);animation:lvUp .25s ease}',
        '@keyframes lvUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}',
        '.lib-viewer-head{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}',
        '.lib-viewer-title{font-size:16px;font-weight:700;color:#f0f4ff;margin:0 12px 0 0;line-height:1.4;word-break:break-word}',
        '.lib-viewer-meta{font-size:11px;color:rgba(255,255,255,.3);margin-top:5px;display:flex;gap:12px;flex-wrap:wrap}',
        '.lib-viewer-close{width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .2s;line-height:1}',
        '.lib-viewer-close:hover{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3);color:#f87171}',
        '.lib-viewer-toolbar{display:flex;align-items:center;gap:8px;padding:12px 24px;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0;background:rgba(255,255,255,.015)}',
        '.lib-viewer-body{flex:1;overflow-y:auto;padding:24px;scrollbar-width:thin;scrollbar-color:rgba(99,102,241,.3) transparent}',
        '.lib-viewer-body::-webkit-scrollbar{width:4px}',
        '.lib-viewer-body::-webkit-scrollbar-thumb{background:rgba(99,102,241,.3);border-radius:2px}',
        '.lib-viewer-content{font-size:14px;color:rgba(255,255,255,.8);line-height:1.9;white-space:pre-wrap;word-break:break-word}',
        '.lib-viewer-footer{padding:14px 24px;border-top:1px solid rgba(255,255,255,.07);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0}'
    ].join('');

    async function loadDocuments() {
        libState.loading = true;
        if (!auth.isLoggedIn()) {
            setBody('<div class="lib-empty"><div style="font-size:48px;">📚</div><p>未登录状态下可先浏览页面，登录后查看并管理你的文档</p><button class="lib-btn-primary" onclick="auth.showAuthModal()">登录查看文档</button></div>');
            libState.loading = false;
            return;
        }
        setBody('<div class="lib-loading"><i class="fas fa-spinner fa-spin"></i><span>\u52a0\u8f7d\u4e2d...</span></div>');
        try {
            var res = await api.getDocuments();
            var _d = res && res.data;
            if (_d && Array.isArray(_d.documents)) libState.allDocs = _d.documents;
            else if (_d && Array.isArray(_d)) libState.allDocs = _d;
            else if (res && Array.isArray(res.documents)) libState.allDocs = res.documents;
            else libState.allDocs = [];
            if (!Array.isArray(libState.allDocs)) libState.allDocs = [];
            libState.allDocs.forEach(function(d) { _docCache[d.id] = d; });
            renderDocs();
        } catch(e) {
            setBody('<div class="lib-error"><i class="fas fa-exclamation-circle"></i><p>' + utils.escapeHtml(e.message || '\u52a0\u8f7d\u5931\u8d25') + '</p><button class="lib-btn-primary" onclick="window._libReload()">\u91cd\u8bd5</button></div>');
        } finally { libState.loading = false; }
    }
    window._libReload = loadDocuments;

    function normalizeStatus(doc) {
        var s = (doc.status || '').toLowerCase();
        if (s === 'completed' || s === 'done' || s === 'success') return 'completed';
        if (s === 'processing' || s === 'pending' || s === 'generating' || s === 'running') return 'processing';
        if (s === 'failed' || s === 'error' || s === 'fail') return 'failed';
        if (s === 'partial') return 'partial';
        return (doc.content && doc.content.length > 10) ? 'completed' : 'processing';
    }

    function renderDocs() {
        var docs = libState.allDocs.map(function(d) { return Object.assign({}, d, { _status: normalizeStatus(d) }); });
        if (libState.search) {
            var kw = libState.search.toLowerCase();
            docs = docs.filter(function(d) {
                return (d.title||'').toLowerCase().includes(kw) || (d.type||'').toLowerCase().includes(kw) || (d.field||'').toLowerCase().includes(kw);
            });
        }
        if (libState.filter === 'creation') docs = docs.filter(function(d) { return d.type !== 'AI降重'; });
        else if (libState.filter === 'ai-rewrite') docs = docs.filter(function(d) { return d.type === 'AI降重'; });
        else if (libState.filter !== 'all') docs = docs.filter(function(d) { return d._status === libState.filter; });
        if (!docs.length) { setBody(emptyHTML(libState.search || libState.filter !== 'all')); return; }
        var grouped = groupDocsByOrder(docs);
        var html = '';
        grouped.forEach(function(g) { html += renderGroup(g); });
        setBody(html);
    }

    function groupDocsByOrder(docs) {
        var map = new Map();
        docs.forEach(function(doc) {
            var key = doc.order_id || doc.orderId || '__no_order__';
            if (!map.has(key)) map.set(key, { orderId: key, topic: doc.topic || doc.title || '', field: doc.field || '', createdAt: doc.created_at || doc.createdAt || '', docs: [] });
            map.get(key).docs.push(doc);
        });
        return Array.from(map.values()).sort(function(a,b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    }

    function renderGroup(group) {
        var label = group.orderId === '__no_order__' ? '\u72ec\u7acb\u6587\u6863' : '\u8ba2\u5355 #' + group.orderId.toString().slice(-6).toUpperCase();
        var date  = group.createdAt ? utils.formatDate(group.createdAt) : '';
        var docsHTML = group.docs.map(renderDocCard).join('');
        return '<div class="lib-group">'
            + '<div class="lib-group-header">'
              + '<div class="lib-group-meta"><span class="lib-group-label">' + utils.escapeHtml(label) + '</span><span class="lib-group-topic">' + utils.escapeHtml(group.topic || group.field || '') + '</span></div>'
              + '<span class="lib-group-date">' + date + '</span>'
            + '</div>'
            + '<div class="lib-group-cards">' + docsHTML + '</div></div>';
    }

    function renderDocCard(doc) {
        var status    = doc._status || 'completed';
        var badge     = statusBadgeHTML(status);
        var typeInfo  = (CONFIG.DOC_TYPES || []).find(function(t) { return t.value === doc.type; }) || {};
        var icon      = typeInfo.icon || '&#128196;';
        var canExport = status === 'completed';
        var hasContent= !!(doc.content && doc.content.length > 10);
        var docId     = doc.id;
        var isExpanded= libState.expanded.has(docId);
        var preview   = (doc.content || '').replace(/[\r\n]+/g,' ').trim();
        var short     = preview.substring(0,200);
        var hasMore   = preview.length > 200;
        var statusHint = '';
        if (status === 'processing' || status === 'pending') {
            statusHint = '<span class="lib-card-hint lib-card-hint-warn"><i class="fas fa-spinner fa-spin"></i> \u751f\u6210\u4e2d</span>';
        } else if (status === 'failed') {
            statusHint = '<span class="lib-card-hint lib-card-hint-err"><i class="fas fa-exclamation-circle"></i> \u751f\u6210\u5931\u8d25</span>';
        }
        return '<div class="lib-card lib-card-' + status + '" id="libcard-' + docId + '">'
            + '<div class="lib-card-main">'
              + '<div class="lib-card-icon-wrap">' + icon + '</div>'
              + '<div class="lib-card-info">'
                + '<div class="lib-card-top"><h3 class="lib-card-title">' + utils.escapeHtml(doc.title||'\u672a\u547d\u540d') + '</h3>' + badge
                  + (hasMore ? '<button class="lib-btn-expand" onclick="window._libToggle(' + docId + ')">' + (isExpanded ? '\u6536\u8d77 \u2191' : '\u5c55\u5f00 \u2193') + '</button>' : '')
                + '</div>'
                + '<div class="lib-card-meta">'
                  + '<span><i class="fas fa-file-alt"></i> ' + utils.escapeHtml(doc.type||'') + '</span>'
                  + '<span><i class="fas fa-book"></i> ' + utils.escapeHtml(doc.field||'') + '</span>'
                  + (doc.word_count ? '<span><i class="fas fa-align-left"></i> ' + doc.word_count + ' \u5b57</span>' : '')
                  + '<span><i class="fas fa-clock"></i> ' + utils.formatDate(doc.created_at||doc.createdAt||'') + '</span>'
                + '</div>'
                + (preview ? '<div class="lib-card-preview' + (isExpanded?' expanded':'') + '" id="libprev-' + docId + '">' + utils.escapeHtml(isExpanded?preview:short) + (hasMore&&!isExpanded?'...':'') + '</div>' : '')
              + '</div>'
            + '</div>'
            + '<div class="lib-card-actions">'
              + (hasContent ? '<button class="lib-btn-view" onclick="window._libView(' + docId + ')"><i class="fas fa-eye"></i> \u67e5\u770b\u5185\u5bb9</button>' : '')
              + (canExport  ? '<button class="lib-btn-export" onclick="window._libExport(' + docId + ')"><i class="fas fa-file-word"></i> ' + (doc.type === 'AI降重' ? '\u4e0b\u8f7d\u539f\u683c\u5f0f Word' : '\u5bfc\u51fa Word') + '</button>' : '')
              + statusHint
              + '<button class="lib-btn-delete" onclick="window._libDelete(' + docId + ')" title="\u5220\u9664"><i class="fas fa-trash"></i></button>'
            + '</div></div>';
    }

    function statusBadgeHTML(status) {
        var map = {
            completed: ['lib-badge-success','\u5df2\u5b8c\u6210'],
            processing:['lib-badge-warning','\u751f\u6210\u4e2d'],
            pending:   ['lib-badge-warning','\u7b49\u5f85\u4e2d'],
            failed:    ['lib-badge-danger', '\u5931\u8d25'],
            partial:   ['lib-badge-warning','\u90e8\u5206\u5b8c\u6210']
        };
        var pair = map[status] || ['lib-badge-secondary', status];
        return '<span class="lib-status-badge ' + pair[0] + '">' + pair[1] + '</span>';
    }

    function emptyHTML(isFiltered) {
        var btn = isFiltered ? '' : '<button class="lib-btn-primary" onclick="window._libGoWrite()">\u5f00\u59cb\u521b\u4f5c</button>';
        return '<div class="lib-empty"><div style="font-size:52px;margin-bottom:16px">' + (isFiltered?'&#128269;':'&#128237;') + '</div>'
            + '<p>' + (isFiltered?'\u6ca1\u6709\u5339\u914d\u7684\u6587\u6863':'\u8fd8\u6ca1\u6709\u6587\u6863\uff0c\u53bb\u521b\u4f5c\u5427') + '</p>'
            + btn + '</div>';
    }
    function setBody(html) { var el = document.getElementById('libBody'); if (el) el.innerHTML = html; }

    window._libToggle = function(id) {
        if (libState.expanded.has(id)) libState.expanded.delete(id);
        else libState.expanded.add(id);
        renderDocs();
    };

    window._libView = function(id) {
        var doc = _docCache[id] || libState.allDocs.find(function(d){ return d.id === id; });
        if (!doc) { utils.showToast('\u6587\u6863\u4e0d\u5b58\u5728', 'error'); return; }
        var existing = document.getElementById('libViewerOverlay');
        if (existing) existing.remove();
        var typeInfo = (CONFIG.DOC_TYPES||[]).find(function(t){ return t.value === doc.type; }) || {};
        var icon = typeInfo.icon || '&#128196;';
        var content = (doc.content || '').trim();
        var docStatus = doc._status || normalizeStatus(doc);
        var metaHtml = '<span>' + utils.escapeHtml(doc.type||'') + '</span>'
            + (doc.field ? '<span>' + utils.escapeHtml(doc.field) + '</span>' : '')
            + (doc.word_count ? '<span>' + doc.word_count + ' \u5b57</span>' : '')
            + '<span>' + utils.formatDate(doc.created_at||doc.createdAt||'') + '</span>';
        var toolbarContent;
        if (docStatus === 'completed') {
            toolbarContent = '<button class="lib-btn-export" onclick="window._libExportAndClose(' + id + ')"><i class="fas fa-file-word"></i> ' + (doc.type === 'AI降重' ? '\u4e0b\u8f7d\u539f\u683c\u5f0f Word' : '\u5bfc\u51fa Word') + '</button>';
        } else if (docStatus === 'processing' || docStatus === 'pending') {
            toolbarContent = '<span style="font-size:12px;color:#fbbf24;display:flex;align-items:center;gap:6px;"><i class="fas fa-spinner fa-spin"></i> \u6587\u6863\u751f\u6210\u4e2d\uff0c\u5b8c\u6210\u540e\u53ef\u5bfc\u51fa</span>';
        } else {
            toolbarContent = '<span style="font-size:12px;color:#f87171;display:flex;align-items:center;gap:6px;"><i class="fas fa-exclamation-circle"></i> \u751f\u6210\u5931\u8d25\uff0c\u65e0\u6cd5\u5bfc\u51fa</span>';
        }
        var overlay = document.createElement('div');
        overlay.id = 'libViewerOverlay';
        overlay.className = 'lib-viewer-overlay';
        overlay.innerHTML =
            '<div class="lib-viewer" id="libViewerBox">'
            + '<div class="lib-viewer-head">'
              + '<div style="flex:1;min-width:0">'
                + '<div class="lib-viewer-title">' + icon + ' ' + utils.escapeHtml(doc.title||'\u672a\u547d\u540d') + '</div>'
                + '<div class="lib-viewer-meta">' + metaHtml + '</div>'
              + '</div>'
              + '<button class="lib-viewer-close" onclick="window._libCloseViewer()" title="\u5173\u95ed">\u00d7</button>'
            + '</div>'
            + '<div class="lib-viewer-toolbar">'
              + toolbarContent
              + '<span style="font-size:11px;color:rgba(255,255,255,.25);margin-left:auto">' + (content.length||0) + ' \u5b57\u7b26</span>'
            + '</div>'
            + '<div class="lib-viewer-body">'
              + (content ? '<div class="lib-viewer-content">' + utils.escapeHtml(content) + '</div>' : '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.3);font-size:14px">\u6682\u65e0\u5185\u5bb9</div>')
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        function onKey(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } }
        document.addEventListener('keydown', onKey);
    };

    window._libExport = async function(id) {
        var doc = _docCache[id] || libState.allDocs.find(function(d){ return d.id === id; });
        var title = doc ? (doc.title || '\u6587\u6863') : '\u6587\u6863';
        if (!localStorage.getItem('auth_token')) { utils.showToast('\u8bf7\u5148\u767b\u5f55', 'error'); auth.showAuthModal(); return; }
        try {
            var isAiRewrite = !!(doc && doc.type === 'AI降重');
            utils.showLoading(isAiRewrite ? '\u6b63\u5728\u51c6\u5907\u539f\u683c\u5f0f\u964d\u91cd\u6587\u4ef6...' : '\u6b63\u5728\u751f\u6210 Word \u6587\u6863...');
            var downloadUrl;
            if (isAiRewrite) {
                downloadUrl = '/api/document-export/rewrite-docx/' + encodeURIComponent(id);
            } else {
                var res = await api.exportDocumentWord(id);
                downloadUrl = (res.data && res.data.downloadUrl) ? res.data.downloadUrl : null;
                if (!downloadUrl) throw new Error('\u672a\u83b7\u53d6\u5230\u4e0b\u8f7d\u94fe\u63a5');
            }
            var baseOrigin = CONFIG.API_BASE_URL.replace('/api', '');
            var fullUrl = downloadUrl.startsWith('http') ? downloadUrl : baseOrigin + downloadUrl;
            utils.showLoading('\u6b63\u5728\u4e0b\u8f7d...');
            var token = localStorage.getItem('auth_token');
            var fetchRes = await fetch(fullUrl, { method: 'GET', headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
            if (!fetchRes.ok) throw new Error('\u4e0b\u8f7d\u5931\u8d25\uff0c\u670d\u52a1\u5668\u8fd4\u56de ' + fetchRes.status);
            var blob = await fetchRes.blob();
            utils.hideLoading();
            var blobUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = blobUrl; a.download = title + '.docx'; a.style.display = 'none';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 10000);
            utils.showToast('Word \u6587\u6863\u4e0b\u8f7d\u6210\u529f', 'success');
        } catch(e) {
            utils.hideLoading();
            utils.showToast(e.message || '\u5bfc\u51fa\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', 'error');
        }
    };

    window._libDelete = async function(id) {
        if (!confirm('\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u4e2a\u6587\u6863\u5417\uff1f\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\u3002')) return;
        try {
            utils.showLoading('\u6b63\u5728\u5220\u9664...');
            await api.deleteDocument(id);
            utils.hideLoading();
            utils.showToast('\u5220\u9664\u6210\u529f', 'success');
            delete _docCache[id];
            libState.allDocs = libState.allDocs.filter(function(d){ return d.id !== id; });
            renderDocs();
        } catch(e) {
            utils.hideLoading();
            utils.showToast(e.message || '\u5220\u9664\u5931\u8d25', 'error');
        }
    };

    window._libGoWrite = function() { router.navigate('writing'); };

    window._libCloseViewer = function() {
        var el = document.getElementById('libViewerOverlay');
        if (el) el.remove();
    };

    window._libExportAndClose = function(id) {
        window._libCloseViewer();
        window._libExport(id);
    };

})();
