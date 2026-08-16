const categories = [
  { label: "全部", value: "all" },
  { label: "使用指南", value: "guide" },
  { label: "积分相关", value: "points" },
  { label: "功能介绍", value: "feature" },
  { label: "学术诚信", value: "integrity" }
];

const faqList = [
  {
    id: 1,
    title: "论文生成前需要准备什么？",
    category: "guide",
    content: "请先选择学科领域、填写论文题目并选择要生成的章节。详细需求中建议注明字数、格式和参考文献要求，并保持网络稳定以保证生成过程顺畅。"
  },
  {
    id: 2,
    title: "AI创作提示积分不足怎么办？",
    category: "points",
    content: "当当前积分低于所需积分时，可立即前往充值。首充仅需1元即可获得50积分，足够完成一次标准论文生成。点击弹框中的“去充值”可快速跳转。"
  },
  {
    id: 3,
    title: "首次充值有哪些优惠？",
    category: "points",
    content: "账号首次充值享受1元50积分的优惠，后续可根据需求选择其他套餐。充值成功后积分实时同步，如未到账可在余额页下拉刷新或联系在线客服。"
  },
  {
    id: 4,
    title: "收不到短信验证码怎么办？",
    category: "guide",
    content: "请确认手机号输入无误并保持信号良好，短时间内多次获取验证码可能触发运营商限流。若仍无法收到，可稍后再试或联系客服处理。"
  },
  {
    id: 5,
    title: "AI起名或论文生成失败怎么办？",
    category: "feature",
    content: "若出现 503 或请求超时，请检查网络并稍后重试。确保已填写题目、学科领域等必填项，若持续失败可截图报错信息与时间，通过帮助中心联系方式提交给客服。"
  },
  {
    id: 6,
    title: "如何导出与下载生成的文档？",
    category: "guide",
    content: "生成完成后可在文档列表中选择导出 Word，系统会自动保存至“我的导出”目录，并提供下载链接或发送到绑定邮箱。"
  },
  {
    id: 7,
    title: "账号基本资料在哪里修改？",
    category: "feature",
    content: "进入个人中心-账号设置，可编辑头像、昵称、邮箱并通过短信验证修改登录密码。保存成功后前后端数据实时同步。"
  },
  {
    id: 8,
    title: "如何确保学术诚信？",
    category: "integrity",
    content: "平台提供原创写作与降重工具，请合理使用生成内容，引用参考资料并遵守学校及期刊的学术规范。建议提交前进行人工审阅与查重。"
  }
];

function filterFaqs(keyword, category) {
  const lower = keyword.trim().toLowerCase();
  return faqList
    .filter(item => category === "all" || item.category === category)
    .filter(item => {
      if (!lower) return true;
      const title = item.title.toLowerCase();
      const content = item.content.toLowerCase();
      return title.indexOf(lower) !== -1 || content.indexOf(lower) !== -1;
    })
    .map(item => Object.assign({}, item, { categoryLabel: getCategoryLabel(item.category) }));
}

function getCategoryLabel(value) {
  const target = categories.find(item => item.value === value);
  return target ? target.label : "常见问题";
}

Page({
  data: {
    categories,
    searchKeyword: "",
    activeCategory: "all",
    filteredFaqs: [],
    openFaqId: null
  },
  onShow() {
    tt.setNavigationBarTitle({ title: "帮助中心" });
    this.applyFilter();
  },
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || "" });
    this.applyFilter();
  },
  onCategoryChange(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ activeCategory: value });
    this.applyFilter();
  },
  applyFilter() {
    const list = filterFaqs(this.data.searchKeyword, this.data.activeCategory);
    this.setData({ filteredFaqs: list, openFaqId: null });
  },
  toggleFaq(e) {
    const id = Number(e.currentTarget.dataset.id);
    this.setData({ openFaqId: this.data.openFaqId === id ? null : id });
  },
  
  // 复制客服微信
  onCopyWechat(e) {
    const wechat = e.currentTarget.dataset.wechat;
    tt.setClipboardData({
      data: wechat,
      success: () => {
        tt.showToast({
          title: '微信已复制',
          icon: 'success'
        });
      },
      fail: () => {
        tt.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  },
  
  // 复制邮箱
  onCopyEmail(e) {
    const email = e.currentTarget.dataset.email;
    tt.setClipboardData({
      data: email,
      success: () => {
        tt.showToast({
          title: '邮箱已复制',
          icon: 'success'
        });
      },
      fail: () => {
        tt.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  }
});

