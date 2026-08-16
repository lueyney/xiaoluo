let rewriteState = {
    isProcessing: false,
    rewriteVersion: 'v1',
    originalText: '',
    rewrittenText: '',
    liveText: '',
    progressLabel: '',
    abortController: null,
    streamTimer: null,
    delayedTitleTimer: null,
    flushTimer: null,
    progressTimer: null,
    progressStartedAt: 0,
    sentenceMeta: [],
    batchSize: 8,
    totalBatches: 0,
    displayedBatchCount: 0,
    renderedTexts: [],
    pendingSentenceTexts: {},
    pendingTitleIndexes: [],
    doneReceived: false,
    finalResultText: '',
    hasTitle: false,
    firstBatchUnlocked: false,
    titlesRevealEnabled: false,
    animatedProgressValue: 0
};

function clearRewriteTimers() {
    if (rewriteState.streamTimer) {
        clearInterval(rewriteState.streamTimer);
        rewriteState.streamTimer = null;
    }
    if (rewriteState.progressTimer) {
        clearInterval(rewriteState.progressTimer);
        rewriteState.progressTimer = null;
    }
    if (rewriteState.delayedTitleTimer) {
        clearTimeout(rewriteState.delayedTitleTimer);
        rewriteState.delayedTitleTimer = null;
    }
    if (rewriteState.flushTimer) {
        clearTimeout(rewriteState.flushTimer);
        rewriteState.flushTimer = null;
    }
}

function resetRewriteStreamState() {
    clearRewriteTimers();
    rewriteState.sentenceMeta = [];
    rewriteState.batchSize = 8;
    rewriteState.totalBatches = 0;
    rewriteState.displayedBatchCount = 0;
    rewriteState.renderedTexts = [];
    rewriteState.pendingSentenceTexts = {};
    rewriteState.pendingTitleIndexes = [];
    rewriteState.doneReceived = false;
    rewriteState.finalResultText = '';
    rewriteState.hasTitle = false;
    rewriteState.firstBatchUnlocked = false;
    rewriteState.titlesRevealEnabled = false;
    rewriteState.animatedProgressValue = 0;
    rewriteState.progressStartedAt = 0;
}

function getBatchCount(totalSentences) {
    return Math.max(1, Math.ceil((Number(totalSentences) || 0) / rewriteState.batchSize));
}

function computeBatchPercent(batchIndex) {
    if (!rewriteState.totalBatches) return 0;
    var unit = 100 / rewriteState.totalBatches;
    return Math.min(100, unit * batchIndex);
}

function getCurrentBatchProgressEnd() {
    if (!rewriteState.totalBatches) return 99;
    if (rewriteState.displayedBatchCount >= rewriteState.totalBatches - 1) {
        return 99;
    }
    return Math.max(
        computeBatchPercent(rewriteState.displayedBatchCount),
        computeBatchPercent(rewriteState.displayedBatchCount + 1) - 0.1
    );
}

function formatProgressLabel(value, forceInteger) {
    if (forceInteger) {
        return Math.round(value) + '%';
    }
    var safeValue = Math.max(0, Math.min(99.9, value));
    return safeValue.toFixed(1) + '%';
}

function startProgressForCurrentBatch() {
    if (rewriteState.doneReceived || rewriteState.rewrittenText) {
        return;
    }
    if (rewriteState.progressTimer) {
        clearInterval(rewriteState.progressTimer);
        rewriteState.progressTimer = null;
    }

    var startValue = computeBatchPercent(rewriteState.displayedBatchCount);
    var endValue = getCurrentBatchProgressEnd();
    rewriteState.progressStartedAt = Date.now();
    rewriteState.animatedProgressValue = startValue;
    rewriteState.progressLabel = formatProgressLabel(startValue, false);
    syncRewriteView();

    rewriteState.progressTimer = setInterval(function() {
        var elapsed = Date.now() - rewriteState.progressStartedAt;
        var ratio = Math.min(1, elapsed / 60000);
        rewriteState.animatedProgressValue = startValue + ((endValue - startValue) * ratio);
        rewriteState.progressLabel = formatProgressLabel(rewriteState.animatedProgressValue, false);
        syncRewriteView();

        if (ratio >= 1) {
            rewriteState.animatedProgressValue = endValue;
            rewriteState.progressLabel = formatProgressLabel(endValue, false);
            syncRewriteView();
            clearInterval(rewriteState.progressTimer);
            rewriteState.progressTimer = null;
        }
    }, 200);
}

