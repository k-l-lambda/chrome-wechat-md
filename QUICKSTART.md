# 快速开始指南

## 步骤 1: 生成图标文件 （1 分钟）

### 方法 A: 使用浏览器生成（推荐）

1. 用浏览器打开文件：`C:\Users\kllam\work\wechat-md-extension\icons\convert.html`
2. 页面会自动生成三个尺寸的图标预览
3. 依次点击三个"下载"按钮：
   - 下载 `icon-16.png` 并保存到 icons 文件夹
   - 下载 `icon-48.png` 并保存到 icons 文件夹
   - 下载 `icon-128.png` 并保存到 icons 文件夹

### 方法 B: 跳过图标（临时方案）

如果暂时无法生成图标，可以：
1. 使用任意 PNG 图片重命名为 `icon-16.png`, `icon-48.png`, `icon-128.png`
2. Chrome 开发者模式会容忍缺失的图标
3. 或者暂时注释掉 manifest.json 中的 icons 部分

## 步骤 2: 在 Chrome 中加载扩展 （1 分钟）

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 启用右上角的 **"开发者模式"** 开关
4. 点击左上角的 **"加载已解压的扩展程序"** 按钮
5. 选择文件夹：`C:\Users\kllam\work\wechat-md-extension`
6. 确认扩展已加载成功

## 步骤 3: 测试扩展 （2 分钟）

### 3.1 登录微信公众号后台

1. 访问 https://mp.weixin.qq.com/
2. 扫码登录你的公众号账号

### 3.2 打开扩展

1. 点击浏览器工具栏中的扩展图标（拼图图标）
2. 找到 "WeChat Markdown Publisher"
3. 点击打开弹出窗口

### 3.3 发布测试文章

在弹出窗口中：

**方法 A: 粘贴文本**
1. 切换到"粘贴文本"标签页
2. 在"文章标题"输入框中输入标题，例如：`测试文章`
3. 在"Markdown 内容"文本框中粘贴以下示例：

\`\`\`markdown
## 这是一个测试标题

这是一段普通文本。

### 代码示例

\`\`\`javascript
console.log('Hello WeChat!');
\`\`\`

### 列表示例

- 项目 1
- 项目 2
- 项目 3

**粗体文本** 和 *斜体文本*
\`\`\`

4. 点击"发布到草稿箱"按钮
5. 等待发布完成（会显示进度和结果）

**方法 B: 上传文件**
1. 切换到"选择文件"标签页
2. 输入文章标题
3. 点击"选择 .md 文件"或拖拽文件到虚线框
4. 点击"发布到草稿箱"

### 3.4 验证结果

1. 在微信公众号后台，点击左侧菜单"素材管理" → "草稿箱"
2. 查看是否有新的草稿文章
3. 点击预览，检查格式是否正确

## 故障排除

### 扩展无法加载

**错误**: "Manifest file is missing or unreadable"
- **解决**: 检查 manifest.json 语法是否正确
- **命令**: `cat manifest.json | jq .` (验证 JSON 格式)

### 图标文件缺失

**错误**: "Could not load icon"
- **解决方案 1**: 按照步骤 1 生成图标
- **解决方案 2**: 临时注释掉 manifest.json 中的 icons 部分：
\`\`\`json
{
  "manifest_version": 3,
  "name": "WeChat Markdown Publisher",
  // "icons": {
  //   "16": "icons/icon-16.png",
  //   ...
  // },
  ...
}
\`\`\`

### 无法发布到微信

**错误**: "请先登录微信公众号"
- **解决**: 确保已在 https://mp.weixin.qq.com/ 登录
- **验证**: 刷新微信后台页面，确认 Cookie 有效

**错误**: "无法获取认证 token"
- **解决**: 尝试刷新微信后台页面
- **检查**: F12 控制台查看是否有 CORS 错误

### marked.js 未加载

**错误**: "marked.js 未加载"
- **解决**: 检查 lib/marked.min.js 文件是否存在
- **验证**: `ls -lh lib/marked.min.js` (应该约 35KB)

## 开发调试

### 查看扩展日志

1. 打开 Chrome DevTools (F12)
2. 切换到 "Console" 标签
3. 过滤 "[WeChat Publisher]" 关键字
4. 查看详细的执行日志

### 重新加载扩展

修改代码后：
1. 访问 `chrome://extensions/`
2. 找到 "WeChat Markdown Publisher"
3. 点击 🔄 刷新按钮
4. 重新测试

### 调试 Content Script

1. 在微信公众号后台页面打开 DevTools (F12)
2. Console 中会显示 Content Script 的日志
3. Sources 标签可以看到注入的脚本

### 调试 Popup

1. 右键点击扩展图标
2. 选择"检查弹出内容"
3. 会打开专门的 DevTools 窗口

## 下一步

扩展加载成功后，可以：

1. ✅ 尝试发布真实的 Markdown 文章
2. ✅ 测试图片上传功能（如果文章包含图片）
3. ✅ 测试代码块、表格、引用等格式
4. ✅ 根据需要调整样式（修改 publisher.js 中的 inlineCSS 方法）

## 完成！

扩展已可以正常使用。如遇问题，查看：
- [README.md](README.md) - 完整文档
- [INSTALL.md](INSTALL.md) - 详细安装说明
- GitHub Issues - 报告问题
