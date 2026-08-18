import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  addEdge,
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowDown, ArrowLeft, ArrowUp, Bot, Boxes, Braces, CheckCircle2, ChevronDown, ChevronRight, CircleStop,
  Archive, Copy, FolderOpen, GitBranch, GripVertical, Layers3, Link2, MoreHorizontal, Play, Plus,
  RefreshCw, RotateCcw, Save, Search, Send, Sparkles, Trash2, Workflow, X, Zap
} from 'lucide-react';
import './studio.css';

const API_BASE = '/api/admin/workflows';
const ARCHIVED_WORKFLOW_IDS = new Set(['academic-section-pipeline', 'academic-section-writer']);
const NODE_META = {
  start: { label: '开始', icon: Play, tone: 'emerald' },
  prompt: { label: '提示词', icon: Braces, tone: 'amber' },
  llm: { label: 'DeepSeek', icon: Bot, tone: 'violet' },
  plugin: { label: '学术检索', icon: Search, tone: 'teal' },
  transform: { label: '数据处理', icon: Zap, tone: 'cyan' },
  loop: { label: '循环子流程', icon: RotateCcw, tone: 'blue' },
  condition: { label: '条件分支', icon: GitBranch, tone: 'orange' },
  subworkflow: { label: '子工作流', icon: Layers3, tone: 'indigo' },
  output: { label: '输出结果', icon: CircleStop, tone: 'rose' }
};

const TRANSFORM_OPERATION_HELP = {
  passthrough: '原样返回本节点解析后的输入。',
  pick: '从指定路径读取一个值；路径不存在时返回空值。',
  set: '复制当前输入对象，再写入一个目标字段。',
  merge: '按顺序合并多个对象，后面的同名字段覆盖前面的字段。',
  template: '替换模板中的 {{路径}}，输出拼接后的文本。',
  jsonParse: '把字符串解析为 JSON；格式无效时节点失败并停止工作流。',
  toArray: '数组保持不变，单个值包装成数组，空值变为空数组。',
  prepareWritingInput: '根据开始输入整理写作参数，并计算目标字数。',
  assembleDocument: '将论文规划和循环生成的章节汇总为完整文档。',
  composeText: '按设定顺序拼接多个映射输入和固定文本，可校验必填项并输出为指定字段。'
};

function workflowName(workflow) {
  return workflow?.name || '';
}

function workflowDescription(workflow) {
  return workflow?.description || '';
}

function builtInPromptDefaults(action) {
  if (action === 'planDocument') {
    return {
      systemPrompt: '你是学术论文结构规划助手。请输出清晰、可执行的论文结构。',
      userPrompt: '请根据以下工作流输入规划论文结构：\n{{input}}'
    };
  }
  if (action === 'draftSection') {
    return {
      systemPrompt: '你是学术论文写作助手。请围绕当前章节和已有上下文撰写严谨正文。',
      userPrompt: '请根据当前节点输入撰写正文：\n{{input}}'
    };
  }
  return { systemPrompt: '你是一名严谨的学术写作助手。', userPrompt: '{{output}}' };
}

function childWorkflows(workflow, workflows) {
  const ids = [...new Set((workflow?.nodes || []).map((node) => node.data?.workflowId).filter(Boolean))];
  return ids.map((id) => workflows.find((item) => item.id === id)).filter(Boolean);
}

function rootWorkflows(workflows) {
  const children = new Set(workflows.flatMap((workflow) => childWorkflows(workflow, workflows).map((item) => item.id)));
  return workflows.filter((workflow) => !children.has(workflow.id));
}

function workflowLineage(targetId, workflows) {
  const visit = (workflow, path, seen) => {
    if (!workflow || seen.has(workflow.id)) return null;
    if (workflow.id === targetId) return path.concat(workflow);
    const nextSeen = new Set(seen).add(workflow.id);
    for (const child of childWorkflows(workflow, workflows)) {
      const result = visit(child, path.concat(workflow), nextSeen);
      if (result) return result;
    }
    return null;
  };
  for (const root of rootWorkflows(workflows)) {
    const result = visit(root, [], new Set());
    if (result) return result;
  }
  return workflows.find((workflow) => workflow.id === targetId) ? [workflows.find((workflow) => workflow.id === targetId)] : [];
}

function workflowFamily(root, workflows) {
  const result = [];
  const visit = (workflow, seen = new Set()) => {
    if (!workflow || seen.has(workflow.id)) return;
    seen.add(workflow.id);
    result.push(workflow);
    childWorkflows(workflow, workflows).forEach((child) => visit(child, seen));
  };
  visit(root);
  return result;
}

function formatUpdatedAt(value) {
  if (!value) return '尚未保存';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function runtimeValueText(value) {
  if (value === undefined) return '';
  if (value === null) return 'null';
  let text;
  try { text = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
  catch { text = String(value); }
  return text || '';
}

function formatRuntimeValue(value, maxLength = 260) {
  const text = runtimeValueText(value);
  if (!text) return '—';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

async function copyText(text) {
  const value = String(text || '');
  if (!value) throw new Error('没有可复制的内容');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (_) { /* use the compatibility fallback below */ }
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('浏览器未允许复制，请手动选择文本');
}

function runStatusLabel(status) {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '运行中';
  if (status === 'failed') return '失败';
  if (status === 'cancelled') return '已停止';
  return '已完成';
}

function traceOutputValues(trace = []) {
  return trace.reduce((values, step) => {
    if (step && step.nodeId && step.output !== undefined) values[step.nodeId] = step.output;
    return values;
  }, {});
}

function lastTraceOutput(trace = [], workflowId = '') {
  const completed = [...trace].reverse().find((step) => step && step.status === 'completed' && step.output !== undefined && (!workflowId || step.workflowId === workflowId));
  if (completed) return completed.output;
  const fallback = [...trace].reverse().find((step) => step && step.status === 'completed' && step.output !== undefined);
  return fallback ? fallback.output : undefined;
}

function applyRuntimeSnapshot(flowNodes, trace = [], values = {}, workflowId = '') {
  const currentTrace = trace.filter((step) => step && (!step.workflowId || step.workflowId === workflowId));
  return flowNodes.map((node) => {
    const step = [...currentTrace].reverse().find((item) => item.nodeId === node.id);
    const value = Object.prototype.hasOwnProperty.call(values || {}, node.id) ? values[node.id] : step?.output;
    if (!step && value === undefined) return node;
    return {
      ...node,
      data: {
        ...node.data,
        runtimeStatus: step?.status || 'completed',
        runtimeOutput: value,
        runtimeError: step?.error,
        runtimeDurationMs: step?.durationMs
      }
    };
  });
}

function token() { return sessionStorage.getItem('admin_token') || localStorage.getItem('admin_token') || ''; }
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || '请求失败');
    error.status = response.status;
    error.code = payload.code;
    error.details = payload.details;
    throw error;
  }
  return payload.data;
}

function waitForPoll(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Run cancelled');
      error.name = 'AbortError';
      reject(error);
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      const error = new Error('Run cancelled');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
}

async function loginAdmin(username, password) {
  const response = await fetch('/api/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '登录失败');
  localStorage.setItem('admin_token', payload.data.token);
  localStorage.setItem('admin_profile', JSON.stringify(payload.data.admin));
  return payload.data.admin;
}

function clearAdminSession() {
  sessionStorage.removeItem('admin_token');
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_profile');
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setError('');
    try { const admin = await loginAdmin(username, password); onLogin(admin); }
    catch (reason) { setError(reason.message); }
    finally { setLoading(false); }
  };
  return <div className="studio-login"><form onSubmit={submit}><span className="brand-mark"><Workflow size={20}/></span><div><h1>工作流画板</h1><p>使用管理员账号进入 DeepSeek 编排空间</p></div><label>管理员账号<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus/></label><label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)}/></label>{error && <div className="login-error">{error}</div>}<button disabled={loading}>{loading ? '正在验证…' : '登录画板'}</button><a href="/admin/">返回管理后台</a></form></div>;
}

function FlowNode({ id, type, data, selected }) {
  const meta = NODE_META[type] || NODE_META.transform;
  const Icon = meta.icon;
  const hasRuntimeResult = data.runtimeOutput !== undefined || Boolean(data.runtimeError);
  const [resultExpanded, setResultExpanded] = useState(Boolean(data.runtimeError));
  useEffect(() => {
    if (data.runtimeStatus === 'failed' || data.runtimeError) setResultExpanded(true);
    else if (!hasRuntimeResult) setResultExpanded(false);
  }, [data.runtimeError, data.runtimeStatus, hasRuntimeResult]);
  return <div className={`flow-node tone-${meta.tone} ${data.runtimeStatus ? `runtime-${data.runtimeStatus}` : ''} ${selected ? 'selected' : ''}`} data-testid={`node-${id}`}>
    {type !== 'start' && <Handle type="target" position={Position.Left} />}
    <div className="node-head"><span className="node-icon"><Icon size={16}/></span><strong>{data.displayLabel || data.label || meta.label}</strong><span className="node-type">{meta.label}</span></div>
    <div className="node-body">{data.description || '点击节点配置参数'}</div>
    {hasRuntimeResult && <section className={`node-runtime-result ${data.runtimeError ? 'failed' : ''}`}>
      <button
        type="button"
        className="node-runtime-toggle nodrag nopan"
        aria-expanded={resultExpanded}
        onClick={(event) => { event.stopPropagation(); setResultExpanded((expanded) => !expanded); }}
      >
        <span>{data.runtimeError ? '运行失败' : '运行结果'}</span>
        <code>{formatRuntimeValue(data.runtimeError || data.runtimeOutput, 72)}</code>
        {data.runtimeDurationMs != null && <small>{data.runtimeDurationMs} ms</small>}
        <ChevronDown size={13}/>
      </button>
      {resultExpanded && <div className="node-runtime-detail nodrag nopan" onClick={(event) => event.stopPropagation()}>
        {data.runtimeError && <div className="node-runtime-error"><span>错误</span><pre>{formatRuntimeValue(data.runtimeError, 3000)}</pre></div>}
        {data.runtimeOutput !== undefined && <div className="node-runtime-output"><span>输出</span><pre>{type === 'output' || data.fullOutput ? runtimeValueText(data.runtimeOutput) : formatRuntimeValue(data.runtimeOutput, 5000)}</pre></div>}
      </div>}
    </section>}
    {(type === 'subworkflow' || type === 'loop') && <div className="node-sub"><Boxes size={13}/>{data.workflowName || data.workflowId || '未选择子流程'}<ChevronRight size={13}/></div>}
    {type === 'plugin' && <div className="node-sub"><Search size={13}/>{data.provider === 'arxiv' ? 'arXiv' : data.provider === 'crossref' ? 'Crossref' : data.provider === 'openalex' ? 'OpenAlex' : 'Semantic Scholar'}</div>}
    {type === 'condition' ? <div className="route-handles">{(data.routes?.length ? data.routes : [{ key: 'true', label: '满足' }, { key: 'false', label: '不满足' }]).map((route, index, routes) => <React.Fragment key={route.key}>
      <span className="route-label" style={{ top: `${((index + 1) * 100) / (routes.length + 1)}%` }}>{route.label || route.key}</span>
      <Handle id={route.key} type="source" position={Position.Right} style={{ top: `${((index + 1) * 100) / (routes.length + 1)}%` }}/>
    </React.Fragment>)}</div> : type !== 'output' && <Handle type="source" position={Position.Right} />}
  </div>;
}

