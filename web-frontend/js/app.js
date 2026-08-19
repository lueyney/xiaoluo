// 应用初始化
(function initThemePreference() {
    try {
        if (localStorage.getItem('ai-theme') === 'light') document.body.classList.add('light-theme');
        document.body.classList.remove('public-home-view');
    } catch (e) {
        console.warn('主题偏好读取失败:', e);
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    console.log('========================================');
    console.log('AI小珞 Web 应用启动');
    console.log('========================================');
    console.log('API地址:', CONFIG.API_BASE_URL);
    
    // 清理localStorage中的无效数据
    try {
        const token = localStorage.getItem('auth_token');
        if (token === 'undefined' || token === 'null') {
            localStorage.removeItem('auth_token');
        }
        const userInfo = localStorage.getItem('user_info');
        if (userInfo === 'undefined' || userInfo === 'null') {
            localStorage.removeItem('user_info');
        }
        console.log('✓ localStorage 清理完成');
    } catch (e) {
        console.error('✗ 清理localStorage失败:', e);
    }
    
    // 移动端导航切换
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    const themeToggle = document.getElementById('themeToggle');
    const brandButton = document.getElementById('brandButton');

    if (brandButton) {
        brandButton.addEventListener('click', () => {
            if (navMenu) navMenu.classList.remove('active');
            router.navigate('writing');
        });
    }

    function syncThemeButton() {
        if (!themeToggle) return;
        const isLight = document.body.classList.contains('light-theme');
        themeToggle.setAttribute('aria-pressed', String(isLight));
        themeToggle.setAttribute('title', isLight ? '切换到夜间模式' : '切换到亮色模式');
        themeToggle.classList.toggle('is-light', isLight);
        const icon = themeToggle.querySelector('.theme-toggle-icon');
        if (icon) icon.className = `fas ${isLight ? 'fa-moon' : 'fa-sun'} theme-toggle-icon`;
    }

    if (themeToggle) {
        syncThemeButton();
        themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            try { localStorage.setItem('ai-theme', isLight ? 'light' : 'dark'); } catch (e) { /* 偏好保存失败不影响切换 */ }
            syncThemeButton();
        });
    }
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
        console.log('✓ 移动端导航已初始化');
    }
    
    // 点击导航链接后关闭移动端菜单
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (navMenu) {
                navMenu.classList.remove('active');
            }
        });
    });
    
    // 滚动时添加导航栏阴影
    let lastScroll = 0;
    window.addEventListener('scroll', utils.throttle(() => {
        const navbar = document.getElementById('navbar');
        if (navbar) {
            const currentScroll = window.pageYOffset;
            
            if (currentScroll > 10) {
                navbar.style.boxShadow = 'var(--shadow-md)';
            } else {
                navbar.style.boxShadow = 'var(--shadow-sm)';
            }
            
            lastScroll = currentScroll;
        }
    }, 100));
    
    // 添加状态标签样式
    const style = document.createElement('style');
    style.textContent = `
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge-primary {
            background: var(--primary-color);
            color: white;
        }
        .badge-success {
            background: var(--success-color);
            color: white;
        }
        .badge-warning {
            background: var(--warning-color);
            color: white;
        }
        .badge-danger {
            background: var(--danger-color);
            color: white;
        }
        .badge-secondary {
            background: var(--secondary-color);
            color: white;
        }
        @media (max-width: 768px) {
            .nav-menu {
                background: rgba(8, 11, 20, 0.98) !important;
                border-top: 1px solid rgba(255,255,255,0.08);
                padding: 12px !important;
                box-shadow: 0 14px 28px rgba(0,0,0,.45) !important;
            }
            .nav-link {
                color: rgba(255,255,255,.78) !important;
                text-align: left;
                border: 1px solid rgba(255,255,255,0.06);
                background: rgba(255,255,255,0.02);
            }
            .nav-link.active {
                border-color: rgba(99,102,241,.45);
            }
            .nav-toggle {
                color: rgba(255,255,255,.9) !important;
            }
        }
    `;
    document.head.appendChild(style);
    console.log('✓ 样式已添加');
    
    // 延迟初始化路由，确保所有页面都已注册
    console.log('等待路由注册完成...');
    setTimeout(() => {
        console.log('已注册的路由:', Object.keys(router.routes));
        if (Object.keys(router.routes).length === 0) {
            console.error('✗ 没有注册任何路由！');
        } else {
            console.log('✓ 路由注册完成，开始初始化');
            router.init();
        }
    }, 500);
});

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('全局错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的Promise拒绝:', event.reason);
});

// 导出全局对象
window.app = {
    version: '1.0.0',
    name: 'AI小珞',
    config: CONFIG,
    utils: utils,
    api: api,
    auth: auth,
    router: router
};

console.log('应用版本:', window.app.version);
console.log('========================================');
