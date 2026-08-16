# DeepSeek + LangGraph.js 学术写作框架

## 当前技术决策

本项目采用 **LangGraph.js + DeepSeek OpenAI-compatible API**。

选择 LangGraph.js 而不是 Python 的原因：

- 当前后端是 Node.js/Express，直接在同一进程编排，无需新增 Python 服务、RPC、部署和监控链路。
- 学术长文需要的是有状态流程：先规划，再循环生成章节，最后汇总；LangGraph 与这个状态机高度匹配。
- 订单、积分和文档保存仍由现有 Node 业务层控制，避免跨语言事务边界。
- 将来可在图中增加检索、文件解析、人工暂停和持久化，不需要推翻现有接口。

Python 更适合后续单独承担文献解析、OCR、数据分析、向量化和 RAG 检索服务，但现在为了生成长文单独拆 Python，会增加复杂度而没有直接收益。

## 当前流程

```text
prepare → plan → draftSection ↺ → assemble → END
```

- `prepare`：规范化目标字数和初始图状态。
- `plan`：DeepSeek 输出结构化章节计划。
- `draftSection`：根据图状态逐章调用 DeepSeek，直到所有章节完成。
- `assemble`：合并标题和章节，直接作为最终结果返回。

当前流程只负责编排并输出结果，不包含规则校验、二次审查、质量门禁、自动重写或备用引擎。

## 代码边界

```text
routes/writing.js
  └─ 认证、积分预检、订单、保存、成功后扣费

services/writing-workflow/graph.js
  └─ LangGraph 状态与节点编排

services/writing-workflow/providers/deepseek.js
  └─ DeepSeek 请求、超时、重试、JSON 解析、用量记录

services/writing-workflow/prompts.js
  └─ 规划、章节生成、题目生成提示词
```

## 配置

```env
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
DEEPSEEK_API_KEY=
DEEPSEEK_PLANNING_MODEL=deepseek-chat
DEEPSEEK_DRAFTING_MODEL=deepseek-chat
DEEPSEEK_TITLE_MODEL=deepseek-chat
DEEPSEEK_TIMEOUT_MS=120000
DEEPSEEK_MAX_OUTPUT_TOKENS=8192
DEEPSEEK_TEMPERATURE=0.55
DEEPSEEK_MAX_RETRIES=2

WRITING_MAX_SECTIONS=9
WRITING_MIN_TARGET_WORDS=800
WRITING_MAX_TARGET_WORDS=12000
```

## 后续扩展顺序

1. 将后台 `setImmediate` 换成持久队列，避免服务重启丢任务。
2. 为 LangGraph 增加 checkpoint，实现章节级恢复。
3. 接入真实文献检索和 RAG 节点。
4. 将 Python 作为独立的文献处理/RAG 服务，而不是替代 Node 主业务后端。
5. 当多种模型确有成本或效果差异时，再增加模型路由；当前保持 DeepSeek-only。

