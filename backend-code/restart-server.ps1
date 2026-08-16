# 微信支付后端服务 - 重启脚本
# 用法：在 PowerShell 中运行 .\restart-server.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🔄 重启后端服务" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. 查找占用3000端口的进程
Write-Host "📍 步骤1: 检查端口占用..." -ForegroundColor Yellow
$port = 3000
$process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1

if ($process) {
    $pid = $process.OwningProcess
    Write-Host "   找到进程 PID: $pid" -ForegroundColor Green
    
    # 2. 停止旧进程
    Write-Host "`n🛑 步骤2: 停止旧进程..." -ForegroundColor Yellow
    try {
        Stop-Process -Id $pid -Force
        Write-Host "   ✅ 旧进程已停止" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "   ❌ 停止进程失败: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ℹ️  端口 $port 未被占用" -ForegroundColor Gray
}

# 3. 启动新服务
Write-Host "`n🚀 步骤3: 启动新服务..." -ForegroundColor Yellow
Write-Host "   运行: npm start`n" -ForegroundColor Gray

# 检查是否在正确的目录
if (-not (Test-Path "package.json")) {
    Write-Host "   ❌ 错误: 未找到 package.json" -ForegroundColor Red
    Write-Host "   请在 backend-code 目录中运行此脚本" -ForegroundColor Red
    exit 1
}

# 启动服务
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "正在启动服务..." -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

# 使用 npm start 启动
npm start


