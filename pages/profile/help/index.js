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
    title: "如何生成高质量的论文？",
    category: "guide",
    content: "请先选择学科领域并填写题目，勾选需要生成的章节，然后在详细要求中说明字数、文献等需求。生成结果可进一步编辑。"
  },
  {
    id: 2,
    title: "积分如何使用和充值？",
    category: "points",
    content: "AI创作与降重会消耗积分，可在个人中心点击‘我的余额’进行充值，支持多种套餐。"
  },
  {
    id: 3,
    title: "AI降重的效果如何？",
    category: "feature",
    content: "AI降重基于语义理解和文本重写，将保持原意并优化语句，以降低重复率。建议完成后进行人工复核。"
  },
  {
    id: 4,
    title: "如何确保学术诚信？",
    category: "integrity",
    content: "我们提供原创性的写作与降重工具，但请务必遵守学校规范，引用来源并进行必要的人工修改与审核。"
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
    wx.setNavigationBarTitle({ title: "帮助中心" });
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
  
  // 拨打客服电话
  onCallPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    wx.makePhoneCall({
      phoneNumber: phone,
      success: () => {
        console.log('拨打电话成功');
      },
      fail: (err) => {
        console.error('拨打电话失败:', err);
        wx.showToast({
          title: '无法拨打电话',
          icon: 'none'
        });
      }
    });
  },
  
  // 复制邮箱
  onCopyEmail(e) {
    const email = e.currentTarget.dataset.email;
    wx.setClipboardData({
      data: email,
      success: () => {
        wx.showToast({
          title: '邮箱已复制',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  }
});