function snapProgressToDisplayedBatch() {
    var boundary = computeBatchPercent(rewriteState.displayedBatchCount);
    if (rewriteState.progressTimer) {
        clearInterval(rewriteState.progressTimer);
        rewriteState.progressTimer = null;
    }
    rewriteState.animatedProgressValue = Math.min(99, boundary);
    rewriteState.progressLabel = formatProgressLabel(rewriteState.animatedProgressValue, false);
    syncRewriteView();
}


function buildRenderedRewriteText() {
    var paragraphs = [];
    var currentParagraph = [];
    var lastPIdx = null;

    for (var i = 0; i < rewriteState.renderedTexts.length; i++) {
        var text = rewriteState.renderedTexts[i];
        var meta = rewriteState.sentenceMeta[i] || {};
        if (text === null || text === undefined || String(text).length === 0) {
            continue;
        }

        if (meta.isTitle) {
            if (currentParagraph.length) {
                paragraphs.push(currentParagraph.join(''));
                currentParagraph = [];
            }
            paragraphs.push(String(text));
            lastPIdx = null;
            continue;
        }

        if (lastPIdx !== null && meta.pIdx !== lastPIdx && currentParagraph.length) {
            paragraphs.push(currentParagraph.join(''));
            currentParagraph = [];
        }

        currentParagraph.push(String(text));
        lastPIdx = meta.pIdx;
    }

    if (currentParagraph.length) {
        paragraphs.push(currentParagraph.join(''));
    }

    return paragraphs.join('\n');
}

function refreshRewriteLiveText() {
    rewriteState.liveText = buildRenderedRewriteText();
    syncRewriteView();
}

function canRevealTitleAtIndex(titleIdx) {
    if (!rewriteState.titlesRevealEnabled) {
        return false;
    }
    for (var i = 0; i < titleIdx; i++) {
        if (rewriteState.renderedTexts[i] === null || rewriteState.renderedTexts[i] === undefined || String(rewriteState.renderedTexts[i]).length === 0) {
            return false;
        }
    }
    return true;
}

function tryRevealPendingTitles() {
    var changed = false;
    while (rewriteState.pendingTitleIndexes.length) {
        var titleIdx = rewriteState.pendingTitleIndexes[0];
        if (!canRevealTitleAtIndex(titleIdx)) {
            break;
        }
        rewriteState.pendingTitleIndexes.shift();
        var meta = rewriteState.sentenceMeta[titleIdx] || {};
        rewriteState.renderedTexts[titleIdx] = meta.text || '';
        changed = true;
    }
    if (changed) {
        refreshRewriteLiveText();
    }
    return changed;
}

function isBatchReady(batchNumber) {
    var start = batchNumber * rewriteState.batchSize;
    var end = Math.min(start + rewriteState.batchSize, rewriteState.sentenceMeta.length);
    if (start >= end) return false;
    for (var idx = start; idx < end; idx++) {
        if (rewriteState.pendingSentenceTexts[idx] === undefined) {
            return false;
        }
    }
    return true;
}

function waitForDisplayedCompletion() {
    return Promise.resolve();
}

function tryFlushAvailableBatches() {
    if (rewriteState.hasTitle && !rewriteState.firstBatchUnlocked) {
        return false;
    }
    var changed = false;
    while (isBatchReady(rewriteState.displayedBatchCount)) {
        snapProgressToDisplayedBatch();
        var batchNumber = rewriteState.displayedBatchCount;
        var start = batchNumber * rewriteState.batchSize;
        var end = Math.min(start + rewriteState.batchSize, rewriteState.sentenceMeta.length);
        for (var idx = start; idx < end; idx++) {
            rewriteState.renderedTexts[idx] = rewriteState.pendingSentenceTexts[idx] || '';
            delete rewriteState.pendingSentenceTexts[idx];
        }
        rewriteState.displayedBatchCount += 1;
        changed = true;
    }
    if (changed) {
        refreshRewriteLiveText();
        tryRevealPendingTitles();
        if (!rewriteState.doneReceived && !rewriteState.rewrittenText && rewriteState.displayedBatchCount < rewriteState.totalBatches) {
            startProgressForCurrentBatch();
        }
    }
    return changed;
}

function flushNextBatch() {
    return tryFlushAvailableBatches();
}

