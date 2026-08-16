/**
 * 充值套餐配置
 * 当前规则：
 * 1. 新用户可免费领取20积分，仅限一次
 * 2. 其余付费套餐按 1 元 = 10 积分
 * 3. AI降重：1万字消耗180积分（约18积分/千字）
 */

function calcCreditsByPrice(price) {
  return Math.floor(price * 10);
}

// 充值套餐列表
const RECHARGE_PACKAGES = [
  {
    id: 1,
    price: 0,
    totalCredits: 20,
    baseCredits: 20,
    bonusCredits: 0,
    isFirstRecharge: true,
    label: '新用户免费礼包',
    tag: '免费',
    description: '新用户专享，免费领取20积分',
    popular: false
  },
  {
    id: 2,
    price: 10,
    totalCredits: calcCreditsByPrice(10),
    baseCredits: calcCreditsByPrice(10),
    bonusCredits: 0,
    isFirstRecharge: false,
    label: '10元套餐',
    description: '10元充值，到账100积分',
    popular: false
  },
  {
    id: 3,
    price: 20,
    totalCredits: calcCreditsByPrice(20),
    baseCredits: calcCreditsByPrice(20),
    bonusCredits: 0,
    isFirstRecharge: false,
    label: '20元套餐',
    description: '20元充值，到账200积分',
    popular: false
  },
  {
    id: 4,
    price: 30,
    totalCredits: calcCreditsByPrice(30),
    baseCredits: calcCreditsByPrice(30),
    bonusCredits: 0,
    isFirstRecharge: false,
    label: '30元套餐',
    description: '30元充值，到账300积分',
    popular: false
  },
  {
    id: 5,
    price: 50,
    totalCredits: calcCreditsByPrice(50),
    baseCredits: calcCreditsByPrice(50),
    bonusCredits: 0,
    isFirstRecharge: false,
    label: '50元套餐',
    description: '50元充值，到账500积分',
    popular: true,
    tag: '推荐'
  },
  {
    id: 6,
    price: 100,
    totalCredits: calcCreditsByPrice(100),
    baseCredits: calcCreditsByPrice(100),
    bonusCredits: 0,
    isFirstRecharge: false,
    label: '100元套餐',
    description: '100元充值，到账1000积分',
    popular: false
  },
  {
    id: 7,
    price: 200,
    totalCredits: calcCreditsByPrice(200),
    baseCredits: calcCreditsByPrice(200),
    bonusCredits: 0,
    isFirstRecharge: false,
    label: '200元套餐',
    description: '200元充值，到账2000积分',
    popular: false
  },
  {
    id: 8,
    price: 500,
    totalCredits: calcCreditsByPrice(500),
    baseCredits: calcCreditsByPrice(500),
    bonusCredits: 0,
    isFirstRecharge: false,
    label: '500元套餐',
    description: '500元充值，到账5000积分',
    popular: false
  },
  {
    id: 9,
    price: 1000,
    totalCredits: calcCreditsByPrice(1000),
    baseCredits: calcCreditsByPrice(1000),
    bonusCredits: 0,
    isFirstRecharge: false,
    label: '1000元套餐',
    description: '1000元充值，到账10000积分',
    popular: false
  }
];

/**
 * 根据ID获取套餐信息
 * @param {number} packageId - 套餐ID
 * @returns {Object|null} 套餐信息
 */
function getPackageById(packageId) {
  return RECHARGE_PACKAGES.find(pkg => pkg.id === packageId) || null;
}

/**
 * 验证套餐参数是否正确
 * @param {number} packageId - 套餐ID
 * @param {number} amount - 金额
 * @param {number} credits - 积分
 * @param {boolean} isFirstTime - 是否首充
 * @returns {Object} { valid, error, package }
 */
function validatePackage(packageId, amount, credits, isFirstTime) {
  const pkg = getPackageById(packageId);
  
  if (!pkg) {
    return {
      valid: false,
      error: '无效的套餐ID'
    };
  }
  
  // 验证金额是否匹配（免费套餐 price=0 也允许）
  if (Number(amount) !== Number(pkg.price)) {
    return {
      valid: false,
      error: `套餐金额不匹配，预期¥${pkg.price}，实际¥${amount}`
    };
  }
  
  // 验证积分是否匹配（考虑首充状态）
  let expectedCredits;
  if (pkg.isFirstRecharge && isFirstTime) {
    expectedCredits = pkg.totalCredits;
  } else if (pkg.isFirstRecharge && !isFirstTime) {
    // 已首充，此套餐不再适用
    return {
      valid: false,
      error: '您已领取过新用户免费积分'
    };
  } else {
    expectedCredits = pkg.baseCredits;
  }
  
  if (Number(credits) !== expectedCredits) {
    return {
      valid: false,
      error: `积分数量不匹配，预期${expectedCredits}积分，实际${credits}积分`
    };
  }
  
  return {
    valid: true,
    package: {
      id: pkg.id,
      name: pkg.label,
      price: pkg.price,
      credits: expectedCredits,
      isFirstRecharge: pkg.isFirstRecharge && isFirstTime
    }
  };
}

/**
 * 简单验证套餐ID是否存在
 * @param {number} packageId - 套餐ID
 * @returns {boolean} 是否有效
 */
function isValidPackageId(packageId) {
  return RECHARGE_PACKAGES.some(pkg => pkg.id === packageId);
}

/**
 * 获取所有套餐列表
 * @returns {Array} 套餐列表
 */
function getAllPackages() {
  return RECHARGE_PACKAGES;
}

/**
 * 计算实际应获得的积分（考虑首充状态）
 * @param {number} packageId - 套餐ID
 * @param {boolean} hasFirstRecharged - 是否已首充
 * @returns {Object} { totalCredits, baseCredits, bonusCredits }
 */
function calculateCredits(packageId, hasFirstRecharged) {
  const pkg = getPackageById(packageId);
  if (!pkg) {
    throw new Error('无效的套餐ID');
  }
  
  // 如果是首充套餐但用户已经首充过，则按普通套餐处理
  if (pkg.isFirstRecharge && hasFirstRecharged) {
    return {
      totalCredits: pkg.baseCredits,
      baseCredits: pkg.baseCredits,
      bonusCredits: 0,
      isFirstRecharge: false
    };
  }
  
  return {
    totalCredits: pkg.totalCredits,
    baseCredits: pkg.baseCredits,
    bonusCredits: pkg.bonusCredits,
    isFirstRecharge: pkg.isFirstRecharge && !hasFirstRecharged
  };
}

module.exports = {
  RECHARGE_PACKAGES,
  getPackageById,
  validatePackage,
  isValidPackageId,
  getAllPackages,
  calculateCredits
};

