/**
 * WeChat Markdown Publisher - Popup UI
 * 处理用户交互和 Markdown 加载
 */

(function() {
  'use strict';

  // DOM elements
  const elements = {
    // Tabs
    tabs: document.querySelectorAll('.tab'),
    tabPaste: document.getElementById('tab-paste'),
    tabFile: document.getElementById('tab-file'),

    // Paste Tab
    articleTitle: document.getElementById('article-title'),
    markdownInput: document.getElementById('markdown-input'),
    charCount: document.getElementById('char-count'),
    publishBtn: document.getElementById('publish-btn'),

    // File Tab
    fileDropZone: document.getElementById('file-drop-zone'),
    folderInput: document.getElementById('folder-input'),
    selectFolderBtn: document.getElementById('select-folder-btn'),
    fileInfo: document.getElementById('file-info'),
    clearFileBtn: document.getElementById('clear-file-btn'),
    fileArticleTitle: document.getElementById('file-article-title'),
    publishFileBtn: document.getElementById('publish-file-btn'),

    // Progress & Result
    progressSection: document.getElementById('progress-section'),
    progressText: document.getElementById('progress-text'),
    progressFill: document.getElementById('progress-fill'),
    resultSection: document.getElementById('result-section'),
    resultSuccess: document.getElementById('result-success'),
    resultError: document.getElementById('result-error'),
    draftLink: document.getElementById('draft-link'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),

    // Status
    statusBadge: document.getElementById('status-badge'),
    statusText: document.getElementById('status-text')
  };

  let currentFile = null;
  let currentFolder = null;  // Map of filename -> File object for local images

  // 初始化
  async function init() {
    await checkWeChatStatus();
    setupEventListeners();
    loadDraft();
  }

  // 检查微信登录状态
  async function checkWeChatStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes('mp.weixin.qq.com')) {
        updateStatus('warning', '请先访问微信公众号后台');
        return false;
      }

      // Send message to content script to check status
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'checkStatus'
      });

      if (response && response.hasToken) {
        updateStatus('success', '已登录');
        return true;
      } else {
        updateStatus('error', '未登录或登录过期');
        return false;
      }

    } catch (error) {
      console.error('Check status failed:', error);
      if (error.message && error.message.includes('Receiving end does not exist')) {
        updateStatus('warning', '请刷新页面后重试');
      } else {
        updateStatus('warning', '内容脚本未加载');
      }
      return false;
    }
  }

  // 更新状态徽章
  function updateStatus(status, text) {
    elements.statusBadge.className = `status-badge status-${status}`;
    elements.statusText.textContent = text;
  }

  // 设置事件监听
  function setupEventListeners() {
    // Tab switching
    elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Paste Tab
    elements.markdownInput.addEventListener('input', updateCharCount);
    elements.markdownInput.addEventListener('input', updatePublishButton);
    elements.articleTitle.addEventListener('input', updatePublishButton);
    elements.publishBtn.addEventListener('click', handlePublish);

    // File Tab (folder selection)
    elements.selectFolderBtn.addEventListener('click', () => elements.folderInput.click());
    elements.folderInput.addEventListener('change', handleFolderSelect);
    elements.clearFileBtn.addEventListener('click', clearFile);
    elements.publishFileBtn.addEventListener('click', handlePublishFile);

    // Drag & Drop
    elements.fileDropZone.addEventListener('dragover', handleDragOver);
    elements.fileDropZone.addEventListener('drop', handleDrop);

    // Result
    elements.retryBtn.addEventListener('click', retry);

    // Support normal Ctrl+V paste
    // Browser handles paste event by default, no manual interception needed
    elements.markdownInput.addEventListener('paste', () => {
      // 更新字符计数
      setTimeout(() => {
        updateCharCount();
        updatePublishButton();
      }, 10);
    });

    // Also support input event (when user types)
    elements.markdownInput.addEventListener('input', () => {
      updateCharCount();
      updatePublishButton();
    });
  }

  // 切换标签页
  function switchTab(tabName) {
    // 更新标签按钮
    elements.tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // 更新内容区
    elements.tabPaste.classList.toggle('active', tabName === 'paste');
    elements.tabFile.classList.toggle('active', tabName === 'file');

    // 隐藏结果
    hideResult();
  }

  // 更新字符计数
  function updateCharCount() {
    const count = elements.markdownInput.value.length;
    elements.charCount.textContent = count.toLocaleString();
  }

  // 更新发布按钮状态
  function updatePublishButton() {
    const hasContent = elements.markdownInput.value.trim().length > 0;
    const hasTitle = elements.articleTitle.value.trim().length > 0;
    elements.publishBtn.disabled = !hasContent || !hasTitle;
  }

  // 处理文件夹选择
  function handleFolderSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      loadFolder(files);
    }
  }

  // 加载文件夹
  async function loadFolder(files) {
    // Find markdown file
    const mdFile = files.find(f => f.name.match(/\.(md|markdown)$/i));
    if (!mdFile) {
      showError('文件夹中未找到 .md 文件');
      return;
    }

    // Build file map for images
    currentFolder = new Map();
    const imageExtensions = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i;
    let imageCount = 0;

    files.forEach(file => {
      // Store by relative path (webkitRelativePath includes folder name)
      const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
      currentFolder.set(relativePath, file);
      currentFolder.set(file.name, file);  // Also store by filename for simple references

      if (file.name.match(imageExtensions)) {
        imageCount++;
      }
    });

    currentFile = mdFile;

    // 显示文件信息
    const folderName = mdFile.webkitRelativePath.split('/')[0];
    elements.fileInfo.querySelector('.file-name').textContent = `${folderName}/${mdFile.name}`;
    elements.fileInfo.querySelector('.image-count').textContent = imageCount > 0 ? `(${imageCount} 张图片)` : '';
    elements.fileInfo.style.display = 'flex';
    elements.fileDropZone.querySelector('.file-drop-content').style.display = 'none';

    // 从 markdown 提取 H1 标题，若无则使用文件名
    const markdown = await readFileContent(mdFile);
    const h1Title = extractH1FromMarkdown(markdown);
    const titleFromName = mdFile.name.replace(/\.(md|markdown|txt)$/i, '');
    elements.fileArticleTitle.value = h1Title || titleFromName;

    console.log(`[Popup] Title extracted: "${h1Title || titleFromName}" (H1: ${h1Title ? 'yes' : 'no'})`);

    // 启用发布按钮
    elements.publishFileBtn.disabled = false;

    console.log(`[Popup] Loaded folder with ${files.length} files, ${imageCount} images`);
  }

  // 清除文件
  function clearFile() {
    currentFile = null;
    currentFolder = null;
    elements.folderInput.value = '';
    elements.fileInfo.style.display = 'none';
    elements.fileDropZone.querySelector('.file-drop-content').style.display = 'flex';
    elements.fileArticleTitle.value = '';
    elements.publishFileBtn.disabled = true;
  }

  // 拖放处理
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.fileDropZone.classList.add('drag-over');
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.fileDropZone.classList.remove('drag-over');

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    // Check if it's a folder drop
    const item = items[0];
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry && entry.isDirectory) {
        // Handle folder drop
        const files = await readDirectoryEntries(entry);
        if (files.length > 0) {
          loadFolder(files);
        }
        return;
      }
    }

    // Fallback: treat as file drop (for backwards compatibility)
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Check if multiple files (might be a folder)
      if (files.length > 1 || files[0].webkitRelativePath) {
        loadFolder(files);
      } else {
        showError('请选择包含 Markdown 文件的文件夹，而不是单个文件');
      }
    }
  }

  // Recursively read directory entries
  async function readDirectoryEntries(directoryEntry) {
    const files = [];

    async function readEntries(entry, basePath = '') {
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => {
          entry.file(resolve, reject);
        });
        // Simulate webkitRelativePath
        Object.defineProperty(file, 'webkitRelativePath', {
          value: basePath + file.name,
          writable: false
        });
        files.push(file);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });
        for (const childEntry of entries) {
          await readEntries(childEntry, basePath + entry.name + '/');
        }
      }
    }

    await readEntries(directoryEntry, directoryEntry.name + '/');
    return files;
  }

  // 读取文件内容
  async function readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // 从 markdown 提取 H1 标题
  function extractH1FromMarkdown(markdown) {
    const h1Regex = /^\s*#\s+(.+?)(?:\r?\n|$)/;
    const match = markdown.match(h1Regex);
    return match ? match[1].trim() : null;
  }

  // 发布文章 (粘贴模式)
  async function handlePublish() {
    const markdown = elements.markdownInput.value.trim();
    const title = elements.articleTitle.value.trim();

    if (!markdown || !title) {
      showError('请输入标题和内容');
      return;
    }

    await publish(markdown, title);
  }

  // 发布文章 (文件模式)
  async function handlePublishFile() {
    if (!currentFile) {
      showError('请选择文件夹');
      return;
    }

    const title = elements.fileArticleTitle.value.trim();
    if (!title) {
      showError('请输入文章标题');
      return;
    }

    try {
      let markdown = await readFileContent(currentFile);

      // Process local images if folder is available
      if (currentFolder) {
        markdown = await processLocalImages(markdown);
      }

      await publish(markdown, title);
    } catch (error) {
      showError('处理文件失败: ' + error.message);
    }
  }

  // Extract local image references and convert to data URLs
  async function processLocalImages(markdown) {
    // Match markdown image syntax: ![alt](path)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = [...markdown.matchAll(imageRegex)];

    console.log(`[Popup] Found ${matches.length} image references in markdown`);

    for (const match of matches) {
      const [fullMatch, alt, imagePath] = match;

      // Skip external URLs
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
        continue;
      }

      // Try to find the local file
      const imageFile = currentFolder.get(imagePath) || currentFolder.get(imagePath.replace(/^\.\//, ''));

      if (imageFile) {
        console.log(`[Popup] Converting local image: ${imagePath}`);
        try {
          const dataUrl = await fileToDataUrl(imageFile);
          markdown = markdown.replace(fullMatch, `![${alt}](${dataUrl})`);
          console.log(`[Popup] Converted ${imagePath} to data URL (${dataUrl.length} chars)`);
        } catch (error) {
          console.warn(`[Popup] Failed to convert ${imagePath}:`, error);
        }
      } else {
        console.warn(`[Popup] Local image not found: ${imagePath}`);
      }
    }

    return markdown;
  }

  // Convert File to data URL
  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 执行发布
  async function publish(markdown, title) {
    // 显示进度
    showProgress();

    try {
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes('mp.weixin.qq.com')) {
        throw new Error('请在微信公众号后台页面使用此功能');
      }

      // Send message to content script to execute publish
      const publishResult = await chrome.tabs.sendMessage(tab.id, {
        action: 'publish',
        markdown: markdown,
        title: title
      });

      if (publishResult.success) {
        showSuccess(publishResult.draftUrl);
        saveDraft({ markdown, title, timestamp: Date.now() });
      } else {
        showError(publishResult.error);
      }

    } catch (error) {
      console.error('Publish failed:', error);
      if (error.message && error.message.includes('Receiving end does not exist')) {
        showError('内容脚本未加载，请：\n1. 刷新微信公众号页面\n2. 确保已登录并访问后台\n3. 重新打开扩展弹窗');
      } else {
        showError(error.message || '发布失败，请确保已登录微信公众号');
      }
    }
  }

  // 显示进度
  function showProgress() {
    hideResult();
    elements.progressSection.style.display = 'block';
    elements.publishBtn.disabled = true;
    elements.publishFileBtn.disabled = true;

    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      if (progress >= 90) {
        clearInterval(interval);
      }
      elements.progressFill.style.width = progress + '%';
    }, 200);
  }

  // 显示成功结果
  function showSuccess(draftUrl) {
    elements.progressSection.style.display = 'none';
    elements.resultSection.style.display = 'block';
    elements.resultSuccess.style.display = 'block';
    elements.resultError.style.display = 'none';
    elements.draftLink.href = draftUrl;
    elements.progressFill.style.width = '100%';
  }

  // 显示错误结果
  function showError(message) {
    elements.progressSection.style.display = 'none';
    elements.resultSection.style.display = 'block';
    elements.resultSuccess.style.display = 'none';
    elements.resultError.style.display = 'block';
    elements.errorMessage.textContent = message;
    elements.publishBtn.disabled = false;
    elements.publishFileBtn.disabled = currentFile !== null;
  }

  // 隐藏结果
  function hideResult() {
    elements.progressSection.style.display = 'none';
    elements.resultSection.style.display = 'none';
    elements.progressFill.style.width = '0%';
  }

  // 重试
  function retry() {
    hideResult();
    updatePublishButton();
  }

  // Save draft to storage
  function saveDraft(draft) {
    chrome.storage.local.set({ lastDraft: draft });
  }

  // 加载上次的草稿
  async function loadDraft() {
    try {
      const { lastDraft } = await chrome.storage.local.get('lastDraft');
      if (lastDraft && lastDraft.markdown) {
        // Optional: Auto-fill last content
        // elements.markdownInput.value = lastDraft.markdown;
        // elements.articleTitle.value = lastDraft.title;
        // updateCharCount();
        // updatePublishButton();
      }
    } catch (error) {
      console.log('Load draft failed:', error);
    }
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