function scheduleBatchProgress() {
    if (rewriteState.streamTimer) return;
    rewriteState.streamTimer = setInterval(function() {
        tryFlushAvailableBatches();
        if (rewriteState.displayedBatchCount >= rewriteState.totalBatches && rewriteState.streamTimer) {
            clearInterval(rewriteState.streamTimer);
            rewriteState.streamTimer = null;
        }
    }, 1000);
}

function revealFirstTitleAfterDelay() {
    rewriteState.delayedTitleTimer = setTimeout(function() {
        rewriteState.titlesRevealEnabled = true;
        tryRevealPendingTitles();
    }, 5000);
}

async function streamRewriteResult(originalText, level, rewriteVersion) {
    const url = `${CONFIG.API_BASE_URL}/rewrite/stream`;
    const controller = rewriteState.abortController;
    const response = await fetch(url, {
        method: 'POST',
        headers: api.getHeaders(),
        body: JSON.stringify({ originalText: originalText, rewriteLevel: level, rewriteVersion: rewriteVersion }),
        signal: controller.signal
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error((errData && (errData.error || errData.message)) || '请求失败');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    function handleEventBlock(block) {
        const lines = block.split('\n');
        let eventName = 'message';
        const dataLines = [];
        for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) return;
        let payload = null;
        try {
            payload = JSON.parse(dataLines.join('\n'));
        } catch (e) {
            return;
        }

        if (eventName === 'start') {
            rewriteState.sentenceMeta = Array.isArray(payload.sentencesMeta) ? payload.sentencesMeta : [];
            rewriteState.totalBatches = getBatchCount(payload.total);
            rewriteState.renderedTexts = new Array(rewriteState.sentenceMeta.length).fill(null);
            rewriteState.pendingSentenceTexts = {};
            rewriteState.pendingTitleIndexes = [];
            rewriteState.hasTitle = false;
            rewriteState.firstBatchUnlocked = true;
            for (var i = 0; i < rewriteState.sentenceMeta.length; i++) {
                if (rewriteState.sentenceMeta[i] && rewriteState.sentenceMeta[i].isTitle) {
                    rewriteState.pendingTitleIndexes.push(i);
                }
            }
            rewriteState.hasTitle = rewriteState.pendingTitleIndexes.length > 0;
            rewriteState.progressLabel = rewriteState.totalBatches > 0 ? '0.0%' : '100%';
            rewriteState.animatedProgressValue = 0;
            syncRewriteView();
            revealFirstTitleAfterDelay();
            scheduleBatchProgress();
            if (rewriteState.totalBatches > 0) {
                startProgressForCurrentBatch();
            }
            return;
        }

        if (eventName === 'sentence') {
            if (payload && payload.index !== undefined) {
                rewriteState.pendingSentenceTexts[payload.index] = payload.text || '';
                tryFlushAvailableBatches();
            }
            return;
        }

        if (eventName === 'done') {
            rewriteState.doneReceived = true;
            rewriteState.finalResultText = (payload && payload.rewrittenText) ? String(payload.rewrittenText).trim() : '';
            if (rewriteState.progressTimer) {
                clearInterval(rewriteState.progressTimer);
                rewriteState.progressTimer = null;
            }
            return;
        }

        if (eventName === 'error') {
            throw new Error((payload && payload.message) || '降重失败');
        }
    }

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
            handleEventBlock(part);
        }
    }

    if (buffer.trim()) {
        handleEventBlock(buffer);
    }

    return rewriteState.finalResultText || buildRenderedRewriteText().trim();
}

function getRewriteDomRefs() {
    return {
        originalTextEl: document.getElementById('originalText'),
        rewriteContentEl: document.getElementById('rewriteContent'),
        copyRewriteBtn: document.getElementById('copyRewriteBtn'),
        rewriteBtn: document.getElementById('rewriteBtn'),
        progressTextEl: document.getElementById('progressText'),
        cancelRewriteBtn: document.getElementById('cancelRewriteBtn')
    };
}

