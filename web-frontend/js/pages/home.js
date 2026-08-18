router.register('home', function () {
    if (auth.isLoggedIn()) {
        router.navigate('writing', true);
        return;
    }

    var mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
<div class="public-home">
    <div class="landing-atmosphere" aria-hidden="true"><span></span><span></span></div>
    <main class="landing-shell">
        <section class="landing-hero">
            <div class="landing-hero-copy">
                <span class="landing-kicker"><i class="fas fa-sparkles"></i> AI 小珞 · 学术写作工作台</span>
                <h1>让论文写作，<br><em>更有章法。</em></h1>
                <p>从课题梳理、材料生成到论文降重，把复杂任务拆成清楚、可继续的每一步。</p>
                <div class="landing-actions">
                    <button type="button" class="landing-primary" onclick="auth.showAuthModal()">免费开始 <i class="fas fa-arrow-right"></i></button>
                    <button type="button" class="landing-secondary" onclick="document.getElementById('homeCapabilities').scrollIntoView({behavior:'smooth',block:'start'})">了解工作台</button>
                </div>
                <div class="landing-trust">
                    <span><i class="fas fa-check"></i> 多类学术材料</span>
                    <span><i class="fas fa-check"></i> 写作与降重一体</span>
                    <span><i class="fas fa-check"></i> 结果随时继续编辑</span>
                </div>
            </div>

            <aside class="landing-workspace-card" aria-label="AI小珞工作台预览">
                <div class="landing-workspace-top">
                    <div><span class="landing-status-dot"></span><strong>新建写作任务</strong></div>
                    <span>AI ASSISTED</span>
                </div>
                <div class="landing-topic-card">
                    <span>当前课题</span>
                    <strong>数字化转型背景下的企业管理研究</strong>
                    <small><i class="fas fa-circle-check"></i> 已完成课题信息整理</small>
                </div>
                <div class="landing-workflow-list">
                    <div class="is-done"><b>01</b><span><strong>明确写作目标</strong><small>类型、方向与篇幅</small></span><i class="fas fa-check"></i></div>
                    <div class="is-current"><b>02</b><span><strong>生成内容结构</strong><small>章节与论证路径</small></span><em>进行中</em></div>
                    <div><b>03</b><span><strong>完善并导出</strong><small>继续编辑或下载文档</small></span></div>
                </div>
                <button type="button" onclick="auth.showAuthModal()"><span><i class="fas fa-wand-magic-sparkles"></i> 创建我的写作任务</span><i class="fas fa-arrow-right"></i></button>
            </aside>
        </section>

        <section class="landing-capabilities" id="homeCapabilities" aria-labelledby="homeCapabilitiesTitle">
            <div class="landing-section-head">
                <span>ONE WORKSPACE</span>
                <h2 id="homeCapabilitiesTitle">需要的能力，刚好都在这里</h2>
                <p>更少跳转，更清晰地完成从内容创建到文档交付。</p>
            </div>
            <div class="landing-capability-grid">
                <article>
                    <span class="landing-capability-number">01</span>
                    <span class="landing-capability-icon"><i class="fas fa-pen-ruler"></i></span>
                    <h3>学术材料写作</h3>
                    <p>按文档类型和课题信息组织内容，让结构与写作目标更清楚。</p>
                    <span class="landing-capability-meta">论文 · 开题 · 综述 · 答辩</span>
                </article>
                <article>
                    <span class="landing-capability-number">02</span>
                    <span class="landing-capability-icon"><i class="fas fa-file-pen"></i></span>
                    <h3>智能降重</h3>
                    <p>支持文本与 Word 文档降重，保留原意并优化重复表达。</p>
                    <span class="landing-capability-meta">文本 · Word · AIGC 报告</span>
                </article>
                <article>
                    <span class="landing-capability-number">03</span>
                    <span class="landing-capability-icon"><i class="fas fa-folder-open"></i></span>
                    <h3>文档管理</h3>
                    <p>集中查看生成与降重结果，继续编辑、下载或回到历史任务。</p>
                    <span class="landing-capability-meta">集中保存 · 随时继续</span>
                </article>
            </div>
        </section>

        <section class="landing-final-cta">
            <div><span>READY TO START?</span><h2>从你的课题开始，完成第一份材料。</h2><p>登录后即可进入学术写作工作台。</p></div>
            <button type="button" class="landing-primary" onclick="auth.showAuthModal()">登录并开始 <i class="fas fa-arrow-right"></i></button>
        </section>
    </main>
</div>`;
});
