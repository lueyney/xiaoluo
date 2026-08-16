// 配置文件
const CONFIG = {
    // API基础URL
    API_BASE_URL: (() => {
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        const forcedProdApi = window.__API_BASE_URL__ || localStorage.getItem('apiBaseUrl');

        if (isLocal) return 'http://localhost:3001/api';

        // 生产环境只接受主域名API，避免被本地存储中的错误子域名污染
        if (forcedProdApi) {
            try {
                const parsed = new URL(forcedProdApi);
                if (parsed.hostname === 'yaoguangxiaoluo.cn') {
                    return forcedProdApi.replace(/\/$/, '');
                }
                localStorage.removeItem('apiBaseUrl');
            } catch (_) {
                localStorage.removeItem('apiBaseUrl');
            }
        }

        // 统一走正式主域名
        return 'https://yaoguangxiaoluo.cn/api';
    })(),

    // 本地存储键名
    STORAGE_KEYS: {
        TOKEN: 'auth_token',
        USER_INFO: 'user_info',
        CREDITS: 'user_credits',
        GENERATION_STATE: 'currentGenerationState',
        GENERATION_NOTIFIED: 'generationSuccessNotified',
        LAST_GEN_STATUS: 'lastGenerationStatus',
        HAS_NEW_DOCS: 'hasNewDocuments'
    },

    // 文档类型配置（与小程序对标）
    DOC_TYPES: [
        { icon: '📝', label: '学术论文', value: '学术范文',  credits: 120, description: '完整的学术研究论文' },
        { icon: '📄', label: '开题报告', value: '开题报告',  credits: 40,  description: '研究计划和方法说明' },
        { icon: '🛠️', label: '任务书',   value: '任务书',   credits: 25,  description: '项目任务安排文档'   },
        { icon: '📚', label: '文献综述', value: '文献综述',  credits: 20,  description: '多篇文献综述整合'   },
        { icon: '🎤', label: '答辩稿',   value: '答辩稿',   credits: 10,  description: '答辩演讲稿撰写'     },
        { icon: '📎', label: '中期检查表', value: '中期检查表', credits: 10, description: '研究进度检查记录' }
    ],

    // 学科领域完整列表（与小程序对标）
    FIELDS: [
        '哲学','理论经济学','应用经济学','法学','政治学','社会学',
        '民族学','马克思主义理论','教育学','心理学','体育学',
        '文学','中国语言文学','外国语言文学','新闻传播学',
        '化学','天文学','地理学','生态学','统计学',
        '力学','机械工程','材料科学与工程','电气工程',
        '电子科学与技术','信息与通信工程','控制科学与工程',
        '计算机科学与技术','化学工程与技术','纺织科学与工程',
        '轻工技术与工程','交通运输工程','兵器科学与技术',
        '农业工程','林业工程','环境科学与工程','生物医学工程',
        '食品科学与工程','城乡规划学','风景园林学','软件工程',
        '农学','林学','医学','药学','护理学',
        '工商管理','农林经济管理','公共管理','图书情报与档案管理',
        '设计学','其他'
    ],

    // 定价策略：1元 = 10积分
    // 新用户免费领取20积分（仅一次）
    // AI降重：1万字消耗180积分（约18积分/千字）
    REWRITE_CREDITS_PER_1000: 18, // 每1000字消耗18积分

    // 降重级别
    REWRITE_LEVELS: [
        { value: 1, label: '轻度降重', desc: '保持原文结构，调整表达方式' },
        { value: 2, label: '中度降重', desc: '改变句式结构，替换关键词'   },
        { value: 3, label: '深度降重', desc: '重新组织内容，大幅改写'     }
    ],

    // 请求超时（毫秒）
    REQUEST_TIMEOUT: 60000,

    // 生成轮询配置（对标小程序）
    POLL_CONFIG: {
        MAX_ATTEMPTS: 30,
        FIRST_DELAY:  35000,  // 首次等待35s
        NORMAL_DELAY: 6000,   // 正常间隔6s
        SLOW_DELAY:   20000,  // 慢速间隔20s
        SLOW_AFTER:   8       // 第8次之后切换慢速
    },

    PAGE_SIZE: 10
};

window.CONFIG = CONFIG;

// 清理历史错误API缓存，避免请求打到错误域名
(function cleanupBadApiBase(){
    const bad = localStorage.getItem('apiBaseUrl');
    if (bad && /yaoguang\.yaoguangxiaoluo\.cn/i.test(bad)) {
        localStorage.removeItem('apiBaseUrl');
    }
})();
