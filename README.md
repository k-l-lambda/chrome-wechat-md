# WeChat Markdown Publisher

最小权限设计的微信公众号 Markdown 发布扩展

## 特点

✅ **最小权限** - 仅需微信公众号域名访问权限
✅ **无 CSP 问题** - 纯 Content Script 实现，无 Service Worker
✅ **简单易用** - 在微信公众号后台直接使用
✅ **自动认证** - 读取浏览器登录态，无需手动配置

## 权限说明

```json
{
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://mp.weixin.qq.com/*"]
}
```

- `storage` - 存储用户设置和 Markdown 模板
- `activeTab` - 访问当前标签页（用户主动触发）
- `https://mp.weixin.qq.com/*` - 仅微信公众号后台

**对比完整版 Wechatsync:**
- 原版需要: `http://*/*` + `https://*/*` (所有网站)
- 本扩展: 仅微信域名 (**减少 95% 权限范围**)

## 安装

### 方式 1: 加载未打包扩展 (推荐)

1. 打开 Chrome: `chrome://extensions`
2. 启用 "开发者模式"
3. 点击 "加载已解压的扩展程序"
4. 选择此目录

### 方式 2: 从源码构建

```bash
cd wechat-md-extension
# 无需构建，直接加载
```

## 使用方法

1. 登录微信公众号后台: https://mp.weixin.qq.com/
2. 点击浏览器工具栏中的扩展图标
3. 在弹出窗口中:
   - 粘贴 Markdown 内容
   - 或从文件选择 `.md` 文件
4. 点击"发布到草稿箱"
5. 等待处理完成，获取草稿链接

## 功能

### ✅ 已实现
- Markdown → HTML 转换 (marked.js)
- CSS 样式内联 (juice.js)
- 图片自动上传到微信 CDN
- 发布到微信草稿箱
- 实时进度显示

### 🚧 计划中
- LaTeX 数学公式支持
- 代码块语法高亮
- 自定义样式模板
- 草稿管理功能

## 技术架构

### Content Script Only 设计

```
用户访问 mp.weixin.qq.com
    ↓
Content Script 自动注入
    ↓
读取 document.cookie (获取 token)
    ↓
直接调用微信 API (fetch)
    ↓
无需 Background Service Worker
```

**优势:**
- ✅ 避免 CSP 限制 (无 eval/Function)
- ✅ 直接访问页面上下文
- ✅ 无消息传递开销
- ✅ 实现简单，易维护

## 项目结构

```
wechat-md-extension/
├── manifest.json           # 扩展配置（最小权限）
├── icons/                  # 扩展图标
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── popup/                  # 弹出界面
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── content/                # Content Script
│   ├── publisher.js        # 核心发布逻辑
│   └── ui.css             # 注入的 UI 样式
├── lib/                    # 第三方库
│   ├── marked.min.js      # Markdown 解析器
│   └── juice.browser.min.js  # CSS 内联工具
└── README.md
```

## 核心代码

### Markdown 转换

```javascript
// 使用 marked.js 解析 Markdown
const html = marked.parse(markdown)

// 使用 juice 内联 CSS 样式
const WEIXIN_CSS = `
  p { color: rgb(51,51,51); font-size: 15px; line-height: 1.75em; }
  h1 { font-size: 1.25em; font-weight: bold; }
  ...
`
const styledHtml = juice.inlineContent(`<section>${html}</section>`, WEIXIN_CSS)
```

### 图片上传

```javascript
async function uploadImage(imageUrl) {
  const blob = await fetch(imageUrl).then(r => r.blob())
  const formData = new FormData()
  formData.append('file', blob, 'image.jpg')

  const response = await fetch(
    `https://mp.weixin.qq.com/cgi-bin/filetransfer?action=upload_material&token=${token}`,
    { method: 'POST', body: formData }
  )

  const { cdn_url } = await response.json()
  return cdn_url
}
```

### 发布文章

```javascript
async function publishArticle(title, content) {
  const formData = new URLSearchParams({
    token,
    title0: title,
    content0: content,
    auto_gen_digest0: '1',
    // ... 其他参数
  })

  const response = await fetch(
    'https://mp.weixin.qq.com/cgi-bin/operate_appmsg?sub=create',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    }
  )

  const { appMsgId } = await response.json()
  return `https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=${appMsgId}`
}
```

## 对比其他方案

| 方案 | 权限 | CSP 安全 | 实现复杂度 |
|------|------|---------|----------|
| **本扩展 (Content Script)** | ✅ 最小 | ✅ 是 | ✅ 低 |
| Wechatsync (MV2) | ❌ 全域 | ⚠️ 需 eval | ⚠️ 中 |
| Node.js CLI | ✅ 无 | ✅ 是 | ⚠️ 中 |

## 故障排除

### 扩展无法加载
- 检查 Chrome 版本 (需 v88+)
- 确认已启用开发者模式

### 无法发布文章
- 确认已登录微信公众号后台
- 检查浏览器控制台错误信息
- 验证 token 是否有效

### 图片上传失败
- 检查图片 URL 是否可访问
- 验证图片大小 (微信限制 10MB)

## 开发

### 调试

1. 访问 `chrome://extensions`
2. 找到此扩展，点击"检查视图"
3. 在微信后台页面，按 F12 查看 Content Script 日志

### 修改代码

修改后需重新加载扩展:
1. 在 `chrome://extensions` 点击刷新按钮
2. 或者 Ctrl+R 重新加载页面

## 许可证

MIT License

## 相关项目

- [Wechatsync](https://github.com/wechatsync/Wechatsync) - 多平台同步扩展
- [marked](https://github.com/markedjs/marked) - Markdown 解析器
- [juice](https://github.com/Automattic/juice) - CSS 内联工具

## 贡献

欢迎提交 Issue 和 Pull Request！
