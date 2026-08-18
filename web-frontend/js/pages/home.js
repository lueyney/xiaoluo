router.register('home', function () {
    if (auth.isLoggedIn()) {
        router.navigate('writing', true);
        return;
    }

    var mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
<div class="home-v2">
    <div class="home-v2-atmosphere" aria-hidden="true"><span></span><span></span></div>
    <main class="home-v2-shell">
        <section class="home-v2-hero" aria-labelledby="homeV2Title">
            <div class="home-v2-copy">
                <span class="home-v2-kicker"><i class="fas fa-sparkles" aria-hidden="true"></i> AI 小珞 · 学术写作工作台</span>
                <h1 id="homeV2Title">把复杂写作，<strong>整理成清晰步骤</strong></h1>
                <p>从课题梳理、内容生成到表达优化，把论文写作中的关键步骤放回同一条清晰路径。</p>
                <div class="home-v2-actions">
                    <button type="button" class="home-v2-primary" onclick="auth.showAuthModal()">开始使用 <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
                    <button type="button" class="home-v2-secondary" onclick="document.getElementById('homeV2Features').scrollIntoView({behavior:'smooth',block:'start'})">查看功能</button>
                </div>
                <div class="home-v2-note"><i class="fas fa-check" aria-hidden="true"></i><span>从第一份材料开始，随时回来继续</span></div>
            </div>

            <div class="home-v2-preview" aria-label="AI 小珞功能预览">
                <div class="home-v2-preview-head">
                    <div><span class="home-v2-preview-mark"><i class="fas fa-layer-group" aria-hidden="true"></i></span><strong>功能预览</strong></div>
                    <span>WORKSPACE</span>
                </div>
                <div class="home-v2-feature-tabs" role="tablist" aria-label="产品功能">
                    <button type="button" class="is-active" role="tab" aria-selected="true" aria-controls="homeV2PreviewBody" data-home-feature="writing"><i class="fas fa-pen-ruler" aria-hidden="true"></i><span>学术写作</span></button>
                    <button type="button" role="tab" aria-selected="false" aria-controls="homeV2PreviewBody" data-home-feature="rewrite"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>AI 降重</span></button>
                    <button type="button" role="tab" aria-selected="false" aria-controls="homeV2PreviewBody" data-home-feature="document"><i class="fas fa-file-word" aria-hidden="true"></i><span>文档降重</span></button>
                    <button type="button" role="tab" aria-selected="false" aria-controls="homeV2PreviewBody" data-home-feature="library"><i class="fas fa-folder-open" aria-hidden="true"></i><span>文档库</span></button>
                </div>
                <div class="home-v2-preview-body" id="homeV2PreviewBody" role="tabpanel" aria-live="polite"></div>
            </div>
        </section>

        <section class="home-v2-journey" aria-labelledby="homeV2JourneyTitle">
            <div class="home-v2-journey-heading">
                <span>一条清晰路径</span>
                <h2 id="homeV2JourneyTitle">从课题到成稿，不在多个工具间来回切换</h2>
            </div>
            <div class="home-v2-journey-rail" aria-label="写作流程">
                <button type="button" class="is-active" data-home-feature="writing"><b>01</b><span><strong>建立结构</strong><small>确定类型、学科和题目</small></span></button>
                <i class="fas fa-arrow-right" aria-hidden="true"></i>
                <button type="button" data-home-feature="rewrite"><b>02</b><span><strong>优化表达</strong><small>保留原意，降低重复</small></span></button>
                <i class="fas fa-arrow-right" aria-hidden="true"></i>
                <button type="button" data-home-feature="library"><b>03</b><span><strong>管理成果</strong><small>继续编辑、导出与归档</small></span></button>
            </div>
        </section>

        <section class="home-v2-features" id="homeV2Features" aria-labelledby="homeV2FeaturesTitle">
            <div class="home-v2-section-heading">
                <span>一个工作台</span>
                <h2 id="homeV2FeaturesTitle">需要的功能，都在同一条路径上</h2>
                <p>先写出结构，再优化表达，最后把结果保存为可以继续编辑的文档。</p>
            </div>
            <div class="home-v2-feature-grid">
                <button type="button" class="home-v2-feature-card is-primary" data-home-feature="writing">
                    <span class="home-v2-card-icon"><i class="fas fa-pen-ruler" aria-hidden="true"></i></span>
                    <span class="home-v2-card-copy"><strong>学术写作</strong><small>按文档类型和课题信息生成清晰结构。</small></span>
                    <i class="fas fa-arrow-up-right-from-square home-v2-card-arrow" aria-hidden="true"></i>
                </button>
                <button type="button" class="home-v2-feature-card" data-home-feature="rewrite">
                    <span class="home-v2-card-icon"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i></span>
                    <span class="home-v2-card-copy"><strong>AI 降重</strong><small>保留原意，减少重复表达，让语言更自然。</small></span>
                    <i class="fas fa-arrow-up-right-from-square home-v2-card-arrow" aria-hidden="true"></i>
                </button>
                <button type="button" class="home-v2-feature-card" data-home-feature="document">
                    <span class="home-v2-card-icon"><i class="fas fa-file-word" aria-hidden="true"></i></span>
                    <span class="home-v2-card-copy"><strong>文档降重</strong><small>上传 Word 文档，集中查看处理进度和结果。</small></span>
                    <i class="fas fa-arrow-up-right-from-square home-v2-card-arrow" aria-hidden="true"></i>
                </button>
                <button type="button" class="home-v2-feature-card" data-home-feature="library">
                    <span class="home-v2-card-icon"><i class="fas fa-folder-open" aria-hidden="true"></i></span>
                    <span class="home-v2-card-copy"><strong>文档库</strong><small>生成、下载和历史任务，都有清晰的去处。</small></span>
                    <i class="fas fa-arrow-up-right-from-square home-v2-card-arrow" aria-hidden="true"></i>
                </button>
            </div>
        </section>

        <section class="home-v2-bottom-cta" aria-label="开始使用">
            <div><span>从你的课题开始</span><h2>先完成一小步，再继续下一步。</h2></div>
            <button type="button" class="home-v2-primary" onclick="auth.showAuthModal()">进入工作台 <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
        </section>
    </main>
</div>`;

    window.initHomeV2();
});

(function () {
    var featureData = {
        writing: {
            label: '学术写作', icon: 'fa-pen-ruler', route: 'writing',
            title: '从课题信息开始组织内容',
            description: '选择文档类型，补充研究方向，先搭好结构再开始写。',
            steps: ['选择文档类型', '补充课题信息', '生成内容结构'],
            fields: [['文档类型', '论文'], ['研究方向', '企业管理研究']],
            action: '进入学术写作'
        },
        rewrite: {
            label: 'AI 降重', icon: 'fa-wand-magic-sparkles', route: 'rewrite',
            title: '保留原意，优化表达',
            description: '粘贴原文后选择模式，让句子更自然，也更符合你的写作语气。',
            steps: ['粘贴原文', '选择改写模式', '对照处理结果'],
            fields: [['原文', '粘贴需要降重的文本...'], ['结果', '优化后的表达会显示在这里']],
            action: '进入 AI 降重'
        },
        document: {
            label: '文档降重', icon: 'fa-file-word', route: 'document-rewrite',
            title: '整份文档，一次处理',
            description: '上传 Word 文档，查看处理进度并下载结果，不再反复切换页面。',
            steps: ['上传 Word 文档', '等待处理完成', '下载结果文档'],
            fields: [['文件格式', '.docx'], ['结果管理', '处理完成后可下载']],
            action: '进入文档降重'
        },
        library: {
            label: '文档库', icon: 'fa-folder-open', route: 'library',
            title: '让每一次结果都有去处',
            description: '集中查看生成与降重结果，随时继续编辑、下载或回到历史任务。',
            steps: ['查看最近任务', '继续编辑内容', '下载最终文档'],
            fields: [['最近任务', '论文初稿'], ['状态', '可继续编辑']],
            action: '打开文档库'
        }
    };

    function initHomeV2() {
        var preview = document.getElementById('homeV2PreviewBody');
        if (!preview) return;
        document.querySelectorAll('[data-home-feature]').forEach(function (button) {
            button.addEventListener('click', function () {
                var key = button.dataset.homeFeature;
                if (button.closest('.home-v2-feature-card') || button.closest('.home-v2-journey-rail')) {
                    document.querySelector('.home-v2-preview').scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                setHomeFeature(key);
            });
        });
        var tabs = Array.from(document.querySelectorAll('.home-v2-feature-tabs [role="tab"]'));
        tabs.forEach(function (tab, index) {
            tab.addEventListener('keydown', function (event) {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                var nextIndex = index;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
                if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = tabs.length - 1;
                tabs[nextIndex].focus();
                setHomeFeature(tabs[nextIndex].dataset.homeFeature);
            });
        });
        setHomeFeature('writing');
    }

    function setHomeFeature(key) {
        var data = featureData[key] || featureData.writing;
        var preview = document.getElementById('homeV2PreviewBody');
        if (!preview) return;
        document.querySelectorAll('.home-v2-feature-tabs [data-home-feature]').forEach(function (button) {
            var active = button.dataset.homeFeature === key;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('.home-v2-feature-card[data-home-feature]').forEach(function (button) {
            button.classList.toggle('is-primary', button.dataset.homeFeature === key);
        });
        document.querySelectorAll('.home-v2-journey-rail [data-home-feature]').forEach(function (button) {
            var active = button.dataset.homeFeature === key;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-current', active ? 'step' : 'false');
        });
        preview.innerHTML = '<div class="home-v2-preview-title"><div><span class="home-v2-preview-icon"><i class="fas ' + data.icon + '" aria-hidden="true"></i></span><div><strong>' + data.label + '</strong><small>' + data.title + '</small></div></div><span class="home-v2-preview-state">可开始</span></div>'
            + '<p class="home-v2-preview-desc">' + data.description + '</p>'
            + '<div class="home-v2-flow">' + data.steps.map(function (step, index) { return '<span class="' + (index === 0 ? 'is-current' : '') + '"><b>' + String(index + 1).padStart(2, '0') + '</b>' + step + '</span>'; }).join('<i class="fas fa-chevron-right" aria-hidden="true"></i>') + '</div>'
            + '<div class="home-v2-fields">' + data.fields.map(function (field) { return '<div><span>' + field[0] + '</span><strong>' + field[1] + '</strong></div>'; }).join('') + '</div>'
            + '<button type="button" class="home-v2-preview-action" data-home-route="' + data.route + '">' + data.action + '<i class="fas fa-arrow-right" aria-hidden="true"></i></button>';
        preview.querySelector('[data-home-route]').addEventListener('click', function () {
            router.navigate(this.dataset.homeRoute);
        });
    }

    window.initHomeV2 = initHomeV2;
    window.setHomeFeature = setHomeFeature;
})();
