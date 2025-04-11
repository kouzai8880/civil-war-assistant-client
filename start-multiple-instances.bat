@echo off
echo 正在启动多个英雄联盟内战助手实例...

REM 启动第一个实例
start "内战助手实例1" cmd /c "npm run electron:dev"

REM 等待3秒，确保第一个实例已经启动
timeout /t 3

REM 启动第二个实例
start "内战助手实例2" cmd /c "npm run electron:dev"

echo 已启动两个实例。
echo 如需更多实例，请复制上面的命令并修改实例名称。
