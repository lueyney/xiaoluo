router.register('home', function () {
    if (auth.isLoggedIn()) {
        router.navigate('writing', true);
        return;
    }

    var mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
<div class="public-home">
    <main class="landing-shell">
        <section class="landing-hero">
            <div class="landing-hero-copy">
                <span class="landing-kicker">AI 小珞 · 学术写作工作台</span>
                <h1>把论文写作，<br>整理成清晰的下一步</h1>
                <p>从选题、开题到正文与答辩材料，在同一个工作台完成。</p>
                <div class="landing-actions">
                    <button type="button" class="landing-primary" onclick="auth.showAuthModal()">开始创作 <i class="fas fa-arrow-right"></i></button>
                    <button type="button" class="landing-secondary" onclick="document.getElementById('homeCapabilities').scrollIntoView({behavior:'smooth',block:'start'})">查看支持内容</button>
                </div>
                <div class="landing-trust">
                    <span><i class="fas fa-check"></i> 生成前显示积分</span>
                    <span><i class="fas fa-check"></i> 文档统一管理</span>
                    <span><i class="fas fa-check"></i> 支持继续编辑</span>
                </div>
            </div>

            <aside class="landing-document-card" aria-label="支持的学术材料">
                <div class="landing-document-head">
                    <span><i class="fas fa-file-lines"></i></span>
                    <div><strong>学术材料</strong><small>覆盖常用毕业写作场景</small></div>
                </div>
                <div class="landing-document-list">
                    <div><span>学术论文</span><b>120 积分</b></div>
                    <div><span>开题报告</span><b>40 积分</b></div>
                    <div><span>文献综述</span><b>20 积分</b></div>
                    <div><span>任务书</span><b>25 积分</b></div>
                    <div><span>答辩稿 / 中期检查</span><b>10 积分</b></div>
                </div>
                <button type="button" onclick="auth.showAuthModal()">选择文档类型 <i class="fas fa-chevron-right"></i></button>
            </aside>
        </section>

        <section class="landing-capabilities" id="homeCapabilities" aria-labelledby="homeCapabilitiesTitle">
            <div class="landing-section-head">
                <span>核心能力</span>
                <h2 id="homeCapabilitiesTitle">写作流程需要的工具，都在这里</h2>
            </div>
            <div class="landing-capability-grid">
                <article>
                    <span class="landing-capability-icon"><i class="fas fa-pen-nib"></i></span>
                    <h3>学术写作</h3>
                    <p>按文档类型填写课题信息，生成结构完整的学术材料。</p>
                </article>
                <article>
                    <span class="landing-capability-icon"><i class="fas fa-file-pen"></i></span>
                    <h3>文本降重</h3>
                    <p>在保留原意的前提下优化表达，可切换不同改写版本。</p>
                </article>
                <article>
                    <span class="landing-capability-icon"><i class="fas fa-folder-open"></i></span>
                    <h3>文档管理</h3>
                    <p>集中查看生成结果，继续编辑或导出需要的文档。</p>
                </article>
            </div>
        </section>

        <section class="landing-final-cta">
            <div><h2>从你的课题开始</h2><p>登录后即可创建第一份学术材料。</p></div>
            <button type="button" class="landing-primary" onclick="auth.showAuthModal()">登录并开始</button>
        </section>
    </main>
</div>`;
});
