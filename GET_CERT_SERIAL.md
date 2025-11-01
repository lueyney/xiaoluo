# 🔑 获取证书序列号

## 方法1：使用OpenSSL命令

```bash
cd C:\Users\Administrator\Desktop\2025.9.24\backend-code\certs
openssl x509 -in apiclient_cert.pem -noout -serial
```

输出示例：
```
serial=5157F09EFDC096DE15EBE81A47057A72
```

## 方法2：在微信商户平台查看

1. 登录 https://pay.weixin.qq.com
2. 账户中心 → API安全 → API证书
3. 直接查看证书序列号

## 配置序列号

获得序列号后，修改 `.env` 文件：

```env
WECHAT_CERT_SERIAL=5157F09EFDC096DE15EBE81A47057A72
```

替换 `YOUR_CERT_SERIAL_HERE` 为真实的序列号。

## 验证配置

修改后重启服务：
```bash
taskkill /F /IM node.exe
npm start
```

---

**如果没有证书序列号，系统仍然可以运行，但生产环境强烈建议配置。**

