# 图标文件说明

## 需要的图标尺寸

- `icon-16.png` (16x16像素)
- `icon-48.png` (48x48像素)
- `icon-128.png` (128x128像素)

## 方法 1: 使用 icon.svg 转换

已创建 `icon.svg` 文件，包含微信绿色背景和"微"字图标。

### 在线转换工具：

1. **Convertio** - https://convertio.co/zh/svg-png/
   - 上传 icon.svg
   - 选择输出尺寸：16x16, 48x48, 128x128
   - 下载并重命名

2. **CloudConvert** - https://cloudconvert.com/svg-to-png
   - 同上操作

3. **Icon Kitchen** - https://icon.kitchen/
   - 专门用于生成应用图标
   - 可自动生成所有尺寸

## 方法 2: 使用浏览器本地转换

打开 `convert.html` 文件（在浏览器中）：
1. 会自动加载 icon.svg
2. 自动生成三个尺寸的 PNG
3. 右键保存为对应文件名

## 方法 3: 使用 ImageMagick（如已安装）

```bash
cd icons
convert -background none -size 16x16 icon.svg icon-16.png
convert -background none -size 48x48 icon.svg icon-48.png
convert -background none -size 128x128 icon.svg icon-128.png
```

## 方法 4: 临时占位符

如果暂时无法生成图标，可以使用任意 PNG 图片重命名为对应文件名。
Chrome 在开发者模式下会容忍缺失或错误的图标。