function InlineNotice({ message, onClose }) {
  if (!message?.text) return null;
  return <div className={`inline-notice ${message.type}`} role="status">
    <span>{message.type === 'success' && <CheckCircle2 size={15}/>}</span>
    <p>{message.text}</p>
    <button aria-label="关闭提示" onClick={onClose}><X size={14}/></button>
  </div>;
}

const nodeTypes = Object.fromEntries(Object.keys(NODE_META).map((type) => [type, FlowNode]));

function splitSource(source, options) {
  const normalized = String(source || '').trim();
  const match = [...options].sort((left, right) => right.value.length - left.value.length)
    .find((option) => normalized === option.value || normalized.startsWith(`${option.value}.`));
  if (!match) return { base: '__custom__', field: normalized };
  return { base: match.value, field: normalized === match.value ? '' : normalized.slice(match.value.length + 1) };
}

function joinSource(base, field) {
  if (base === '__custom__') return String(field || '').trim();
  return String(field || '').trim() ? `${base}.${String(field).trim()}` : base;
}

function MappingEditor({ mappings = [], onChange, sourceOptions = [] }) {
  const update = (index, patch) => onChange(mappings.map((mapping, itemIndex) => itemIndex === index ? { ...mapping, ...patch } : mapping));
  const addMapping = () => onChange(mappings.concat({
    target: `input${mappings.length + 1}`,
    source: sourceOptions.find((option) => option.kind === 'node')?.value || 'output'
  }));
  return <section className="config-section mapping-editor">
    <div className="section-title"><div><strong>节点输入</strong><small>从所有已连接的上游节点选取数据</small></div><button type="button" onClick={addMapping}><Plus size={14}/>添加变量</button></div>
    {!mappings.length && <p className="config-hint">不添加变量时，节点仍可使用直接前序输出。添加后，可同时读取任意上游节点的完整输出或其中字段。</p>}
    {mappings.map((mapping, index) => {
      const parsed = splitSource(mapping.source, sourceOptions);
      return <div className="mapping-card" key={index}>
        <div className="mapping-card-head"><GripVertical size={14}/><strong>输入变量 {index + 1}</strong><button type="button" aria-label="删除映射" onClick={() => onChange(mappings.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13}/></button></div>
        <label>变量名<input aria-label={`变量名 ${index + 1}`} value={mapping.target || ''} onChange={(event) => update(index, { target: event.target.value })} placeholder="例如 topic"/></label>
        <label>选择来源<select aria-label={`来源节点 ${index + 1}`} value={parsed.base} onChange={(event) => update(index, { source: joinSource(event.target.value, parsed.field) })}>
          {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          <option value="__custom__">高级：自定义路径</option>
        </select></label>
        <label>{parsed.base === '__custom__' ? '完整路径' : '字段路径（可选）'}<input aria-label={`字段路径 ${index + 1}`} value={parsed.field} onChange={(event) => update(index, { source: joinSource(parsed.base, event.target.value) })} placeholder={parsed.base === '__custom__' ? '例如 values.plan.title' : '留空表示整个节点输出；例如 title'}/></label>
        <div className="mapping-preview"><span>提示词变量</span><code>{`{{inputs.${mapping.target || `变量${index + 1}`}}}`}</code></div>
      </div>;
    })}
    <div className="path-help">这里只展示按连线确定、一定先于当前节点执行的节点。条件分支中未被执行的节点，其值可能为空。</div>
  </section>;
}

function PromptField({ label, value, onChange, placeholder, rows = 5, variables = [] }) {
  const insert = (variable) => onChange(`${value || ''}${value ? '\n' : ''}${variable}`);
  return <label className="prompt-field">{label}<textarea rows={rows} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} spellCheck="false"/>
    <span className="variable-caption">插入变量 · 运行时自动替换 {'{{路径}}'}</span>
    <span className="variable-chips">
      {variables.map((variable) => <button type="button" key={variable.value} onClick={() => insert(variable.value)}>{variable.label}</button>)}
    </span>
  </label>;
}

function StartVariablesEditor({ variables = [], onChange }) {
  const update = (index, patch) => onChange(variables.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const add = () => onChange(variables.concat({ name: `input${variables.length + 1}`, type: 'string', required: false, defaultValue: '', description: '' }));
  return <section className="config-section start-variables-editor">
    <div className="section-title"><div><strong>开始变量</strong><small>工作流启动时可填写，后续节点可映射引用</small></div><button type="button" onClick={add}><Plus size={14}/>添加变量</button></div>
    {!variables.length && <p className="config-hint">暂未声明开始变量。添加后，运行面板会生成对应输入项，也可以在提示词中引用工作流输入。</p>}
    {variables.map((variable, index) => <div className="start-variable-card" key={index}>
      <div className="mapping-card-head"><GripVertical size={14}/><strong>变量 {index + 1}</strong><button type="button" aria-label="删除开始变量" onClick={() => onChange(variables.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13}/></button></div>
      <label>变量名<input value={variable.name || ''} onChange={(event) => update(index, { name: event.target.value })} placeholder="例如 topic"/></label>
      <div className="field-grid"><label>类型<select value={variable.type || 'string'} onChange={(event) => update(index, { type: event.target.value })}><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔值</option></select></label><label className="check-label">必填<input type="checkbox" checked={Boolean(variable.required)} onChange={(event) => update(index, { required: event.target.checked })}/></label></div>
      <label>默认值<input value={variable.defaultValue ?? ''} onChange={(event) => update(index, { defaultValue: event.target.value })} placeholder="运行时不填写时使用"/></label>
      <label>说明<input value={variable.description || ''} onChange={(event) => update(index, { description: event.target.value })} placeholder="给运行者看的提示"/></label>
    </div>)}
    {variables.length > 0 && <p className="config-hint">运行输入优先于默认值；默认值和运行输入同时存在时，使用本次运行输入。</p>}
  </section>;
}

function compositionKeys(data) {
  const mappedKeys = (Array.isArray(data.inputMappings) ? data.inputMappings : [])
    .map((mapping) => String(mapping?.target || '').trim())
    .filter(Boolean);
  const fixedKeys = data.fixedInputs && typeof data.fixedInputs === 'object' && !Array.isArray(data.fixedInputs)
    ? Object.keys(data.fixedInputs).filter(Boolean)
    : [];
  const available = Array.from(new Set(mappedKeys.concat(fixedKeys)));
  const configuredOrder = Array.isArray(data.sectionOrder) ? data.sectionOrder : [];
  return Array.from(new Set(configuredOrder.filter((key) => available.includes(key)).concat(available)));
}

function reconcileCompositionMappings(data, inputMappings) {
  const previousMappings = Array.isArray(data.inputMappings) ? data.inputMappings : [];
  const fixedKeys = Object.keys(data.fixedInputs || {});
  const renamed = new Map(previousMappings.map((mapping, index) => [
    String(mapping?.target || '').trim(),
    String(inputMappings[index]?.target || '').trim()
  ]));
  const mappedKeys = inputMappings.map((mapping) => String(mapping?.target || '').trim()).filter(Boolean);
  const available = new Set(mappedKeys.concat(fixedKeys));
  const migrateList = (values = []) => Array.from(new Set(values
    .map((key) => renamed.has(key) ? renamed.get(key) : key)
    .filter((key) => key && available.has(key))));
  const sectionOrder = migrateList(Array.isArray(data.sectionOrder) ? data.sectionOrder : []);
  for (const key of mappedKeys.concat(fixedKeys)) if (!sectionOrder.includes(key)) sectionOrder.push(key);
  const sectionLabels = Object.fromEntries(Object.entries(data.sectionLabels || {})
    .map(([key, value]) => [renamed.has(key) ? renamed.get(key) : key, value])
    .filter(([key]) => key && available.has(key)));
  return {
    inputMappings,
    sectionOrder,
    requiredInputs: migrateList(Array.isArray(data.requiredInputs) ? data.requiredInputs : []),
    sectionLabels
  };
}

function ComposeTextEditor({ data, onChange }) {
  const fixedEntries = Object.entries(data.fixedInputs || {});
  const orderedKeys = compositionKeys(data);
  const mappedKeys = new Set((data.inputMappings || []).map((mapping) => String(mapping.target || '').trim()).filter(Boolean));
  const requiredKeys = new Set(Array.isArray(data.requiredInputs) ? data.requiredInputs : []);
  const updateOrder = (nextOrder) => onChange({ sectionOrder: nextOrder });
  const moveKey = (index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= orderedKeys.length) return;
    const next = orderedKeys.slice();
    [next[index], next[target]] = [next[target], next[index]];
    updateOrder(next);
  };
  const toggleRequired = (key, checked) => onChange({
    requiredInputs: checked
      ? Array.from(new Set([...(data.requiredInputs || []), key]))
      : (data.requiredInputs || []).filter((item) => item !== key)
  });
  const addFixed = () => {
    let index = fixedEntries.length + 1;
    while (Object.prototype.hasOwnProperty.call(data.fixedInputs || {}, `fixedText${index}`)) index += 1;
    const key = `fixedText${index}`;
    onChange({
      fixedInputs: { ...(data.fixedInputs || {}), [key]: '' },
      sectionOrder: orderedKeys.concat(key)
    });
  };
  const updateFixedKey = (entryIndex, nextKey) => {
    const previousKey = fixedEntries[entryIndex][0];
    const fixedInputs = Object.fromEntries(fixedEntries.map(([key, value], index) => [index === entryIndex ? nextKey : key, value]));
    const replaceKey = (key) => key === previousKey ? nextKey : key;
    const sectionLabels = Object.fromEntries(Object.entries(data.sectionLabels || {}).map(([key, value]) => [replaceKey(key), value]));
    onChange({
      fixedInputs,
      sectionOrder: orderedKeys.map(replaceKey),
      requiredInputs: (data.requiredInputs || []).map(replaceKey),
      sectionLabels
    });
  };
  const updateFixedValue = (entryIndex, value) => onChange({
    fixedInputs: Object.fromEntries(fixedEntries.map(([key, current], index) => [key, index === entryIndex ? value : current]))
  });
  const removeFixed = (entryIndex) => {
    const removedKey = fixedEntries[entryIndex][0];
    onChange({
      fixedInputs: Object.fromEntries(fixedEntries.filter((_, index) => index !== entryIndex)),
      sectionOrder: orderedKeys.filter((key) => key !== removedKey),
      requiredInputs: (data.requiredInputs || []).filter((key) => key !== removedKey)
    });
  };

  return <section className="config-section compose-text-editor">
    <div className="section-title"><div><strong>文本组合规则</strong><small>映射输入与固定文本按下方顺序组成一个结果</small></div></div>
    <label className="check-label"><input type="checkbox" checked={Boolean(data.requireAllMappedInputs)} onChange={(event) => onChange({ requireAllMappedInputs: event.target.checked })}/><span>所有映射输入必须有值，否则停止并报错</span></label>

    <div className="compose-subhead"><div><strong>固定文本</strong><small>标题、分隔段等不随运行变化的内容</small></div><button type="button" onClick={addFixed}><Plus size={13}/>添加</button></div>
    {!fixedEntries.length && <p className="config-hint compact">没有固定文本，仅拼接映射输入。</p>}
    {fixedEntries.map(([key, value], index) => <div className="fixed-input-card" key={index}>
      <div className="mapping-card-head"><strong>固定文本 {index + 1}</strong><button type="button" title="删除固定文本" aria-label={`删除固定文本 ${index + 1}`} onClick={() => removeFixed(index)}><Trash2 size={13}/></button></div>
      <label>标识名<input value={key} onChange={(event) => updateFixedKey(index, event.target.value)} placeholder="例如 chapterHeading"/></label>
      <label>内容<textarea rows="3" value={String(value ?? '')} onChange={(event) => updateFixedValue(index, event.target.value)} placeholder="运行时按顺序插入的固定文本"/></label>
    </div>)}

    <div className="compose-subhead"><div><strong>拼接顺序</strong><small>所有输入都会出现一次；勾选可单独设为必填</small></div></div>
    {!orderedKeys.length && <p className="config-hint compact">请先在“节点输入”添加映射变量，或在上方添加固定文本。</p>}
    <div className="composition-order-list">{orderedKeys.map((key, index) => {
      const forcedRequired = Boolean(data.requireAllMappedInputs) && mappedKeys.has(key);
      return <div className="composition-order-row" key={key}>
        <span className="order-index">{index + 1}</span>
        <div><code>{key}</code><small>{mappedKeys.has(key) ? '映射输入' : '固定文本'}</small></div>
        <label title={forcedRequired ? '已启用“所有映射输入必须有值”' : '将此项设为必填'}><input type="checkbox" checked={forcedRequired || requiredKeys.has(key)} disabled={forcedRequired} onChange={(event) => toggleRequired(key, event.target.checked)}/><span>必填</span></label>
        <button type="button" title="上移" aria-label={`上移 ${key}`} disabled={index === 0} onClick={() => moveKey(index, -1)}><ArrowUp size={13}/></button>
        <button type="button" title="下移" aria-label={`下移 ${key}`} disabled={index === orderedKeys.length - 1} onClick={() => moveKey(index, 1)}><ArrowDown size={13}/></button>
      </div>;
    })}</div>

    <label>分隔符<textarea rows="2" maxLength="20" value={data.separator ?? '\n'} onChange={(event) => onChange({ separator: event.target.value })} placeholder="默认换行"/></label>
    <div className="field-grid"><label>输出字段<input value={data.outputKey ?? 'content'} onChange={(event) => onChange({ outputKey: event.target.value })} placeholder="content"/></label><label>文本清理<select value={data.cleanupPreset || 'none'} onChange={(event) => onChange({ cleanupPreset: event.target.value })}><option value="none">不清理</option><option value="academicChinese">中文学术文本清理</option></select></label></div>
    <label className="check-label"><input type="checkbox" checked={data.omitEmpty !== false} onChange={(event) => onChange({ omitEmpty: event.target.checked })}/><span>忽略非必填的空值</span></label>
    <label className="check-label"><input type="checkbox" checked={Boolean(data.fullOutput)} onChange={(event) => onChange({ fullOutput: event.target.checked })}/><span>在节点卡片和运行详情中显示完整结果</span></label>
    <p className="config-hint">输出字段留空时直接返回文本；填写后返回对象，例如 <code>{'{ "content": "..." }'}</code>。后续节点可映射整个结果或该字段。</p>
  </section>;
}

function getStartVariables(nodes) {
  const variables = nodes.find((node) => node.type === 'start')?.data?.variables;
  return (Array.isArray(variables) ? variables : []).filter((variable) => String(variable?.name || '').trim());
}

function startVariableValue(variable, value) {
  if (variable.type === 'number') return Number(value);
  if (variable.type === 'boolean') return typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
  return value;
}

function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(token()));
  const [workflows, setWorkflows] = useState([]);
  const [workflowsLoaded, setWorkflowsLoaded] = useState(false);
  const [currentId, setCurrentId] = useState('academic-writing-main');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [message, setMessage] = useState({ type: 'info', text: '加载工作流…' });
  const [saving, setSaving] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [workflowTitle, setWorkflowTitle] = useState('');
  const [actionWorkflowId, setActionWorkflowId] = useState(null);
  const [runOpen, setRunOpen] = useState(false);
  const [runInputText, setRunInputText] = useState('{}');
  const [running, setRunning] = useState(false);
  const [runJobId, setRunJobId] = useState('');
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState('');
  const [runAbortController, setRunAbortController] = useState(null);
  const [runStartedAt, setRunStartedAt] = useState(0);
  const [runElapsedSeconds, setRunElapsedSeconds] = useState(0);
  const current = workflows.find((item) => item.id === currentId);
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const { screenToFlowPosition } = useReactFlow();
  const roots = useMemo(() => rootWorkflows(workflows), [workflows]);
  const lineage = useMemo(() => workflowLineage(currentId, workflows), [currentId, workflows]);
  const activeRoot = lineage[0] || roots[0];
  const runTrace = Array.isArray(runResult?.trace) ? runResult.trace : [];
  const startVariables = useMemo(() => getStartVariables(nodes), [nodes]);
  const runInputObject = useMemo(() => {
    try {
      const parsed = JSON.parse(runInputText || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }, [runInputText]);
  const estimatedModelCalls = useMemo(() => nodes.reduce((total, node) => {
    if (node.type === 'llm') return total + 1;
    if (node.type === 'loop') return total + Math.max(1, Math.min(20, Number.parseInt(node.data?.maxIterations, 10) || 1));
    return total;
  }, 0), [nodes]);
  const runValues = useMemo(() => {
    const values = runResult?.values || {};
    return Object.keys(values).length ? values : traceOutputValues(runTrace);
  }, [runResult?.values, runTrace]);
  const runNodeResults = useMemo(() => {
    const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
    const nodeMap = new Map(nodes.map((node) => [`${currentId}:${node.id}`, node]));
    const seen = new Set();
    const results = runTrace.map((step, index) => {
      const workflow = workflowMap.get(step.workflowId);
      const sourceNode = workflow?.nodes?.find((node) => node.id === step.nodeId) || nodeMap.get(`${step.workflowId || currentId}:${step.nodeId}`);
      const node = sourceNode || { id: step.nodeId || `trace-${index}`, type: step.type || 'transform', data: { label: step.nodeId || '执行节点' } };
      const value = step.status === 'failed' && step.error ? step.error : (step.output !== undefined ? step.output : runValues[step.nodeId]);
      if (step.nodeId) seen.add(`${step.workflowId || currentId}:${step.nodeId}`);
      return { key: `trace-${index}`, node, step, value };
    });
    nodes.forEach((node) => {
      if (runValues[node.id] === undefined || seen.has(`${currentId}:${node.id}`)) return;
      results.push({ key: `value-${node.id}`, node, step: null, value: runValues[node.id] });
    });
    return results;
  }, [currentId, nodes, runTrace, runValues, workflows]);

  // The list is a lightweight manager, not a second canvas. Keep it easy to
  // dismiss with Escape so it never traps the user while editing nodes.
  useEffect(() => {
    if (!listOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setListOpen(false);
        setActionWorkflowId(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [listOpen]);

  useEffect(() => {
    if (!running || !runStartedAt) return undefined;
    const updateElapsed = () => setRunElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [runStartedAt, running]);

  const ancestorNodes = useMemo(() => {
    if (!selectedId) return [];
    const incoming = new Map(nodes.map((node) => [node.id, []]));
    edges.forEach((edge) => incoming.get(edge.target)?.push(edge.source));
    const ancestors = new Set();
    const stack = [...(incoming.get(selectedId) || [])];
    while (stack.length) {
      const id = stack.pop();
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      stack.push(...(incoming.get(id) || []));
    }
    return nodes
      .filter((node) => ancestors.has(node.id) && node.type !== 'start')
      .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);
  }, [edges, nodes, selectedId]);

  const mappingSourceOptions = useMemo(() => [
    { value: 'input', label: '工作流开始输入', kind: 'workflow' },
    { value: 'output', label: '直接前序节点输出', kind: 'previous' },
    ...ancestorNodes.map((node) => ({
      value: `values.${node.id}`,
      label: `${node.data.displayLabel || node.data.label || NODE_META[node.type]?.label} · 节点输出`,
      kind: 'node'
    })),
    ...(selectedNode?.type === 'loop' ? [
      { value: 'loop.item', label: '当前循环项', kind: 'loop' },
      { value: 'loop.index', label: '当前循环序号', kind: 'loop' },
      { value: 'loop.previousOutputs', label: '之前循环结果', kind: 'loop' }
    ] : [])
  ], [ancestorNodes, selectedNode?.type]);

  const promptVariables = useMemo(() => {
    const mappingVariables = (selectedNode?.data.inputMappings || [])
      .filter((mapping) => String(mapping.target || '').trim())
      .map((mapping) => ({ label: mapping.target, value: `{{inputs.${mapping.target}}}` }));
    const declaredVariables = (nodes.find((node) => node.type === 'start')?.data?.variables || [])
      .filter((variable) => String(variable.name || '').trim())
      .map((variable) => ({ label: variable.name, value: `{{input.${variable.name}}}` }));
    return [
      ...mappingVariables,
      ...declaredVariables,
      { label: '题目', value: '{{input.topic}}' },
      { label: '专业', value: '{{input.field}}' },
      { label: '文档类型', value: '{{input.docType}}' },
      { label: '目标说明', value: '{{input.description}}' },
      { label: '写作要求', value: '{{input.requirements}}' },
      { label: '目标字数', value: '{{input.defaultTargetWords}}' },
      { label: '直接前序输出', value: '{{output}}' },
      { label: '工作流输入', value: '{{input}}' }
    ];
  }, [nodes, selectedNode?.data.inputMappings]);

  const decorate = useCallback((workflowList, flowNodes) => flowNodes.map((node) => {
    const child = workflowList.find((item) => item.id === node.data?.workflowId);
    return { ...node, data: {
      ...node.data,
      workflowName: workflowName(child),
      displayLabel: undefined
    } };
  }), []);

  const setWorkflowState = useCallback((list, workflow) => {
    setWorkflows(list);
    setCurrentId(workflow.id);
    setWorkflowTitle(workflow.name);
    setNodes(decorate(list, workflow.nodes));
    setEdges(workflow.edges.map((edge) => ({
      ...edge,
      type: 'default',
      pathOptions: { ...edge.pathOptions, curvature: 0.32 },
      markerEnd: { type: MarkerType.ArrowClosed }
    })));
    setSelectedId(null);
    setSelectedEdgeId(null);
    setRunResult(null);
    setRunError('');
    setRunOpen(false);
  }, [decorate, setEdges, setNodes]);

  const load = useCallback(async (targetId = currentId) => {
    try {
      const list = (await request('')).filter((workflow) => !ARCHIVED_WORKFLOW_IDS.has(workflow.id));
      setWorkflowsLoaded(true);
      const workflow = list.find((item) => item.id === targetId) || list[0];
      if (!workflow) throw new Error('暂无工作流');
      setWorkflowState(list, workflow);
      setMessage({ type: 'success', text: `已加载 ${workflowName(workflow)} · v${workflow.version}` });
      return workflow;
    } catch (error) { setWorkflowsLoaded(true); if (error.status === 401) { clearAdminSession(); setAuthenticated(false); } setMessage({ type: 'error', text: error.message }); }
  }, [currentId, setWorkflowState]);

  useEffect(() => { if (authenticated) load('academic-writing-main'); }, [authenticated]);

  const switchWorkflow = useCallback((id) => {
    const workflow = workflows.find((item) => item.id === id);
    if (!workflow) return setMessage({ type: 'error', text: `子工作流不存在：${id}` });
    setWorkflowState(workflows, workflow);
    setMessage({ type: 'info', text: `正在编辑：${workflowName(workflow)}` });
  }, [setWorkflowState, workflows]);

  const openWorkflow = useCallback((id) => {
    switchWorkflow(id);
    setListOpen(false);
  }, [switchWorkflow, workflows]);

  const onConnect = useCallback((connection) => setEdges((items) => addEdge({
    ...connection,
    id: `e-${connection.source}-${connection.target}-${Date.now()}`,
    type: 'default',
    pathOptions: { curvature: 0.32 },
    markerEnd: { type: MarkerType.ArrowClosed },
    label: connection.sourceHandle ? nodes.find((node) => node.id === connection.source)?.data.routes?.find((route) => route.key === connection.sourceHandle)?.label || connection.sourceHandle : undefined
  }, items)), [nodes, setEdges]);

  const connectionError = useCallback((connection, ignoredEdgeId = '') => {
    if (!connection.source || !connection.target) return '连线端点不完整';
    if (connection.source === connection.target) return '节点不能连接自身';
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (sourceNode?.type === 'output') return '输出节点不能再连接后续节点';
    if (targetNode?.type === 'start') return '开始节点不能接收输入连线';
    const remaining = edges.filter((edge) => edge.id !== ignoredEdgeId);
    if (remaining.some((edge) => edge.source === connection.source && edge.target === connection.target && (edge.sourceHandle || '') === (connection.sourceHandle || ''))) return '这条路径已经连接';
    const outgoing = remaining.filter((edge) => edge.source === connection.source);
    if (sourceNode?.type === 'condition') {
      const routes = sourceNode.data.routes?.length ? sourceNode.data.routes : [{ key: 'true' }, { key: 'false' }];
      if (!connection.sourceHandle || !routes.some((route) => route.key === connection.sourceHandle)) return '请从条件节点的具体分支端口连线';
      // A condition route is allowed to fan out.  Multiple connections from
      // the same handle are intentional parallel branches; duplicate
      // source/target paths are still rejected above.
    }
    const adjacency = new Map(nodes.map((node) => [node.id, []]));
    remaining.forEach((edge) => adjacency.get(edge.source)?.push(edge.target));
    adjacency.get(connection.source)?.push(connection.target);
    const stack = [connection.target];
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (id === connection.source) return '连线会形成循环；请使用循环子流程节点';
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(adjacency.get(id) || []));
    }
    return '';
  }, [edges, nodes]);

  const connectSafely = useCallback((connection) => {
    const error = connectionError(connection);
    if (error) return setMessage({ type: 'error', text: error });
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    const createsParallelBranch = sourceNode?.type !== 'condition' && edges.some((edge) => edge.source === connection.source);
    onConnect(connection);
    setMessage({
      type: 'info',
      text: `${createsParallelBranch ? '已增加并行分支：' : ''}${sourceNode?.data.label || connection.source} → ${targetNode?.data.label || connection.target}`
    });
  }, [connectionError, edges, nodes, onConnect]);

  const onReconnect = useCallback((oldEdge, connection) => {
    const error = connectionError(connection, oldEdge.id);
    if (error) return setMessage({ type: 'error', text: error });
    setEdges((items) => reconnectEdge(oldEdge, {
      ...connection,
      label: connection.sourceHandle ? nodes.find((node) => node.id === connection.source)?.data.routes?.find((route) => route.key === connection.sourceHandle)?.label || connection.sourceHandle : undefined
    }, items));
    setMessage({ type: 'success', text: '连线端点已更新，执行顺序将按新路径生效' });
  }, [connectionError, nodes, setEdges]);

  const save = useCallback(async (publish = false) => {
    if (!current) return;
    const resolvedName = String(workflowTitle || current.name || '').trim();
    if (!resolvedName) return setMessage({ type: 'error', text: '工作流名称不能为空' });
    setSaving(true);
    try {
      const cleanNodes = nodes.map(({ id, type, position, data }) => ({
        id, type, position, data: { ...data, workflowName: undefined, runtimeOutput: undefined, runtimeStatus: undefined, runtimeError: undefined, runtimeDurationMs: undefined }
      }));
      const cleanEdges = edges.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({ id, source, target, sourceHandle, targetHandle, label }));
      const workflowPayload = { ...current, name: resolvedName, nodes: cleanNodes, edges: cleanEdges };
      const validation = await request('/validate', { method: 'POST', body: JSON.stringify({ workflow: workflowPayload }) });
      if (!validation.valid) throw new Error(validation.errors.join('；'));
      const saved = await request(`/${current.id}`, { method: 'PUT', body: JSON.stringify(workflowPayload) });
      if (publish) await request(`/${current.id}/publish`, { method: 'POST' });
      setEditingName(false);
      await load(current.id);
      setMessage({ type: 'success', text: publish ? '已保存并启用，后续任务将使用此版本' : `已保存“${resolvedName}” · v${saved.version}` });
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
    finally { setSaving(false); }
  }, [current, edges, load, nodes, workflowTitle]);

  const openRunPanel = useCallback(() => {
    setListOpen(false);
    setActionWorkflowId(null);
    setRunError('');
    setRunOpen(true);
    if (!runResult) {
      const variables = getStartVariables(nodes);
      const initial = Object.fromEntries(variables.map((variable) => {
        const hasDefault = variable.defaultValue !== undefined && variable.defaultValue !== '';
        const value = hasDefault
          ? startVariableValue(variable, variable.defaultValue)
          : variable.type === 'boolean' ? false : '';
        return [variable.name, value];
      }));
      setRunInputText(variables.length
        ? JSON.stringify(initial, null, 2)
        : '{\n  "topic": "",\n  "field": "",\n  "docType": "论文",\n  "requirements": "",\n  "defaultTargetWords": 1800\n}');
    }
  }, [nodes, runResult]);

  const updateRunVariable = useCallback((variable, value) => {
    const next = { ...runInputObject };
    if (variable.type === 'number') next[variable.name] = value === '' ? '' : Number(value);
    else if (variable.type === 'boolean') next[variable.name] = Boolean(value);
    else next[variable.name] = value;
    setRunInputText(JSON.stringify(next, null, 2));
  }, [runInputObject]);

  const runWorkflow = useCallback(async (event) => {
    event?.preventDefault();
    if (!current || running) return;
    let input;
    try {
      input = JSON.parse(runInputText || '{}');
    } catch {
      setRunError('输入必须是有效 JSON');
      return;
    }
    const variables = getStartVariables(nodes);
    for (const variable of variables) {
      if (input[variable.name] === undefined && variable.defaultValue !== undefined && variable.defaultValue !== '') {
        input[variable.name] = startVariableValue(variable, variable.defaultValue);
      }
      if (variable.required && (input[variable.name] === undefined || input[variable.name] === '')) {
        setRunError(`请填写开始变量：${variable.name}`);
        return;
      }
    }
    const startedAt = Date.now();
    setRunStartedAt(startedAt);
    setRunElapsedSeconds(0);
    setRunning(true);
    setRunError('');
    setRunResult(null);
    setNodes((items) => items.map((node) => ({
      ...node,
      data: { ...node.data, runtimeStatus: undefined, runtimeOutput: undefined, runtimeError: undefined, runtimeDurationMs: undefined }
    })));
    const controller = new AbortController();
    setRunAbortController(controller);
    try {
      const cleanNodes = nodes.map(({ id, type, position, data }) => ({
        id, type, position, data: { ...data, workflowName: undefined, runtimeOutput: undefined, runtimeStatus: undefined, runtimeError: undefined, runtimeDurationMs: undefined }
      }));
      const cleanEdges = edges.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({ id, source, target, sourceHandle, targetHandle, label }));
      const workflow = { ...current, name: String(workflowTitle || current.name || '').trim(), nodes: cleanNodes, edges: cleanEdges };
      const result = await request(`/${current.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ input, workflow, async: true, maxSteps: 500, timeoutMs: 15 * 60 * 1000 }),
        signal: controller.signal
      });
      let data = result || {};
      const runId = data.runId;
      setRunJobId(runId || '');
      while (runId && ['queued', 'running'].includes(data.status)) {
        setRunResult({ ...data, input, durationMs: data.durationMs || (Date.now() - startedAt) });
        setNodes((items) => applyRuntimeSnapshot(items, Array.isArray(data.trace) ? data.trace : [], data.values || {}, current.id));
        await waitForPoll(900, controller.signal);
        data = await request(`/${current.id}/run/${encodeURIComponent(runId)}`, { signal: controller.signal });
      }
      if (data.status === 'failed') {
        const error = new Error(data.error || 'Workflow run failed');
        error.details = data;
        throw error;
      }
      if (data.status === 'cancelled') {
        const error = new Error('Run cancelled');
        error.name = 'AbortError';
        throw error;
      }
      const values = data.values || {};
      const trace = Array.isArray(data.trace) ? data.trace : [];
      const visibleValues = Object.keys(values).length ? values : traceOutputValues(trace);
      const visibleOutput = data.output !== undefined ? data.output : lastTraceOutput(trace, current.id);
      setRunResult({ ...data, input, output: visibleOutput, values: visibleValues, durationMs: data.durationMs ?? (Date.now() - startedAt) });
      setNodes((items) => applyRuntimeSnapshot(items, trace, visibleValues, current.id));
      setMessage({ type: 'success', text: '运行完成' });
    } catch (error) {
      if (error.name === 'AbortError') {
        setRunError('已停止运行');
        setMessage({ type: 'info', text: '已停止运行' });
      } else {
        const failedTrace = Array.isArray(error.details?.trace) ? error.details.trace : [];
        const failedValues = Object.keys(error.details?.values || {}).length
          ? error.details.values
          : traceOutputValues(failedTrace);
        const failedOutput = error.details?.output !== undefined ? error.details.output : lastTraceOutput(failedTrace, current.id);
        setRunResult({
          ...(error.details || {}),
          status: 'failed',
          input,
          error: error.message || '运行失败',
          output: failedOutput,
          values: failedValues,
          trace: failedTrace,
          durationMs: error.details?.durationMs ?? (Date.now() - startedAt)
        });
        if (failedTrace.length) {
          setNodes((items) => applyRuntimeSnapshot(items, failedTrace, failedValues, current.id));
        }
        setRunError(error.message || '运行失败');
        setMessage({ type: 'error', text: error.message || '运行失败' });
      }
    } finally {
      setRunning(false);
      setRunStartedAt(0);
      setRunAbortController(null);
      setRunJobId('');
    }
  }, [current, edges, nodes, runInputText, runInputObject, running, setNodes, workflowTitle]);

  const cancelRun = useCallback(() => {
    if (runJobId && current) {
      request(`/${current.id}/run/${encodeURIComponent(runJobId)}/cancel`, { method: 'POST' }).catch(() => {});
    }
    runAbortController?.abort();
  }, [current, runAbortController, runJobId]);

  const copyRunOutput = useCallback(async () => {
    try {
      await copyText(runtimeValueText(runResult?.output));
      setMessage({ type: 'success', text: '最终工作流输出已完整复制' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '复制失败' });
    }
  }, [runResult?.output]);

  const createWorkflow = useCallback(async (event) => {
    event.preventDefault();
    const name = newWorkflowName.trim();
    if (!name) return setMessage({ type: 'error', text: '请填写工作流名称' });
    setSaving(true);
    try {
      const id = `workflow-${Date.now().toString(36)}`;
      const systemPrompt = `你正在执行“${name}”工作流。请根据对应专业规范，以严谨、清晰、可直接使用的方式完成写作任务。`;
      await request(`/${id}`, { method: 'PUT', body: JSON.stringify({
        id, name, description: newWorkflowDescription.trim() || `${name}专业写作工作流`, status: 'draft', version: 1,
        nodes: [
          { id: 'start-node', type: 'start', position: { x: 120, y: 220 }, data: { label: '开始', description: '接收工作流输入' } },
          { id: 'deepseek-node', type: 'llm', position: { x: 410, y: 220 }, data: { label: 'DeepSeek 写作', description: '根据本专业提示词生成内容', action: 'chat', promptMode: 'inline', systemPrompt, userPrompt: '题目：{{input.topic}}\n专业：{{input.field}}\n文档类型：{{input.docType}}\n写作要求：{{input.requirements}}\n建议篇幅：{{input.defaultTargetWords}}字\n\n请完成写作。', responseMode: 'text', model: 'deepseek-chat', temperature: 0.55, maxTokens: 8192 } },
          { id: 'output-node', type: 'output', position: { x: 720, y: 220 }, data: { label: '输出结果', description: '返回工作流结果' } }
        ],
        edges: [
          { id: 'e-start-deepseek', source: 'start-node', target: 'deepseek-node' },
          { id: 'e-deepseek-output', source: 'deepseek-node', target: 'output-node' }
        ]
      }) });
      setCreating(false);
      setNewWorkflowName('');
      setNewWorkflowDescription('');
      const list = (await request('')).filter((workflow) => !ARCHIVED_WORKFLOW_IDS.has(workflow.id));
      const created = list.find((workflow) => workflow.id === id);
      if (!created) throw new Error('工作流已保存，但重新载入失败');
      setWorkflowState(list, created);
      // Keep the manager open after creation so the newly created workflow is
      // immediately visible in the list and can be renamed or copied again.
      setListOpen(true);
      setMessage({ type: 'success', text: `已创建并保存“${name}”` });
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
    finally { setSaving(false); }
  }, [newWorkflowDescription, newWorkflowName, setWorkflowState]);

  const copyWorkflow = useCallback(async (source) => {
    setSaving(true);
    try {
      const id = `workflow-${Date.now().toString(36)}`;
      const copied = JSON.parse(JSON.stringify(source));
      await request(`/${id}`, { method: 'PUT', body: JSON.stringify({
        ...copied,
        id,
        name: `${source.name} 副本`,
        description: source.description,
        status: 'draft',
        version: 1,
        publishedSnapshot: undefined
      }) });
      const list = (await request('')).filter((workflow) => !ARCHIVED_WORKFLOW_IDS.has(workflow.id));
      const created = list.find((workflow) => workflow.id === id);
      if (!created) throw new Error('复制后重新载入失败');
      setWorkflowState(list, created);
      setActionWorkflowId(null);
      setListOpen(true);
      setMessage({ type: 'success', text: `已复制“${source.name}”` });
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
    finally { setSaving(false); }
  }, [setWorkflowState]);

  const archiveWorkflow = useCallback(async (workflow) => {
    if (!window.confirm(`归档“${workflow.name}”？归档后不会出现在列表中，但不会删除历史数据。`)) return;
    setSaving(true);
    try {
      await request(`/${workflow.id}/archive`, { method: 'POST' });
      const list = (await request('')).filter((item) => !ARCHIVED_WORKFLOW_IDS.has(item.id));
      const next = list.find((item) => item.isActive) || list[0];
      if (next) setWorkflowState(list, next);
      setActionWorkflowId(null);
      setMessage({ type: 'success', text: `已归档“${workflow.name}”` });
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
    finally { setSaving(false); }
  }, [setWorkflowState]);

  const addNode = useCallback((type) => {
    const meta = NODE_META[type];
    const id = `${type}-${Date.now().toString(36)}`;
    setNodes((items) => items.concat({
      id, type, position: { x: 220 + items.length * 42, y: 160 + (items.length % 5) * 94 },
      data: {
        label: meta.label,
        description: '请在右侧配置节点',
        ...(type === 'condition' ? { conditionSource: 'output', operator: 'truthy', routes: [{ key: 'true', label: '满足' }, { key: 'false', label: '不满足' }] } : {}),
        ...(type === 'llm' ? { action: 'chat', promptMode: 'inline', systemPrompt: '', userPrompt: '{{output}}', responseMode: 'text', model: 'deepseek-chat', temperature: 0.55, maxTokens: 4096 } : {}),
        ...(type === 'plugin' ? { plugin: 'academicSearch', provider: 'openalex', key: '', input: '{{input.topic}}', count: 10 } : {})
      }
    }));
    setSelectedId(id);
  }, [setNodes]);

  const dropNode = useCallback((event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-workflow-node');
    if (!NODE_META[type]) return;
    const meta = NODE_META[type];
    const id = `${type}-${Date.now().toString(36)}`;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setNodes((items) => items.concat({
      id, type, position,
      data: {
        label: meta.label, description: '请在右侧配置节点',
        ...(type === 'condition' ? { conditionSource: 'output', operator: 'truthy', routes: [{ key: 'true', label: '满足' }, { key: 'false', label: '不满足' }] } : {}),
        ...(type === 'llm' ? { action: 'chat', promptMode: 'inline', systemPrompt: '', userPrompt: '{{output}}', responseMode: 'text', model: 'deepseek-chat', temperature: 0.55, maxTokens: 4096 } : {}),
        ...(type === 'plugin' ? { plugin: 'academicSearch', provider: 'openalex', key: '', input: '{{input.topic}}', count: 10 } : {})
      }
    }));
    setSelectedId(id);
    setSelectedEdgeId(null);
  }, [screenToFlowPosition, setNodes]);

  const updateSelected = useCallback((patch) => {
    setNodes((items) => items.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node));
  }, [selectedId, setNodes]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    setNodes((items) => items.filter((node) => node.id !== selectedId));
    setEdges((items) => items.filter((edge) => edge.source !== selectedId && edge.target !== selectedId));
    setSelectedId(null);
  }, [selectedId, setEdges, setNodes]);

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    setEdges((items) => items.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    setMessage({ type: 'info', text: '连线已删除' });
  }, [selectedEdgeId, setEdges]);

  const availableChildren = useMemo(() => workflows.filter((item) => item.id !== currentId), [workflows, currentId]);
  const selectedTransformOperation = selectedNode?.type === 'transform' && selectedNode.data.operation === 'assembleCozePaper'
    ? 'composeText'
    : selectedNode?.data.operation || 'passthrough';

  if (!authenticated) return <LoginScreen onLogin={() => setAuthenticated(true)}/>;

  return <div className="studio-shell">
    <header className="studio-header">
      <div className="brand"><span className="brand-mark"><Workflow size={20}/></span><div><strong>学术写作工作流</strong><span>DeepSeek · LangGraph</span></div></div>
      <div className="workflow-context">
        <span className="context-caption">当前工作流</span>
        {editingName ? <input className="workflow-title-input" autoFocus value={workflowTitle} onChange={(event) => setWorkflowTitle(event.target.value)} onBlur={() => workflowTitle.trim() && setEditingName(false)} onKeyDown={(event) => { if (event.key === 'Enter' && workflowTitle.trim()) setEditingName(false); }}/> : <button className="workflow-title-button" onClick={() => setEditingName(true)} title="点击重命名">{lineage.length > 1 ? `${workflowName(activeRoot)} / ${workflowName(current)}` : workflowTitle || workflowName(current)}</button>}
        <span className={`status ${current?.isActive ? 'published' : 'draft'}`}>{current?.isActive ? '使用中' : '未启用'}</span>
        <span className="version">v{current?.version || 1}</span>
      </div>
      <div className="header-actions">
        <a className="ghost-action" href="/admin/"><ArrowLeft size={15}/>返回后台</a>
        <button className="ghost-action" onClick={() => { clearAdminSession(); setAuthenticated(false); }}>退出</button>
        <button className="ghost-action" disabled={running || saving} onClick={() => load(currentId)}><RefreshCw size={15}/>重新载入</button>
        <button className="run-action" disabled={saving || running || !current} onClick={openRunPanel}><Play size={15}/>{running ? '运行中…' : '运行工作流'}</button>
        <button
          className={`ghost-action list-action ${listOpen ? 'active' : ''}`}
          disabled={running}
          onClick={() => { setRunOpen(false); setActionWorkflowId(null); setListOpen((open) => !open); }}
          aria-expanded={listOpen}
          aria-controls="workflow-list-panel"
        >
          <FolderOpen size={15}/><span>工作流</span><b className="list-count">{workflows.length}</b>
        </button>
        <button className="ghost-action" disabled={saving || running} onClick={() => save(false)}><Save size={15}/>保存工作流</button>
        <button className="publish-action" disabled={saving || running} onClick={() => save(true)}><Send size={15}/>保存并启用</button>
      </div>
    </header>

    {listOpen && <>
      <button className="workflow-list-backdrop" aria-label="关闭工作流列表" onClick={() => { setListOpen(false); setActionWorkflowId(null); }}/>
      <section id="workflow-list-panel" className="workflow-list-popover" role="dialog" aria-label="工作流列表">
      <div className="workflow-list-head">
        <div><strong>工作流</strong><span>{workflows.length} 个 · {roots.length} 套</span></div>
        <span className="list-head-actions"><button className="new-workflow-button" onClick={() => setCreating((value) => !value)}><Plus size={14}/>新建</button><button aria-label="关闭工作流列表" onClick={() => { setListOpen(false); setActionWorkflowId(null); }}><X size={16}/></button></span>
      </div>
      {creating && <form className="new-workflow-form" onSubmit={createWorkflow}><input autoFocus value={newWorkflowName} onChange={(event) => setNewWorkflowName(event.target.value)} placeholder="工作流名称"/><button disabled={saving}>创建</button></form>}
      <div className="workflow-card-list">
        {!workflowsLoaded && <div className="workflow-list-empty loading"><RefreshCw size={16}/><span>正在载入工作流…</span></div>}
        {workflowsLoaded && !roots.length && <div className="workflow-list-empty"><Workflow size={20}/><strong>还没有工作流</strong><span>创建一套流程后，会显示在这里。</span><button onClick={() => setCreating(true)}><Plus size={14}/>新建工作流</button></div>}
        {roots.map((root) => {
          const children = workflowFamily(root, workflows).slice(1);
          return <article className={`workflow-card ${activeRoot?.id === root.id ? 'current' : ''}`} key={root.id}>
          <button className="workflow-card-main" onClick={() => openWorkflow(root.id)}>
            <span className="family-icon"><Workflow size={17}/></span>
            <span className="family-copy"><strong>{workflowName(root)}</strong><small>{root.nodes?.length || 0} 个节点 · {formatUpdatedAt(root.updatedAt)}</small></span>
            <span className="family-meta"><b>{activeRoot?.id === root.id ? '当前' : root.isActive ? '使用中' : '未启用'}</b><small>v{root.version}</small></span>
          </button>
          <span className="workflow-card-actions">
            <button title="复制工作流" aria-label={`复制 ${workflowName(root)}`} onClick={() => copyWorkflow(root)}><Copy size={14}/></button>
            <button title="更多操作" aria-label={`更多操作 ${workflowName(root)}`} onClick={() => setActionWorkflowId((id) => id === root.id ? null : root.id)}><MoreHorizontal size={15}/></button>
          </span>
          {actionWorkflowId === root.id && <span className="workflow-action-menu">
            <button onClick={() => { openWorkflow(root.id); setEditingName(true); setActionWorkflowId(null); }}>重命名</button>
            <button disabled={root.isActive} title={root.isActive ? '使用中的工作流不能归档' : '归档工作流'} onClick={() => archiveWorkflow(root)}><Archive size={13}/>归档</button>
          </span>}
          {children.length > 0 && <div className="workflow-child-list" aria-label={`${workflowName(root)} 的子工作流`}>
            {children.map((child) => <button key={child.id} className={currentId === child.id ? 'current' : ''} onClick={() => openWorkflow(child.id)}>
              <span className="child-rail"/>
              <span className="child-depth">↳</span>
              <span><strong>{workflowName(child)}</strong><small>{child.nodes?.length || 0} 个节点 · {formatUpdatedAt(child.updatedAt)}</small></span>
              <ChevronRight size={14}/>
            </button>)}
          </div>}
        </article>;
        })}
      </div>
      </section>
    </>}

    {runOpen && <>
      <button className="run-panel-backdrop" aria-label="关闭运行面板" onClick={() => !running && setRunOpen(false)} />
      <section className="run-panel" role="dialog" aria-modal="true" aria-label="运行工作流">
        <div className="run-panel-head">
          <div><span>试运行</span><strong>{workflowName(current) || '工作流'}</strong></div>
          <button className="icon-button" disabled={running} onClick={() => setRunOpen(false)} aria-label="关闭"><X size={17}/></button>
        </div>
        <form className="run-form" onSubmit={runWorkflow}>
          {startVariables.length > 0 && <section className="run-start-variables"><div className="section-title"><div><strong>开始变量</strong><small>本次运行输入会覆盖默认值</small></div></div>{startVariables.map((variable) => <label key={variable.name}>{variable.name}{variable.description && <small>{variable.description}</small>}{variable.type === 'boolean' ? <input type="checkbox" checked={Boolean(runInputObject[variable.name])} onChange={(event) => updateRunVariable(variable, event.target.checked)} disabled={running}/> : <input type={variable.type === 'number' ? 'number' : 'text'} value={runInputObject[variable.name] ?? ''} onChange={(event) => updateRunVariable(variable, event.target.value)} placeholder={variable.defaultValue !== '' ? `默认：${variable.defaultValue}` : variable.required ? '必填' : '可选'} disabled={running}/>}</label>)}</section>}
          <label htmlFor="workflow-run-input">输入 JSON（高级）<textarea id="workflow-run-input" aria-label="工作流运行输入 JSON" value={runInputText} onChange={(event) => setRunInputText(event.target.value)} spellCheck="false" rows={startVariables.length > 0 ? 6 : 9} disabled={running}/></label>
          <div className="run-expectation"><Bot size={15}/><div><strong>{running ? `${runResult?.progress?.message || '后台并发运行中'} · ${runElapsedSeconds} 秒` : '运行说明'}</strong><span>{estimatedModelCalls > 1 ? `按当前画板最多会发起约 ${estimatedModelCalls} 次模型调用；可并行分支会异步并发执行。` : '当前画板预计 1 次模型调用，结果会在模型完整返回后显示。'}</span></div></div>
          <div className="run-failure-policy"><CircleStop size={14}/><span>任一节点失败会停止本次工作流；不会跳过错误。已完成节点的结果会保留在画板用于排查。</span></div>
          {runError && <div className="run-error">{runError}</div>}
          <div className="run-form-actions"><button type="button" className="ghost-action" disabled={running} onClick={() => setRunInputText('{}')}>清空</button>{running ? <button type="button" className="run-cancel" onClick={cancelRun}>停止</button> : <button className="run-submit"><Play size={15}/>开始运行</button>}</div>
        </form>
        {runResult && <div className="run-result">
          <div className="run-result-head"><div><span>工作流运行结果</span><strong className={runResult.status === 'failed' ? 'result-failed' : 'result-completed'}>{runStatusLabel(runResult.status)}</strong></div><small>{runResult.durationMs ? `${runResult.durationMs} ms` : ''}</small></div>
          {runResult.status === 'failed' && runResult.error && <div className="run-result-error">{runResult.error}</div>}
          <section className="result-block final-result"><div className="result-block-head"><strong>最终工作流输出</strong><button type="button" onClick={copyRunOutput}><Copy size={12}/>复制全部</button></div><pre>{runtimeValueText(runResult.output)}</pre></section>
           {runNodeResults.length > 0 && <section className="result-block node-results"><div className="result-block-head"><strong>各节点输出</strong><span>{runNodeResults.length}</span></div><div className="node-result-list">{runNodeResults.map(({ key, node, step, value }) => <details key={key} open={runNodeResults.length <= 6}><summary><span className={`result-dot ${step?.status === 'failed' ? 'failed' : 'done'}`}/><strong>{node.data.label || NODE_META[node.type]?.label || step?.nodeId}</strong><small>{step?.status === 'failed' ? '失败' : `${step?.durationMs != null ? `${step.durationMs} ms · ` : ''}${NODE_META[node.type]?.label || step?.type || '节点'}${step?.workflowId && step.workflowId !== currentId ? ' · 子流程' : ''}`}</small></summary><div className="node-result-values">{step?.input !== undefined && <div><span>节点输入</span><pre>{formatRuntimeValue(step.input, 3000)}</pre></div>}{step?.plugin && <div><span>插件调用</span><pre>{formatRuntimeValue(step.plugin, 3000)}</pre></div>}{step?.prompt?.messages && <div className="node-prompt-trace"><span>发送给模型（变量已替换）</span><pre>{formatRuntimeValue(step.prompt.messages, 8000)}</pre>{step.prompt.unresolved?.length > 0 && <small className="prompt-unresolved">未找到变量：{step.prompt.unresolved.join('、')}</small>}</div>}<div><span>节点输出</span><pre>{node.type === 'output' || node.data.fullOutput ? runtimeValueText(value) : formatRuntimeValue(value, 5000)}</pre></div></div></details>)}</div></section>}
          {runTrace.length > 0 && <div className="run-trace"><span>执行路径</span><strong>{runTrace.map((step) => step.nodeId).filter(Boolean).join(' → ')}</strong></div>}
        </div>}
      </section>
    </>}

    <div className="studio-main">
      <aside className="node-library">
        <div className="side-title"><span>节点</span><small>点击添加</small></div>
        <div className="node-list">{Object.entries(NODE_META).map(([type, meta]) => {
          const Icon = meta.icon;
          return <button key={type} draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-workflow-node', type); event.dataTransfer.effectAllowed = 'move'; }} onClick={() => addNode(type)}><span className={`lib-icon tone-${meta.tone}`}><Icon size={16}/></span><span><strong>{meta.label}</strong><small>{type === 'subworkflow' ? '嵌套已发布流程' : type === 'loop' ? '遍历集合并调用子流程' : type === 'condition' ? '二元或多路条件路由' : type === 'plugin' ? '搜索学术 API' : '拖入画布或点击添加'}</small></span></button>;
        })}</div>
        <div className="nesting-card"><Layers3 size={17}/><div><strong>可嵌套</strong><p>子工作流可复用。</p></div></div>
      </aside>

      <main className="canvas-wrap" onDrop={dropNode} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}>
        <div className="breadcrumb-bar">
          {lineage.map((workflow, index) => <React.Fragment key={workflow.id}>{index > 0 && <ChevronRight size={14}/>} {index === lineage.length - 1 ? <strong>{workflowName(workflow)}</strong> : <button onClick={() => openWorkflow(workflow.id)}>{workflowName(workflow)}</button>}</React.Fragment>)}
          {lineage.length > 1 && <span className="breadcrumb-hint">返回上层</span>}
        </div>
        <ReactFlow
          key={currentId}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={connectSafely}
          onReconnect={onReconnect}
          edgesReconnectable
          reconnectRadius={18}
          onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(null); }}
          onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(null); }}
          onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null); }}
          onNodeDoubleClick={(_, node) => {
            if (['subworkflow', 'loop'].includes(node.type) && node.data.workflowId) openWorkflow(node.data.workflowId);
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.08}
          maxZoom={1.8}
          connectionLineType={ConnectionLineType.Bezier}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ type: 'default', pathOptions: { curvature: 0.32 }, markerEnd: { type: MarkerType.ArrowClosed } }}
        >
          <Background color="#d9e2f2" gap={22}/><MiniMap pannable zoomable/><Controls/>
        </ReactFlow>
        <InlineNotice message={message} onClose={() => setMessage({ type: '', text: '' })}/>
      </main>

      <aside className={`inspector ${selectedNode || selectedEdge ? '' : 'empty'}`}>
        {selectedNode ? <>
          <div className="inspector-head"><div><span>节点配置</span><strong>{NODE_META[selectedNode.type]?.label}</strong></div><button onClick={() => setSelectedId(null)}><X size={17}/></button></div>
          <section className="config-section"><label>节点名称<input value={selectedNode.data.label || ''} onChange={(event) => updateSelected({ label: event.target.value })}/></label><label>说明<textarea rows="2" value={selectedNode.data.description || ''} onChange={(event) => updateSelected({ description: event.target.value })}/></label></section>
          {selectedNode.type === 'start' && <StartVariablesEditor variables={selectedNode.data.variables || []} onChange={(variables) => updateSelected({ variables })}/>} 
          {selectedNode.type === 'output' && <section className="config-section output-terminal-section"><div className="section-title"><div><strong>最终结果</strong><small>输出节点负责结束流程，不再次调用模型</small></div></div><div className="terminal-output-card"><CircleStop size={17}/><div><strong>返回直接上游节点的结果</strong><span>需要整理、拼接或重写最终内容时，请把数据处理或 DeepSeek 节点连接在这里之前。</span></div></div></section>}
          {!['start', 'output'].includes(selectedNode.type) && <MappingEditor mappings={selectedNode.data.inputMappings || []} sourceOptions={mappingSourceOptions} onChange={(inputMappings) => updateSelected(selectedTransformOperation === 'composeText' ? { operation: 'composeText', ...reconcileCompositionMappings(selectedNode.data, inputMappings) } : { inputMappings })}/>}
          {!['start', 'output', 'condition'].includes(selectedNode.type) && <section className="config-section output-section"><div className="section-title"><div><strong>节点输出</strong><small>本节点执行结果会自动提供给所有后续节点</small></div></div><div className="output-contract"><span>引用方式</span><code>{`{{values.${selectedNode.id}}}`}</code></div><label>只暴露结果中的字段（可选）<input value={selectedNode.data.outputPath || ''} onChange={(event) => updateSelected({ outputPath: event.target.value })} placeholder="例如 content；留空表示完整输出"/></label><label className="check-label"><input type="checkbox" checked={Boolean(selectedNode.data.mergeOutput)} onChange={(event) => updateSelected({ mergeOutput: event.target.checked })}/><span>将对象结果与直接前序输出合并</span></label></section>}
          {selectedNode.type === 'llm' && <section className="config-section"><div className="section-title"><div><strong>DeepSeek 大模型</strong><small>输入、提示词、模型参数和输出都在本节点配置</small></div></div><label>运行模式<select value={selectedNode.data.action || 'chat'} onChange={(event) => updateSelected({ action: event.target.value, promptMode: event.target.value === 'chat' ? 'inline' : selectedNode.data.promptMode })}><option value="chat">自定义提示词（可编辑）</option><option value="planDocument">内置流程：规划论文结构</option><option value="draftSection">内置流程：撰写单章</option></select></label>{selectedNode.data.action === 'chat' ? <><PromptField label="系统提示词" rows={6} value={selectedNode.data.systemPrompt || ''} onChange={(systemPrompt) => updateSelected({ systemPrompt, promptMode: 'inline' })} placeholder="定义模型角色、任务边界、写作规范和输出要求" variables={promptVariables}/><PromptField label="用户提示词" rows={8} value={selectedNode.data.userPrompt || '{{output}}'} onChange={(userPrompt) => updateSelected({ userPrompt, promptMode: 'inline' })} placeholder="描述本次具体任务；可插入上方输入变量" variables={promptVariables}/><label>返回格式<select value={selectedNode.data.responseMode || 'text'} onChange={(event) => updateSelected({ responseMode: event.target.value })}><option value="text">文本</option><option value="json">JSON 对象</option></select></label></> : <><p className="config-hint">内置流程使用产品预设的编排逻辑；如需逐字控制提示词，可切换为“自定义提示词”。</p><button type="button" className="ghost-action convert-prompt-button" onClick={() => { const prompts = builtInPromptDefaults(selectedNode.data.action); updateSelected({ action: 'chat', promptMode: 'inline', ...prompts }); }}>转为自定义提示词</button></>}<label>模型<select value={selectedNode.data.model || 'deepseek-chat'} onChange={(event) => updateSelected({ model: event.target.value })}><option value="deepseek-chat">deepseek-chat</option><option value="deepseek-reasoner">deepseek-reasoner</option></select></label><div className="field-grid"><label>Temperature<input type="number" step="0.05" min="0" max="1.5" value={selectedNode.data.temperature ?? 0.55} onChange={(event) => updateSelected({ temperature: Number(event.target.value) })}/></label><label>最大 Tokens<input type="number" min="128" max="32768" step="128" value={selectedNode.data.maxTokens ?? 4096} onChange={(event) => updateSelected({ maxTokens: Number(event.target.value) })}/></label></div></section>}
          {selectedNode.type === 'plugin' && <section className="config-section"><div className="section-title"><div><strong>学术文献检索</strong><small>节点被执行时调用所选学术 API</small></div></div><label>学术 API<select value={selectedNode.data.provider || 'openalex'} onChange={(event) => updateSelected({ provider: event.target.value })}><option value="openalex">OpenAlex</option><option value="semanticScholar">Semantic Scholar</option><option value="arxiv">arXiv</option><option value="crossref">Crossref</option></select></label><label>Key（可选）<input type="password" autoComplete="off" value={selectedNode.data.key || ''} onChange={(event) => updateSelected({ key: event.target.value })} placeholder="OpenAlex、arXiv、Crossref 可留空；Semantic Scholar 可填写 Key"/></label><label>Input<textarea rows="4" value={typeof selectedNode.data.input === 'string' ? selectedNode.data.input : JSON.stringify(selectedNode.data.input || '', null, 2)} onChange={(event) => updateSelected({ input: event.target.value })} placeholder="关键词或变量，例如 {{input.topic}}" spellCheck="false"/></label><label>返回数量<input type="number" min="1" max="50" value={selectedNode.data.count ?? 10} onChange={(event) => updateSelected({ count: Number(event.target.value) })}/></label><p className="config-hint">OpenAlex、arXiv、Crossref 可不填 Key；Semantic Scholar 建议填写以提高限额。请求最长等待 30 秒，空关键词、网络或 API 错误都会让节点明确失败。</p><p className="config-hint">输出包含 items、total、query、provider；每篇文献统一提供标题、摘要、作者、年份、DOI 和链接。</p></section>}
          {selectedNode.type === 'prompt' && <section className="config-section"><div className="section-title"><div><strong>提示词</strong><small>{'仅替换 {{路径}}，不执行代码'}</small></div></div><label>模板模式<select value={selectedNode.data.templateKey === 'academicSection' ? 'academicSection' : 'custom'} onChange={(event) => updateSelected({ templateKey: event.target.value === 'academicSection' ? 'academicSection' : '' })}><option value="custom">通用模板</option><option value="academicSection">学术章节模板</option></select></label>{selectedNode.data.templateKey !== 'academicSection' && <><label>系统提示词<textarea rows="4" value={selectedNode.data.systemPrompt || ''} onChange={(event) => updateSelected({ systemPrompt: event.target.value })} placeholder="你是一名学术编辑"/></label><label>用户提示词<textarea rows="5" value={selectedNode.data.userPrompt || '{{output}}'} onChange={(event) => updateSelected({ userPrompt: event.target.value })} placeholder="请处理：{{output}}"/></label></>}</section>}
          {selectedNode.type === 'transform' && <><section className="config-section"><div className="section-title"><div><strong>数据处理</strong><small>安全操作，不允许任意脚本</small></div></div><label>处理动作<select value={selectedTransformOperation} onChange={(event) => updateSelected({ operation: event.target.value, ...(event.target.value === 'composeText' ? { separator: selectedNode.data.separator ?? '\n', outputKey: selectedNode.data.outputKey ?? 'content', cleanupPreset: selectedNode.data.cleanupPreset || 'none', omitEmpty: selectedNode.data.omitEmpty !== false } : {}) })}><option value="passthrough">原样传递</option><option value="pick">读取路径</option><option value="set">设置字段</option><option value="merge">合并对象</option><option value="template">文本模板</option><option value="jsonParse">解析 JSON</option><option value="toArray">转为数组</option><option value="composeText">按顺序拼接文本</option><option value="prepareWritingInput">整理写作输入</option><option value="assembleDocument">汇总全文</option></select></label><p className="config-hint operation-hint">{TRANSFORM_OPERATION_HELP[selectedTransformOperation]}</p>{['pick', 'jsonParse', 'toArray'].includes(selectedTransformOperation) && <label>来源路径<input value={selectedNode.data.sourcePath || 'output'} onChange={(event) => updateSelected({ sourcePath: event.target.value })}/></label>}{selectedTransformOperation === 'set' && <><label>目标字段<input value={selectedNode.data.targetKey || 'value'} onChange={(event) => updateSelected({ targetKey: event.target.value })}/></label><label>来源路径<input value={selectedNode.data.valueFrom || ''} onChange={(event) => updateSelected({ valueFrom: event.target.value })} placeholder="留空使用固定值"/></label><label>固定值<input value={selectedNode.data.value || ''} onChange={(event) => updateSelected({ value: event.target.value })}/></label></>}{selectedTransformOperation === 'merge' && <label>来源路径（逗号分隔）<input value={selectedNode.data.sourcePaths || 'input,output'} onChange={(event) => updateSelected({ sourcePaths: event.target.value })}/></label>}{selectedTransformOperation === 'template' && <label>文本模板<textarea rows="5" value={selectedNode.data.template || '{{output}}'} onChange={(event) => updateSelected({ template: event.target.value })}/></label>}</section>{selectedTransformOperation === 'composeText' && <ComposeTextEditor data={selectedNode.data} onChange={updateSelected}/>}</>}
          {selectedNode.type === 'condition' && <section className="config-section"><div className="section-title"><div><strong>条件与端口</strong><small>支持二元判断与多路分类分支</small></div></div><label>判断路径<input value={selectedNode.data.conditionSource || 'output'} onChange={(event) => updateSelected({ conditionSource: event.target.value })} placeholder="output.enabled"/></label><p className="config-hint operation-hint">output 表示直接前序输出；values.节点ID 表示指定上游节点输出。多路分类会按匹配值选择一个端口，未匹配时走最后一个默认分支。</p><label>运算符<select value={selectedNode.data.operator || 'truthy'} onChange={(event) => updateSelected({ operator: event.target.value })}><option value="truthy">为真</option><option value="equals">等于</option><option value="notEquals">不等于</option><option value="contains">包含</option><option value="gt">大于</option><option value="gte">大于等于</option><option value="lt">小于</option><option value="lte">小于等于</option><option value="exists">存在</option></select></label>{!['truthy', 'exists'].includes(selectedNode.data.operator || 'truthy') && <label>比较值<input value={selectedNode.data.compareValue ?? ''} onChange={(event) => updateSelected({ compareValue: event.target.value })}/></label>}<div className="route-list">{(selectedNode.data.routes?.length ? selectedNode.data.routes : [{ key: 'true', label: '满足' }, { key: 'false', label: '不满足' }]).map((route, index) => <div key={route.key}><span className={`route-dot route-${index}`}/><input value={route.key} disabled aria-label={`分支键 ${index + 1}`}/><input value={route.label || ''} aria-label={`分支名称 ${index + 1}`} onChange={(event) => updateSelected({ routes: (selectedNode.data.routes?.length ? selectedNode.data.routes : [{ key: 'true', label: '满足' }, { key: 'false', label: '不满足' }]).map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })}/></div>)}</div></section>}
          {['subworkflow', 'loop'].includes(selectedNode.type) && <section className="config-section"><div className="section-title"><div><strong>子流程</strong><small>把一组复杂节点封装成可复用模块</small></div></div><label>目标子工作流<select value={selectedNode.data.workflowId || ''} onChange={(event) => updateSelected({ workflowId: event.target.value, workflowName: workflowName(workflows.find((item) => item.id === event.target.value)) })}><option value="">选择子工作流</option>{availableChildren.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflowName(workflow)}</option>)}</select></label>{selectedNode.data.workflowId && <p className="workflow-explanation">{workflowDescription(workflows.find((item) => item.id === selectedNode.data.workflowId))}</p>}{selectedNode.type === 'loop' && <><label>需要遍历的数组<input value={selectedNode.data.collectionPath || ''} onChange={(event) => updateSelected({ collectionPath: event.target.value })} placeholder="例如 output.sections 或 values.plan.sections"/></label><div className="field-grid"><label>当前项变量<input value={selectedNode.data.itemVariable || 'item'} onChange={(event) => updateSelected({ itemVariable: event.target.value })}/></label><label>最大次数<input type="number" min="1" max="100" value={selectedNode.data.maxIterations ?? 20} onChange={(event) => updateSelected({ maxIterations: Number(event.target.value) })}/></label></div></>}</section>}
          {['subworkflow', 'loop'].includes(selectedNode.type) && selectedNode.data.workflowId && <button className="open-child" onClick={() => openWorkflow(selectedNode.data.workflowId)}><Layers3 size={15}/>进入子工作流</button>}
          {!['start', 'output'].includes(selectedNode.type) && <button className="delete-node" onClick={removeSelected}><X size={15}/>删除节点</button>}
        </> : selectedEdge ? <><div className="inspector-head"><div><span>连线</span><strong>路径</strong></div><button onClick={() => setSelectedEdgeId(null)}><X size={17}/></button></div><div className="edge-card"><Link2 size={18}/><div><strong>{nodes.find((node) => node.id === selectedEdge.source)?.data.label || selectedEdge.source}</strong><span>连接到</span><strong>{nodes.find((node) => node.id === selectedEdge.target)?.data.label || selectedEdge.target}</strong></div></div>{selectedEdge.sourceHandle && <label>分支标签<input value={selectedEdge.label || selectedEdge.sourceHandle} onChange={(event) => setEdges((items) => items.map((edge) => edge.id === selectedEdge.id ? { ...edge, label: event.target.value } : edge))}/></label>}<button className="delete-node" onClick={removeSelectedEdge}><Trash2 size={15}/>删除连线</button></> : <div className="empty-inspector"><Sparkles size={26}/><strong>选择节点开始</strong><p>从左侧添加节点，拖动端口连接。</p></div>}
      </aside>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<ReactFlowProvider><App/></ReactFlowProvider>);
