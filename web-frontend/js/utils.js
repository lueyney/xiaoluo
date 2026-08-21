// 工具函数库
const utils = {
    // Toast 提示
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = message;
            toast.className = `toast ${type}`;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        } else {
            console.log(`Toast: ${message}`);
        }
    },

    // 显示加载指示器
    showLoading(message = '加载中...') {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('active');
            const text = overlay.querySelector('.loading-text');
            if (text) text.textContent = message;
        }
    },

    // 隐藏加载指示器
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    },

    // 防抖函数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // 节流函数
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // 格式化日期
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    },

    // 格式化文件大小
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    // 验证手机号
    validatePhone(phone) {
        return /^1[3-9]\d{9}$/.test(phone);
    },

    // 验证密码
    validatePassword(password) {
        return password && password.length >= 6 && password.length <= 20;
    },

    // 验证验证码
    validateCode(code) {
        return /^\d{6}$/.test(code);
    },

    // 复制到剪贴板
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('复制成功', 'success');
            return true;
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.showToast('复制成功', 'success');
                return true;
            } catch (err) {
                this.showToast('复制失败', 'error');
                return false;
            } finally {
                document.body.removeChild(textarea);
            }
        }
    },

    // 转义HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // 安全渲染模型返回的 Markdown。先转义原始 HTML，再解析常用块级与行内语法。
    renderMarkdown(markdown) {
        const source = String(markdown || '').replace(/\r\n?/g, '\n');
        const escape = value => this.escapeHtml(String(value || ''));
        const inline = value => {
            const codeTokens = [];
            let text = escape(value).replace(/`([^`]+)`/g, (_, code) => {
                const token = `\u0000CODE${codeTokens.length}\u0000`;
                codeTokens.push(`<code>${code}</code>`);
                return token;
            });
            text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_, label, url) =>
                `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
            text = text
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/__([^_]+)__/g, '<strong>$1</strong>')
                .replace(/~~([^~]+)~~/g, '<del>$1</del>')
                .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
                .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
            return text.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeTokens[Number(index)] || '');
        };
        const lines = source.split('\n');
        const html = [];
        let paragraph = [];
        let listType = '';
        let quote = [];
        const flushParagraph = () => {
            if (!paragraph.length) return;
            html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
            paragraph = [];
        };
        const closeList = () => {
            if (!listType) return;
            html.push(`</${listType}>`);
            listType = '';
        };
        const flushQuote = () => {
            if (!quote.length) return;
            html.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
            quote = [];
        };

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const fence = line.match(/^\s*```([^`]*)$/);
            if (fence) {
                flushParagraph(); closeList(); flushQuote();
                const code = [];
                index += 1;
                while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
                    code.push(lines[index]); index += 1;
                }
                const language = fence[1].trim().replace(/[^a-z0-9_-]/gi, '');
                html.push(`<pre><code${language ? ` class="language-${language}"` : ''}>${escape(code.join('\n'))}</code></pre>`);
                continue;
            }
            if (!line.trim()) {
                flushParagraph(); closeList(); flushQuote();
                continue;
            }
            const heading = line.match(/^(#{1,6})\s+(.+)$/);
            if (heading) {
                flushParagraph(); closeList(); flushQuote();
                const level = heading[1].length;
                html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
                continue;
            }
            if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
                flushParagraph(); closeList(); flushQuote(); html.push('<hr>');
                continue;
            }
            const quoteLine = line.match(/^\s*>\s?(.*)$/);
            if (quoteLine) {
                flushParagraph(); closeList(); quote.push(quoteLine[1]);
                continue;
            }
            flushQuote();
            const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
            const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
            if (unordered || ordered) {
                flushParagraph();
                const nextType = ordered ? 'ol' : 'ul';
                if (listType && listType !== nextType) closeList();
                if (!listType) { listType = nextType; html.push(`<${listType}>`); }
                html.push(`<li>${inline((unordered || ordered)[1])}</li>`);
                continue;
            }
            closeList();
            paragraph.push(line);
        }
        flushParagraph(); closeList(); flushQuote();
        return html.join('');
    },

    // 获取URL参数
    getUrlParam(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    },

    // 本地存储封装
    storage: {
        set(key, value) {
            try {
                const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                localStorage.setItem(key, stringValue);
                return true;
            } catch (err) {
                console.error('存储失败:', err);
                return false;
            }
        },
        
        get(key) {
            try {
                const value = localStorage.getItem(key);
                if (!value || value === 'undefined' || value === 'null') {
                    return null;
                }
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            } catch (err) {
                console.error('读取失败:', err);
                return null;
            }
        },
        
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (err) {
                console.error('删除失败:', err);
                return false;
            }
        },
        
        clear() {
            try {
                localStorage.clear();
                return true;
            } catch (err) {
                console.error('清空失败:', err);
                return false;
            }
        }
    }
};

window.utils = utils;
