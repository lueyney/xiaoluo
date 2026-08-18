// API 请求封装
class API {
    constructor() {
        this.baseURL = CONFIG.API_BASE_URL;
        this.timeout = CONFIG.REQUEST_TIMEOUT;
    }

    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = { ...options, headers: { ...this.getHeaders(), ...options.headers } };

        try {
            const controller = new AbortController();
            const timeoutMs = options._timeout || this.timeout;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetch(url, { ...config, signal: controller.signal });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    const code = data.code || '';
                    if (['TOKEN_EXPIRED','INVALID_TOKEN','MISSING_TOKEN'].includes(code)) {
                        localStorage.removeItem('auth_token');
                        localStorage.removeItem('user_info');
                        localStorage.removeItem('user_credits');
                        if (window.auth) { window.auth.token = null; window.auth.userInfo = null; window.auth.updateUI(); }
                        if (window.utils) window.utils.showToast('登录已过期，请重新登录', 'error');
                        setTimeout(() => { if (window.auth) window.auth.showAuthModal(); }, 500);
                    }
                }
                throw new Error(data.error || data.message || '请求失败');
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('请求超时，请稍后重试');
            throw error;
        }
    }

    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    async post(endpoint, data = {}, opts = {}) {
        return this.request(endpoint, { method: 'POST', body: JSON.stringify(data), ...opts });
    }

    async put(endpoint, data = {}) {
        return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // ==================== 认证 ====================
    async login(phone, password)           { return this.post('/auth/login', { phone, password }); }
    async register(phone, password, code)  { return this.post('/auth/register', { phone, password, code }); }
    async sendSms(phone, scene = 'register') { return this.post('/auth/send-code', { phone, scene }); }
    async getUserInfo()                    { return this.get('/user/profile'); }
    async bindInviteCode(inviteCode)       { return this.post('/user/invite/bind', { inviteCode }); }
    async claimInviteRewards()             { return this.post('/user/invite/claim'); }
    async getInviteStatus()                { return this.get('/user/invite/status'); }

    // ==================== AI 创作 ====================
    /**
     * 提交AI创作任务
     * @param {object} data - { topic, field, contentTypes: string[], requirements?, expectedCredits }
     * @returns {{ code: 'PROCESSING'|'INSUFFICIENT_CREDITS'|..., data: { orderId } }}
     */
    async generateDocument(data) {
        const selectedTypes = data.contentTypes || [];
        const expectedCredits = selectedTypes.reduce((sum, type) => {
            const found = CONFIG.DOC_TYPES.find(t => t.value === type);
            return sum + (found ? found.credits : 0);
        }, 0);
        return this.post('/writing/generate', {
            topic:          data.topic,
            field:          data.field,
            contentTypes:   selectedTypes,
            requirements:   data.requirements || '',
            expectedCredits
        });
    }

    /**
     * 生成AI题目建议（对标小程序 /api/title-generator/generate）
     */
    async generateTitle(field, excludeTitles = []) {
        return this.post('/title-generator/generate', { field, excludeTitles }, { _timeout: 45000 });
    }

    // ==================== 订单状态轮询（对标小程序 GET /api/orders/:id）====================
    async getOrderStatus(orderId) {
        return this.get(`/orders/${orderId}`);
    }

    async getOrders(params = {}) { return this.get('/orders', params); }

    // ==================== 文档库 ====================
    async getDocuments(params = {})  { return this.get('/documents', params); }
    async getDocument(id)            { return this.get(`/documents/${id}`); }
    async deleteDocument(id)         { return this.delete(`/documents/${id}`); }

    /**
     * 导出文档为 Word（对标小程序流程）
     * 返回 { data: { downloadUrl } }
     */
    async exportDocumentWord(documentId) {
        return this.post('/document-export/generate-word', { documentId });
    }

    /**
     * 直接下载文档 Word 文件（Blob）
     */
    async downloadDocumentBlob(downloadUrl) {
        const baseOrigin = this.baseURL.replace('/api', '');
        const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : baseOrigin + downloadUrl;
        const response = await fetch(fullUrl);
        if (!response.ok) throw new Error('下载失败，请重试');
        return response.blob();
    }

    // ==================== 降重 ====================
    async rewriteText(text, level = 2) {
        const url = `${this.baseURL}/rewrite/process`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ originalText: text, rewriteLevel: level }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '请求失败');
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error('降重请求超时（超过10分钟），请稍后重试');
            throw error;
        }
    }
}

const api = new API();
window.api = api;
