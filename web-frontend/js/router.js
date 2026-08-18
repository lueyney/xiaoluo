// 路由管理
class Router {
    constructor() {
        this.routes = {};
        this.currentPage = null;
        this.navigationId = 0;
    }

    // 注册路由
    register(name, handler) {
        this.routes[name] = handler;
        console.log('Router: 注册路由 -', name);
    }

    // 初始化
    init() {
        console.log('Router: 开始初始化');
        console.log('Router: 已注册的路由 -', Object.keys(this.routes));
        
        // 监听导航链接点击
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                const page = link.dataset.page;
                console.log('Router: 点击导航 -', page);
                this.navigate(page);
            });
        });

        // 监听浏览器前进后退
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) {
                this.loadPage(e.state.page, false);
            }
        });

        // 加载初始页面
        const hash = window.location.hash.slice(1) || 'home';
        console.log('Router: 加载初始页面 -', hash);
        this.navigate(hash, true);
    }

    // 导航到页面
    navigate(page, replace = false) {
        if (page === 'profile') {
            page = window.auth && auth.isLoggedIn() ? 'writing' : 'home';
            replace = true;
        }
        if (page === 'home' && window.auth && auth.isLoggedIn()) {
            page = 'writing';
            replace = true;
        }
        console.log('Router: 导航到 -', page);

        // 当前页再次点击不重建内容，避免闪动、表单重置和重复历史记录。
        if (!replace && page === this.currentPage) return;
        
        // 更新URL
        if (replace) {
            window.history.replaceState({ page }, '', '#' + page);
        } else {
            window.history.pushState({ page }, '', '#' + page);
        }

        // 加载页面
        this.loadPage(page);
    }

    // 加载页面
    loadPage(page, updateNav = true) {
        console.log('Router: 加载页面 -', page);

        if (page === 'profile' || (page === 'home' && window.auth && auth.isLoggedIn())) {
            page = window.auth && auth.isLoggedIn() ? 'writing' : 'home';
            window.history.replaceState({ page }, '', '#' + page);
        }
        
        // 检查路由是否存在
        if (!this.routes[page]) {
            console.error('Router: 页面不存在 -', page);
            page = 'home';
            window.history.replaceState({ page }, '', '#' + page);
        }

        // 公共落地页采用独立的明亮品牌外观，离开首页后立即恢复工作台主题。
        document.body.classList.toggle('public-home-view', page === 'home');

        // 检查路由处理器是否是函数
        if (typeof this.routes[page] !== 'function') {
            console.error('Router: 路由处理器不是函数 -', page);
            return;
        }

        // 更新导航状态
        if (updateNav) {
            document.querySelectorAll('.nav-link').forEach(link => {
                if (link.dataset.page === page) {
                    link.classList.add('active');
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.classList.remove('active');
                    link.removeAttribute('aria-current');
                }
            });
        }

        // 先绘制导航反馈，再渲染页面内容，避免选中态卡顿。
        const navigationId = ++this.navigationId;
        this.currentPage = page;
        requestAnimationFrame(() => setTimeout(() => {
            if (navigationId !== this.navigationId) return;
            try {
                this.routes[page]();
                console.log('Router: 页面加载成功 -', page);
            } catch (error) {
                console.error('Router: 页面加载失败 -', page, error);
            }
        }, 0));
    }

    // 获取当前页面
    getCurrentPage() {
        return this.currentPage;
    }
}

// 创建路由实例
const router = new Router();

// 导出路由实例
window.router = router;

console.log('Router: 路由系统已创建');