function syncRewriteView() {
    const { rewriteContentEl, copyRewriteBtn, rewriteBtn, progressTextEl, cancelRewriteBtn } = getRewriteDomRefs();
    if (!rewriteContentEl || !copyRewriteBtn || !rewriteBtn || !progressTextEl || !cancelRewriteBtn) return;

    if (rewriteState.rewrittenText) {
        rewriteContentEl.textContent = rewriteState.rewrittenText;
        copyRewriteBtn.disabled = false;
    } else if (rewriteState.liveText) {
        rewriteContentEl.textContent = rewriteState.liveText;
        copyRewriteBtn.disabled = true;
    } else {
        rewriteContentEl.innerHTML = '<span class="rewrite-placeholder">处理结果将在这里显示</span>';
        copyRewriteBtn.disabled = true;
    }

    if (rewriteState.isProcessing) {
        rewriteBtn.textContent = '\u5904\u7406\u4e2d...';
        rewriteBtn.disabled = true;
        progressTextEl.textContent = rewriteState.progressLabel || '0%';
        cancelRewriteBtn.style.display = 'block';
    } else {
        rewriteBtn.textContent = '\u5f00\u59cb\u964d\u91cd';
        rewriteBtn.disabled = false;
        progressTextEl.textContent = rewriteState.progressLabel || '';
        cancelRewriteBtn.style.display = 'none';
    }
}

