/* 独立的 Word 文档降重页面。现有 AI 降重页面保持不变。 */
(function () {
    'use strict';

    var state = {
        file: null,
        reportFile: null,
        processing: false,
        jobId: null,
        pollTimer: null,
        lastStatus: null,
        pollDelayMs: 3000,
        pollFailures: 0
    };
    var JOB_STORAGE_KEY = 'document_rewrite_job_id';
    var MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
    var lastRenderedResultsSignature = '';

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        var units = ['B', 'KB', 'MB', 'GB'];
        var i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + units[i];
    }

    function notify(message, type) {
        if (window.utils && typeof window.utils.showToast === 'function') {
            window.utils.showToast(message, type || 'info');
        } else {
            window.alert(message);
        }
    }

    function authHeaders() {
        var memoryToken = window.auth && window.auth.token;
        var storedToken = localStorage.getItem('auth_token');
        var isUsable = function (value) { return value && value !== 'undefined' && value !== 'null'; };
        var token = isUsable(memoryToken) ? memoryToken : (isUsable(storedToken) ? storedToken : '');
        if (!token || token === 'undefined' || token === 'null') return {};
        return { Authorization: 'Bearer ' + token };
    }

    function resolveApiUrl(endpoint) {
        var base = (window.CONFIG && CONFIG.API_BASE_URL) || '';
        var value = String(endpoint || '');
        if (/^https?:\/\//i.test(value)) return value;
        if (value.indexOf('/api/') === 0) {
            try { return new URL(base).origin + value; } catch (_) { return value; }
        }
        return base.replace(/\/+$/, '') + '/' + value.replace(/^\/+/, '');
    }

    async function assertDocxBlob(blob) {
        if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('下载结果为空');
        var bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
        // DOCX is an OOXML ZIP package and must begin with the ZIP signature.
        if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
            throw new Error('服务器返回的不是有效 Word 文档');
        }
        return blob;
    }

    function resetStartButton(label) {
        state.processing = false;
        var start = document.getElementById('docRewriteStart');
        if (start) {
            start.disabled = !state.file;
            var text = start.querySelector('span');
            if (text) text.textContent = label || '开始文档降重';
        }
    }

    function rememberJob() {
        try {
            if (state.jobId) localStorage.setItem(JOB_STORAGE_KEY, state.jobId);
            else localStorage.removeItem(JOB_STORAGE_KEY);
        } catch (_) { /* storage may be unavailable */ }
    }

    function schedulePoll(delayMs) {
        if (state.pollTimer) clearTimeout(state.pollTimer);
        state.pollTimer = setTimeout(pollJob, Math.max(1000, Number(delayMs) || 3000));
    }

    function readRememberedJob() {
        try { return localStorage.getItem(JOB_STORAGE_KEY) || ''; } catch (_) { return ''; }
    }

    function updateResults(payload) {
        var list = document.getElementById('docRewriteResults');
        var card = document.getElementById('docRewriteResultsCard');
        if (!list || !card) return;
        // The detailed sentence-by-sentence comparison is an internal audit
        // aid. Keep it out of the user-facing document rewrite page; progress
        // and the download action remain visible.
        card.hidden = true;
        list.innerHTML = '';
        return;
        /*
        var results = Array.isArray(payload && payload.results) ? payload.results : [];
        if (!results.length) { card.hidden = true; list.innerHTML = ''; return; }
        card.hidden = false;
        // Avoid rebuilding the whole list on every poll when the server has
        // not changed anything, while still replacing rows as each sentence
        // moves from pending to completed/failed.
        var signature = results.map(function (item) { return [item.status, item.rewritten || ''].join('|'); }).join('¦');
        if (signature === lastRenderedResultsSignature) return;
        lastRenderedResultsSignature = signature;
        list.innerHTML = results.map(function (item, index) {
            var status = item.status === 'completed' ? '已完成' : item.status === 'failed' ? '保留原文' : item.status === 'skipped' ? '标题/短句' : item.status === 'unchanged' ? '原文保留' : item.status === 'pending' ? '处理中' : '等待处理';
            var rewritten = item.rewritten || (item.status === 'pending' ? '等待处理……' : item.original || '');
            return `<div class="doc-rewrite-result-row"><div class="doc-rewrite-result-index">${index + 1}</div><div class="doc-rewrite-result-cell"><span class="doc-rewrite-result-label">降重前</span><div>${escapeHtml(item.original || '')}</div></div><div class="doc-rewrite-result-arrow"><i class="fas fa-arrow-right"></i></div><div class="doc-rewrite-result-cell"><span class="doc-rewrite-result-label">降重后 <em>${status}</em></span><div>${escapeHtml(rewritten)}</div></div></div>`;
        }).join('');
        */
    }

    function updateFullResult(payload) {
        var card = document.getElementById('docRewriteFullResultCard');
        var text = document.getElementById('docRewriteFullResult');
        if (!card || !text) return;
        var value = String(payload && payload.rewrittenText || '').trim();
        card.hidden = !value;
        text.textContent = value;
    }

    function handleUnauthorized() {
        if (state.pollTimer) {
            clearTimeout(state.pollTimer);
            state.pollTimer = null;
        }
        state.jobId = null;
        state.lastStatus = null;
        state.pollDelayMs = 3000;
        state.pollFailures = 0;
        rememberJob();
        resetStartButton('开始文档降重');
        try {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_info');
            localStorage.removeItem('user_credits');
        } catch (_) { /* storage may be unavailable; the server response is still handled */ }
        if (window.auth) {
            window.auth.token = null;
            window.auth.userInfo = null;
            if (typeof window.auth.updateUI === 'function') window.auth.updateUI();
        }
        notify('登录已过期，请重新登录', 'error');
        if (window.router) window.router.navigate('home', true);
        setTimeout(function () { if (window.auth) window.auth.showAuthModal(); }, 0);
    }

    function buildPage() {
        var main = document.getElementById('mainContent');
        if (!main) return;
        lastRenderedResultsSignature = '';
        main.innerHTML = `
<div class="doc-rewrite-page">
  <div class="doc-rewrite-bg" aria-hidden="true"></div>
  <div class="doc-rewrite-wrap">
    <div class="doc-rewrite-header">
      <div>
        <div class="doc-rewrite-eyebrow"><i class="fas fa-file-word"></i> 文档工作台</div>
        <h1>文档降重</h1>
        <p>上传 Word 文档，完成后下载保留原格式的降重结果。</p>
      </div>
      <button type="button" class="btn btn-secondary doc-rewrite-back" id="docRewriteBack"><i class="fas fa-arrow-left"></i> 返回 AI 降重</button>
    </div>

    <section class="doc-rewrite-card doc-rewrite-upload-card" aria-labelledby="docRewriteUploadTitle">
      <div class="doc-rewrite-card-title"><span class="doc-rewrite-step">01</span><div><h2 id="docRewriteUploadTitle">上传 Word 文档</h2><p>支持 .docx，原文档结构和大部分格式会保留。</p></div></div>
      <input type="file" id="docRewriteFile" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
      <label class="doc-rewrite-dropzone" id="docRewriteDropzone" for="docRewriteFile" tabindex="0">
        <span class="doc-rewrite-upload-icon"><i class="fas fa-cloud-arrow-up"></i></span>
        <strong>点击选择，或将 Word 文件拖到这里</strong>
        <small>仅支持 DOCX，单个文件不超过 80 MB</small>
        <div class="doc-rewrite-file-info" id="docRewriteFileInfo" hidden></div>
      </label>
      <input type="file" id="docRewriteReport" accept=".pdf,application/pdf" hidden>
      <label class="doc-rewrite-report-dropzone" id="docRewriteReportDropzone" for="docRewriteReport" title="可选：只改写 AIGC 检测报告中标红的句子" tabindex="0">
        <span class="doc-rewrite-report-icon"><i class="fas fa-file-pdf"></i></span>
        <strong>点击选择，或将 AIGC 检测报告 PDF 拖到这里</strong>
        <small>可选上传；仅支持 PDF，单个文件不超过 80 MB</small>
        <div class="doc-rewrite-file-info" id="docRewriteReportInfo" hidden></div>
      </label>
      <div class="doc-rewrite-upload-actions">
        <button type="button" class="btn btn-primary doc-rewrite-start" id="docRewriteStart" disabled><i class="fas fa-wand-magic-sparkles"></i><span>开始文档降重</span></button>
      </div>
    </section>

    <section class="doc-rewrite-card doc-rewrite-actions-card doc-rewrite-download-card">
      <div class="doc-rewrite-actions-copy"><h2>处理完成后下载</h2><p>下载保留原文档格式的完整降重 Word 文件。</p></div>
      <div class="doc-rewrite-actions"><button type="button" class="btn btn-secondary" id="docRewriteDownload" hidden><i class="fas fa-download"></i> 下载降重结果</button></div>
    </section>

    <section class="doc-rewrite-card doc-rewrite-progress-card" id="docRewriteProgressCard" hidden aria-live="polite">
      <div class="doc-rewrite-card-title"><span class="doc-rewrite-step">02</span><div><h2>处理进度</h2><p class="doc-rewrite-visually-hidden" id="docRewriteStatusText">正在准备文档……</p></div><strong class="doc-rewrite-percent" id="docRewritePercent">0%</strong></div>
      <div class="doc-rewrite-progress-track"><div class="doc-rewrite-progress-bar" id="docRewriteProgressBar"></div></div>
    </section>

    <section class="doc-rewrite-card doc-rewrite-results-card" id="docRewriteResultsCard" hidden aria-labelledby="docRewriteResultsTitle">
       <div class="doc-rewrite-card-title"><span class="doc-rewrite-step">03</span><div><h2 id="docRewriteResultsTitle">降重结果列表</h2><p>查看文档处理结果。</p></div></div>
      <div class="doc-rewrite-results-list" id="docRewriteResults"></div>
    </section>

    <section class="doc-rewrite-card doc-rewrite-full-result-card" id="docRewriteFullResultCard" hidden aria-labelledby="docRewriteFullResultTitle">
       <div class="doc-rewrite-card-title"><span class="doc-rewrite-step">04</span><div><h2 id="docRewriteFullResultTitle">完整降重结果</h2><p>查看最终降重文本。</p></div></div>
      <div class="doc-rewrite-full-result" id="docRewriteFullResult"></div>
    </section>

  </div>
</div>`;
        bindPage();
    }

    function setFile(file) {
        if (!file) return;
        if (state.processing) {
            notify('文档正在处理，暂不能更换文件', 'warning');
            return;
        }
        var name = String(file.name || '').toLowerCase();
        if (!name.endsWith('.docx')) {
            notify('当前仅支持 .docx Word 文档', 'error');
            var invalidDocInput = document.getElementById('docRewriteFile');
            if (invalidDocInput) invalidDocInput.value = '';
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            notify('文件不能超过 80 MB', 'error');
            var oversizedDocInput = document.getElementById('docRewriteFile');
            if (oversizedDocInput) oversizedDocInput.value = '';
            return;
        }
        var replacingDocument = !!state.file && state.file !== file;
        state.file = file;
        // A PDF can be selected before the DOCX. Keep that valid selection so
        // upload order does not make the optional report disappear. When the
        // source document is replaced, clear the report to avoid matching it
        // against a different document by accident.
        if (replacingDocument) clearReportFile();
        state.jobId = null;
        state.lastStatus = null;
        state.pollDelayMs = 3000;
        state.pollFailures = 0;
        rememberJob();
        updateResults({ results: [] });
        updateFullResult({ rewrittenText: '' });
        var dropzone = document.getElementById('docRewriteDropzone');
        var info = document.getElementById('docRewriteFileInfo');
        if (dropzone) dropzone.classList.add('is-selected');
        if (info) {
            info.hidden = false;
            info.innerHTML = `<span class="doc-rewrite-file-icon"><i class="fas fa-file-word"></i></span><span class="doc-rewrite-file-name">${escapeHtml(file.name)}</span><span class="doc-rewrite-file-size">${formatBytes(file.size)}</span><button type="button" class="doc-rewrite-file-remove" id="docRewriteRemove" aria-label="移除文件"><i class="fas fa-times"></i></button>`;
            var remove = document.getElementById('docRewriteRemove');
            if (remove) remove.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); clearFile(); });
        }
        var start = document.getElementById('docRewriteStart');
        if (start) start.disabled = !state.file;
        var download = document.getElementById('docRewriteDownload');
        if (download) download.hidden = true;
        var progressCard = document.getElementById('docRewriteProgressCard');
        if (progressCard) progressCard.hidden = true;
    }

    function setReportFile(file) {
        if (!file || state.processing) return;
        if (!String(file.name || '').toLowerCase().endsWith('.pdf')) {
            notify('请选择 PDF 格式的 AIGC 检测报告', 'error');
            var invalidInput = document.getElementById('docRewriteReport');
            if (invalidInput) invalidInput.value = '';
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            notify('检测报告不能超过 80 MB', 'error');
            var oversizedInput = document.getElementById('docRewriteReport');
            if (oversizedInput) oversizedInput.value = '';
            return;
        }
        state.reportFile = file;
        var reportDropzone = document.getElementById('docRewriteReportDropzone');
        var info = document.getElementById('docRewriteReportInfo');
        if (reportDropzone) reportDropzone.classList.add('is-selected');
        if (info) {
            info.hidden = false;
            info.innerHTML = `<span class="doc-rewrite-file-icon"><i class="fas fa-file-pdf"></i></span><span class="doc-rewrite-file-name">${escapeHtml(file.name)}</span><span class="doc-rewrite-file-size">${formatBytes(file.size)}</span><button type="button" class="doc-rewrite-file-remove" id="docRewriteReportRemove" aria-label="移除检测报告"><i class="fas fa-times"></i></button>`;
            var remove = document.getElementById('docRewriteReportRemove');
            if (remove) remove.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); clearReportFile(); });
        }
        var start = document.getElementById('docRewriteStart');
        if (start) start.disabled = !state.file;
    }

    function clearReportFile() {
        if (state.processing) {
            notify('文档正在处理，暂不能移除检测报告', 'warning');
            return;
        }
        state.reportFile = null;
        var input = document.getElementById('docRewriteReport');
        var info = document.getElementById('docRewriteReportInfo');
        if (input) input.value = '';
        if (info) { info.hidden = true; info.innerHTML = ''; }
        var reportDropzone = document.getElementById('docRewriteReportDropzone');
        if (reportDropzone) reportDropzone.classList.remove('is-selected');
    }

    function clearFile() {
        if (state.processing) {
            notify('文档正在处理，暂不能移除文件', 'warning');
            return;
        }
        state.file = null;
        state.reportFile = null;
        state.jobId = null;
        state.lastStatus = null;
        rememberJob();
        updateResults({ results: [] });
        updateFullResult({ rewrittenText: '' });
        var input = document.getElementById('docRewriteFile');
        var reportInput = document.getElementById('docRewriteReport');
        var info = document.getElementById('docRewriteFileInfo');
        var start = document.getElementById('docRewriteStart');
        if (input) input.value = '';
        if (reportInput) reportInput.value = '';
        if (info) { info.hidden = true; info.innerHTML = ''; }
        var reportInfo = document.getElementById('docRewriteReportInfo');
        if (reportInfo) { reportInfo.hidden = true; reportInfo.innerHTML = ''; }
        var dropzone = document.getElementById('docRewriteDropzone');
        var reportDropzone = document.getElementById('docRewriteReportDropzone');
        if (dropzone) dropzone.classList.remove('is-selected');
        if (reportDropzone) reportDropzone.classList.remove('is-selected');
        if (start) start.disabled = true;
        var download = document.getElementById('docRewriteDownload');
        if (download) download.hidden = true;
        var progressCard = document.getElementById('docRewriteProgressCard');
        if (progressCard) progressCard.hidden = true;
    }

    function updateProgress(payload) {
        payload = payload || {};
        var progress = payload.progress || payload.data && payload.data.progress || {};
        var value = Number(payload.percent != null ? payload.percent : progress.percent);
        if (!Number.isFinite(value)) {
            var completed = Number(progress.completed != null ? progress.completed : payload.completed);
            var total = Number(progress.total != null ? progress.total : payload.total);
            value = total > 0 ? completed / total * 100 : (payload.status === 'completed' ? 100 : 0);
        }
        value = Math.max(0, Math.min(100, value));
        var bar = document.getElementById('docRewriteProgressBar');
        var pct = document.getElementById('docRewritePercent');
        var status = document.getElementById('docRewriteStatusText');
        if (bar) bar.style.width = value.toFixed(1) + '%';
        if (pct) pct.textContent = Math.round(value) + '%';
        if (status) status.textContent = payload.message || progress.message || (payload.reportMatch && payload.reportMatch.fallback ? '检测报告未识别，正在进行全文降重……' : (payload.status === 'completed' ? '文档降重已完成' : '正在处理文档……'));
        updateResults(payload);
        updateFullResult(payload);
    }

    async function startJob() {
        if (!state.file || state.processing) return;
        state.processing = true;
        state.pollDelayMs = 3000;
        state.pollFailures = 0;
        var start = document.getElementById('docRewriteStart');
        var download = document.getElementById('docRewriteDownload');
        var progressCard = document.getElementById('docRewriteProgressCard');
        if (start) { start.disabled = true; start.querySelector('span').textContent = '正在提交……'; }
        if (download) download.hidden = true;
        if (progressCard) progressCard.hidden = false;
        updateProgress({ percent: 1, message: '正在上传文档……', stage: 'upload' });

        try {
            var form = new FormData();
            form.append('file', state.file, state.file.name);
            if (state.reportFile) form.append('report', state.reportFile, state.reportFile.name);
            // Resolve through the same helper used by downloads so a configured
            // API base with/without a trailing slash behaves identically.
            var response = await fetch(resolveApiUrl('/document-rewrite-jobs'), { method: 'POST', headers: authHeaders(), body: form, cache: 'no-store' });
            var payload = await response.json().catch(function () { return {}; });
            if (response.status === 401) {
                handleUnauthorized();
                return;
            }
            if (!response.ok) throw new Error(payload.error || payload.message || '文档任务提交失败');
            var data = payload.data || payload;
            state.jobId = data.jobId || data.id || data.taskId;
            if (!state.jobId) throw new Error('服务端未返回任务编号');
            rememberJob();
            // Render the server's initial pending rows immediately. Subsequent
            // polling updates the same list as each sentence completes.
            updateProgress({ ...data, percent: data.percent || 2, message: '文档已上传，正在处理……', stage: 'process' });
            pollJob();
        } catch (error) {
            if (state.pollTimer) clearTimeout(state.pollTimer);
            state.pollTimer = null;
            state.jobId = null;
            resetStartButton('开始文档降重');
            notify(error.message || '文档任务提交失败', 'error');
        }
    }

    async function pollJob() {
        if (!state.jobId) return;
        if (window.router && typeof window.router.getCurrentPage === 'function' && window.router.getCurrentPage() !== 'document-rewrite') {
            if (state.pollTimer) clearTimeout(state.pollTimer);
            state.pollTimer = null;
            return;
        }
        if (state.pollTimer) clearTimeout(state.pollTimer);
        try {
            var response = await fetch(resolveApiUrl('/document-rewrite-jobs/' + encodeURIComponent(state.jobId)), { headers: authHeaders(), cache: 'no-store' });
            var payload = await response.json().catch(function () { return {}; });
            if (response.status === 401) {
                handleUnauthorized();
                return;
            }
            if (response.status === 429) {
                // The background job is still running. Back off the status
                // read using the server hint instead of marking the rewrite
                // failed or immediately hammering the endpoint again.
                var retryAfter = Number(response.headers.get('Retry-After') || 0);
                var retryDelay = retryAfter > 0 ? retryAfter * 1000 : state.pollDelayMs;
                state.pollDelayMs = Math.min(15 * 60 * 1000, Math.max(5000, state.pollDelayMs * 2));
                var rateLimitStatus = document.getElementById('docRewriteStatusText');
                if (rateLimitStatus) rateLimitStatus.textContent = '进度查询暂时受限，任务仍在后台处理';
                schedulePoll(Math.max(retryDelay, state.pollDelayMs / 2));
                return;
            }
            if (!response.ok) {
                var queryError = new Error(payload.error || payload.message || '查询文档任务失败');
                queryError.status = response.status;
                throw queryError;
            }
            var data = payload.data || payload;
            state.pollDelayMs = 3000;
            state.pollFailures = 0;
            state.lastStatus = data;
            updateProgress(data);
            var status = String(data.status || '').toLowerCase();
            if (status === 'review_required') {
                resetStartButton('重新开始');
                var reviewStart = document.getElementById('docRewriteStart');
                var reviewDownload = document.getElementById('docRewriteDownload');
                var reviewReason = data.reportMatch && data.reportMatch.reason || data.message || 'PDF 标红正文无法可靠定位，未启动降重';
                var reviewStatus = document.getElementById('docRewriteStatusText');
                if (reviewStart) reviewStart.disabled = false;
                if (reviewDownload) reviewDownload.hidden = true;
                if (reviewStatus) reviewStatus.textContent = reviewReason;
                notify(reviewReason, 'warning');
                return;
            }
            if (['completed', 'success', 'done'].includes(status)) {
                resetStartButton('再次处理文档');
                var start = document.getElementById('docRewriteStart');
                var download = document.getElementById('docRewriteDownload');
                if (start) start.disabled = false;
                if (download) download.hidden = !(data.downloadReady === true || data.downloadUrl);
                notify('文档降重已完成，可下载结果', 'success');
                return;
            }
            if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
                resetStartButton('重新开始');
                var retry = document.getElementById('docRewriteStart');
                if (retry) retry.disabled = false;
                notify(data.error || data.message || '文档降重失败', 'error');
                return;
            }
            schedulePoll(3000);
        } catch (error) {
            if (error && error.status === 401) {
                handleUnauthorized();
                return;
            }
            if (error && error.status === 404) {
                state.jobId = null;
                rememberJob();
                resetStartButton('开始文档降重');
                var missingStatus = document.getElementById('docRewriteStatusText');
                if (missingStatus) missingStatus.textContent = '任务不存在或已过期，请重新上传文档。';
                notify('文档任务不存在或已过期', 'error');
                return;
            }
            state.pollFailures = Math.min(state.pollFailures + 1, 5);
            state.pollDelayMs = Math.min(60000, 3000 * Math.pow(2, state.pollFailures - 1));
            schedulePoll(state.pollDelayMs);
            var statusText = document.getElementById('docRewriteStatusText');
            if (statusText) statusText.textContent = error.message || '正在重试查询任务……';
        }
    }

    async function downloadResult() {
        if (!state.jobId) return;
        try {
            var data = state.lastStatus || {};
            var endpoint = data.downloadUrl || ('/document-rewrite-jobs/' + encodeURIComponent(state.jobId) + '/download');
            var response = await fetch(resolveApiUrl(endpoint), {
                headers: { ...authHeaders(), 'Accept': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
                cache: 'no-store'
            });
            if (response.status === 401) {
                handleUnauthorized();
                return;
            }
            if (!response.ok) {
                var errorPayload = await response.json().catch(function () { return {}; });
                throw new Error(errorPayload.error || '下载失败');
            }
            var blob = await assertDocxBlob(await response.blob());
            var url = URL.createObjectURL(blob);
            var anchor = document.createElement('a');
            anchor.href = url;
            var serverFileName = String(data.fileName || '').trim();
            anchor.download = serverFileName || (((state.file && state.file.name) || 'document').replace(/\.docx$/i, '') + '_降重.docx');
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (error) {
            notify(error.message || '下载失败', 'error');
        }
    }

    function bindPage() {
        var input = document.getElementById('docRewriteFile');
        var drop = document.getElementById('docRewriteDropzone');
        if (input) input.addEventListener('change', function (event) { setFile(event.target.files && event.target.files[0]); });
        var reportInput = document.getElementById('docRewriteReport');
        var reportDrop = document.getElementById('docRewriteReportDropzone');
        if (reportInput) reportInput.addEventListener('change', function (event) { setReportFile(event.target.files && event.target.files[0]); });
        if (reportDrop) {
            ['dragenter', 'dragover'].forEach(function (eventName) { reportDrop.addEventListener(eventName, function (event) { event.preventDefault(); event.stopPropagation(); reportDrop.classList.add('is-dragover'); }); });
            ['dragleave', 'drop'].forEach(function (eventName) { reportDrop.addEventListener(eventName, function (event) { event.preventDefault(); event.stopPropagation(); reportDrop.classList.remove('is-dragover'); }); });
            reportDrop.addEventListener('drop', function (event) { setReportFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]); });
            reportDrop.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); reportInput && reportInput.click(); } });
        }
        if (drop) {
            ['dragenter', 'dragover'].forEach(function (eventName) { drop.addEventListener(eventName, function (event) { event.preventDefault(); drop.classList.add('is-dragover'); }); });
            ['dragleave', 'drop'].forEach(function (eventName) { drop.addEventListener(eventName, function (event) { event.preventDefault(); drop.classList.remove('is-dragover'); }); });
            drop.addEventListener('drop', function (event) { setFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]); });
            drop.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input && input.click(); } });
        }
        var start = document.getElementById('docRewriteStart');
        if (start) start.addEventListener('click', startJob);
        var download = document.getElementById('docRewriteDownload');
        if (download) download.addEventListener('click', downloadResult);
        var back = document.getElementById('docRewriteBack');
        if (back) back.addEventListener('click', function () {
            if (state.pollTimer) clearTimeout(state.pollTimer);
            state.pollTimer = null;
            router.navigate('rewrite');
        });
    }

    router.register('document-rewrite', function () {
        if (!auth.isLoggedIn()) {
            notify('请先登录后再使用文档降重', 'warning');
            router.navigate('home', true);
            setTimeout(function () { if (window.auth) auth.showAuthModal(); }, 0);
            return;
        }
        if (state.pollTimer) clearTimeout(state.pollTimer);
        state.processing = false;
        state.jobId = readRememberedJob();
        state.lastStatus = null;
        buildPage();
        if (state.jobId) {
            state.processing = true;
            var start = document.getElementById('docRewriteStart');
            if (start) { start.disabled = true; start.querySelector('span').textContent = '恢复任务中……'; }
            var progressCard = document.getElementById('docRewriteProgressCard');
            if (progressCard) progressCard.hidden = false;
            pollJob();
        }
    });
})();
