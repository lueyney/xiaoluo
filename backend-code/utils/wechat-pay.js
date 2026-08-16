/**
 * 微信支付工具类（向后兼容）
 * 此文件主要用于兼容旧代码，实际功能由 wechat-pay-v3.js 提供
 */

const wechatPayV3 = require('./wechat-pay-v3');

// 导出 V3 的所有功能
module.exports = wechatPayV3;