router.register('rewrite', function() {
    resetRewriteStreamState();
    const mainContent = document.getElementById('mainContent');
    const userCredits = auth.isLoggedIn() ? auth.getCredits() : 0;

    mainContent.innerHTML = `
        <div class="wrt-page rewrite-page" style="min-height:100vh;">
            <div class="wrt-bg"></div>
            <div class="wrt-orb wrt-orb1"></div>
            <div class="wrt-orb wrt-orb2"></div>
            <div style="max-width:1300px;margin:0 auto;padding:52px 24px 80px;position:relative;z-index:1;">
                <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;">
                    <div>
                        <h1 class="rewrite-page-title" style="font-size:34px;font-weight:800;margin:0 0 6px;letter-spacing:-.8px;">AI 降重</h1>
                        <p class="rewrite-page-subtitle" style="font-size:14px;margin:0;">粘贴原文，选择适合的改写模式后开始处理</p>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
                        <button type="button" class="doc-rewrite-entry-btn" onclick="router.navigate('document-rewrite')"><i class="fas fa-file-word"></i><span>文档降重</span></button>
                    <div style="display:flex;align-items:center;gap:7px;padding:9px 18px;border-radius:50px;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.2);font-size:16px;font-weight:800;color:#fbbf24;white-space:nowrap;">
                        <i class="fas fa-coins"></i>
                        <span style="font-size:15px;font-weight:600;color:#fbbf24;">${userCredits}</span>
                        <span class="rewrite-muted" style="font-size:11px;font-weight:400;">积分</span>
                    </div></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
                    <div class="rewrite-editor-card" style="background:rgba(255,255,255,.03);border-radius:16px;padding:18px;border:1px solid rgba(255,255,255,.08);box-shadow:0 4px 24px rgba(0,0,0,.3);display:flex;flex-direction:column;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <div style="display:flex;align-items:center;gap:7px;">
                                <span style="width:20px;height:20px;border-radius:50%;background:#6366f1;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;">1</span>
                                <label class="rewrite-panel-label" style="font-size:14px;font-weight:600;">原文</label>
                            </div>
                            <span class="rewrite-muted" style="font-size:12px;"><span id="textCount">0</span> 字</span>
                        </div>
                        <textarea id="originalText" placeholder="粘贴需要降重的文本..."
                            style="flex:1;min-height:500px;max-height:640px;padding:12px;border:2px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.04);font-size:13px;color:#f0f4ff;outline:none;resize:none;font-family:inherit;line-height:1.8;transition:border-color 0.2s;box-sizing:border-box;overflow-y:auto;"
                            onfocus="this.style.borderColor='rgba(99,102,241,.7)'"
                            onblur="this.style.borderColor='rgba(255,255,255,.1)'"
                        >${rewriteState.originalText}</textarea>
                        <button id="clearBtn" class="rewrite-clear-btn" style="margin-top:10px;width:100%;padding:8px 0;border-radius:8px;background:linear-gradient(135deg,#fee2e2,#fecaca);border:1px solid #fca5a5;color:#dc2626;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.2s;"
                            onmouseover="this.style.background='linear-gradient(135deg,#fecaca,#fca5a5)';this.style.boxShadow='0 2px 8px rgba(220,38,38,0.2)'"
                            onmouseout="this.style.background='linear-gradient(135deg,#fee2e2,#fecaca)';this.style.boxShadow='none'"
                        >🗑 清空原文</button>
                    </div>
                    <div class="rewrite-editor-card rewrite-result-card" style="background:rgba(99,102,241,.05);border-radius:16px;padding:18px;border:1px solid rgba(99,102,241,.2);box-shadow:0 4px 24px rgba(0,0,0,.3);display:flex;flex-direction:column;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <div style="display:flex;align-items:center;gap:7px;">
                                <span style="width:20px;height:20px;border-radius:50%;background:#8b5cf6;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;">2</span>
                                <label class="rewrite-panel-label" style="font-size:14px;font-weight:600;">降重结果</label>
                                <span id="progressText" style="font-size:12px;color:#8b5cf6;font-weight:500;"></span>
                            </div>
                            <button onclick="copyRewriteResult()" id="copyRewriteBtn" class="rewrite-copy-btn" disabled
                                style="padding:3px 10px;border-radius:7px;background:#faf5ff;border:1px solid #ddd6fe;color:#6d28d9;font-size:12px;cursor:pointer;">复制</button>
                        </div>
                        <div id="rewriteContent"
                            style="flex:1;min-height:500px;max-height:640px;padding:12px;border-radius:10px;background:rgba(99,102,241,.07);white-space:pre-wrap;line-height:1.8;font-size:13px;color:#f0f4ff;overflow-y:auto;border:2px solid rgba(99,102,241,.2);"
                        ><span class="rewrite-placeholder">处理结果将在这里显示</span></div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <div id="rewriteVersionTabs" style="display:inline-flex;align-items:center;padding:4px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);gap:4px;">
                        <button type="button" data-rewrite-version="v1" style="padding:9px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:background-color .12s,color .12s,box-shadow .12s;">V1 学术版</button>
                        <button type="button" data-rewrite-version="v2" style="padding:9px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:background-color .12s,color .12s,box-shadow .12s;">V2 小说版</button>
                    </div>
                    <div class="rewrite-cost-panel" style="flex:1;display:flex;align-items:center;gap:10px;padding:13px 18px;background:rgba(255,255,255,.04);border-radius:12px;border:1px solid rgba(255,255,255,.08);">
                        <span class="rewrite-muted" style="font-size:13px;">预计消耗</span>
                        <span id="estimatedCredits" style="font-size:17px;font-weight:700;color:#6366f1;">0</span>
                        <span class="rewrite-muted" style="font-size:13px;">积分</span>
                    </div>
                    <button id="rewriteBtn"
                        style="padding:0 48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:15px;font-weight:600;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(99,102,241,0.4);transition:all 0.2s;white-space:nowrap;"
                        onmouseover="if(!this.disabled)this.style.transform='translateY(-2px)'"
                        onmouseout="this.style.transform='translateY(0)'"
                    >开始降重</button>
                    <button id="cancelRewriteBtn"
                        style="display:none;padding:0 32px;height:48px;border-radius:12px;background:linear-gradient(135deg,#fee2e2,#fecaca);color:#dc2626;font-size:15px;font-weight:600;border:1px solid #fca5a5;cursor:pointer;transition:all 0.2s;white-space:nowrap;"
                        onmouseover="this.style.background='linear-gradient(135deg,#fecaca,#fca5a5)';this.style.boxShadow='0 2px 8px rgba(220,38,38,0.2)'"
                        onmouseout="this.style.background='linear-gradient(135deg,#fee2e2,#fecaca)';this.style.boxShadow='none'"
                    >⏹ 取消降重</button>
                </div>
                <div class="rewrite-rate-note" aria-label="降重计费标准">
                    <i class="fas fa-coins" aria-hidden="true"></i>
                    <span>计费标准：<strong>${CONFIG.REWRITE_CREDITS_PER_1000} 积分 / 千字</strong></span>
                </div>
            </div>
        </div>
    `;

    const originalTextEl = document.getElementById('originalText');
    const textCount = document.getElementById('textCount');
    const estimatedCredits = document.getElementById('estimatedCredits');
    const rewriteVersionTabs = document.getElementById('rewriteVersionTabs');

    function syncRewriteVersionTabs() {
        const buttons = rewriteVersionTabs.querySelectorAll('[data-rewrite-version]');
        buttons.forEach(function(button) {
            const active = button.dataset.rewriteVersion === rewriteState.rewriteVersion;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
            button.style.background = active ? '#6366f1' : 'transparent';
            button.style.color = active ? '#fff' : 'rgba(255,255,255,.55)';
            button.style.boxShadow = active ? '0 3px 10px rgba(99,102,241,.28)' : 'none';
        });
    }

    rewriteVersionTabs.addEventListener('click', function(event) {
        const button = event.target.closest('[data-rewrite-version]');
        if (!button || rewriteState.isProcessing) return;
        rewriteState.rewriteVersion = ['v1', 'v2', 'v3'].includes(button.dataset.rewriteVersion)
            ? button.dataset.rewriteVersion
            : 'v1';
        syncRewriteVersionTabs();
    });
    syncRewriteVersionTabs();

    function updateCounts() {
        const len = originalTextEl.value.length;
        textCount.textContent = len;
        estimatedCredits.textContent = Math.ceil(len / 1000 * CONFIG.REWRITE_CREDITS_PER_1000);
    }
    updateCounts();
    originalTextEl.addEventListener('input', updateCounts);

    document.getElementById('clearBtn').addEventListener('click', function() {
        originalTextEl.value = '';
        rewriteState.originalText = '';
        updateCounts();
    });

    const cancelRewriteBtn = document.getElementById('cancelRewriteBtn');
    syncRewriteView();
    cancelRewriteBtn.addEventListener('click', function() {
        if (rewriteState.abortController) {
            rewriteState.abortController.abort();
        }
    });

    document.getElementById('rewriteBtn').addEventListener('click', async function(e) {
        e.preventDefault();
        if (!auth.isLoggedIn()) { utils.showToast('请先登录', 'error'); auth.showAuthModal(); return; }
        if (rewriteState.isProcessing) return;

        const originalText = originalTextEl.value.trim();
        if (originalText.length < 25) { utils.showToast('文本长度至少25字', 'error'); return; }

        const requiredCredits = Math.ceil(originalText.length / 1000 * CONFIG.REWRITE_CREDITS_PER_1000);
        if (auth.getCredits() < requiredCredits) {
            if (confirm(`积分不足\n当前：${auth.getCredits()} 积分，需要：${requiredCredits} 积分\n\n是否前往充值积分？`)) {
                try { localStorage.setItem('ordersDefaultTab', 'recharge'); } catch (e) {}
                router.navigate('orders');
            }
            return;
        }

        rewriteState.isProcessing = true;
        rewriteState.originalText = originalText;
        rewriteState.rewrittenText = '';
        rewriteState.liveText = '';
        rewriteState.progressLabel = '0%';
        rewriteState.abortController = new AbortController();
        resetRewriteStreamState();

        const rewriteContentDiv = document.getElementById('rewriteContent');
        rewriteState.liveText = '';
        syncRewriteView();

        try {
            rewriteState.progressLabel = '0%';
            syncRewriteView();
            const finalText = await streamRewriteResult(originalText, 2, rewriteState.rewriteVersion);
            if (!finalText) {
                throw new Error('未收到降重结果');
            }

            await waitForDisplayedCompletion();
            rewriteState.rewrittenText = finalText;
            rewriteState.liveText = finalText;
            rewriteState.animatedProgressValue = 100;
            rewriteState.progressLabel = formatProgressLabel(100, true);
            syncRewriteView();
            utils.showToast('降重完成', 'success');
            await auth.refreshUserInfo();
        } catch (error) {
            if (error.name === 'AbortError') {
                utils.showToast('已取消降重', 'info');
                rewriteContentDiv.innerHTML = rewriteState.liveText
                    ? rewriteState.liveText
                    : `<span style="color:#94a3b8;">已取消，降重结果在这里显示</span>`;
            } else {
                console.error('降重失败:', error);
                utils.showToast(error.message || '降重失败', 'error');
                rewriteContentDiv.innerHTML = `<span style="color:#ef4444;">错误: ${error.message}</span>`;
            }
        } finally {
            clearRewriteTimers();
            rewriteState.isProcessing = false;
            rewriteState.abortController = null;
            if (!rewriteState.rewrittenText) {
                rewriteState.progressLabel = '';
            }
            syncRewriteView();
        }
    });
});

// 文档模式入口：保持原 AI 降重页面不变，仅提供跳转按钮。
// 具体页面由 document-rewrite.js 独立注册，避免复用或修改文本降重状态。

window.copyRewriteResult = function() {
    const content = rewriteState.rewrittenText;
    if (!content || content === '处理中...') { utils.showToast('暂无内容', 'error'); return; }
    navigator.clipboard.writeText(content).then(() => {
        utils.showToast('已复制', 'success');
    }).catch(() => utils.showToast('复制失败', 'error'));
};
