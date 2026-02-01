/**
 * WeChat Markdown Publisher - Content Script
 * Injected into WeChat MP backend pages to publish articles via WeChat API
 */

(function() {
  'use strict';

  // WeChat default styles
  const WEIXIN_CSS = `
    p {
      color: rgb(51, 51, 51);
      font-size: 15px;
      line-height: 1.75em;
      margin: 0 0 1em 0;
    }
    h1, h2, h3, h4, h5, h6 {
      font-weight: bold;
    }
    h1 { font-size: 1.25em; line-height: 1.4em; margin: 1em 0 0.5em 0; }
    h2 { font-size: 1.125em; margin: 1em 0 0.5em 0; }
    h3 { font-size: 1.05em; margin: 0.8em 0 0.4em 0; }
    h4, h5, h6 { font-size: 1em; margin: 0.8em 0 0.4em 0; }
    li p { margin: 0; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
    li { margin-bottom: 0.4em; }
    pre, tt, code, kbd, samp { font-family: monospace; }
    pre {
      white-space: pre;
      margin: 1em 0;
      background: #f5f5f5;
      padding: 1em;
      border-radius: 6px;
      overflow-x: auto;
    }
    code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    pre code {
      background: none;
      padding: 0;
    }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 1em;
      margin: 1em 0;
      color: #666;
    }
    hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
    i, cite, em, var, address { font-style: italic; }
    b, strong { font-weight: bolder; }
    img { max-width: 100%; height: auto; margin: 1em 0; display: block; }
    a { color: #2563eb; text-decoration: underline; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
  `;

  class WeChatPublisher {
    constructor() {
      this.token = null;
      this.progressCallback = null;
    }

    /**
     * Get authentication token from page or Cookie
     */
    async getAuthToken() {
      if (this.token) return this.token;

      // Method 1: Extract token from page HTML
      const scriptText = document.documentElement.outerHTML;
      const tokenMatch = scriptText.match(/token\s*[:=]\s*["']([^"']+)["']/);
      if (tokenMatch) {
        this.token = tokenMatch[1];
        console.log('[WeChat Publisher] Token found from page');
        return this.token;
      }

      // Method 2: Extract from Cookie
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'token') {
          this.token = value;
          console.log('[WeChat Publisher] Token found from cookie');
          return this.token;
        }
      }

      throw new Error('Unable to get auth token, please ensure you are logged into WeChat MP');
    }

    /**
     * Convert Markdown to HTML
     */
    convertMarkdownToHTML(markdown) {
      if (typeof marked === 'undefined') {
        throw new Error('marked.js not loaded');
      }

      // Configure marked options
      marked.setOptions({
        breaks: true,      // Support GFM line breaks
        gfm: true,         // Enable GitHub Flavored Markdown
        headerIds: false,  // Disable auto header IDs
        mangle: false      // Disable email address obfuscation
      });

      // Parse Markdown using marked
      let rawHtml = marked.parse(markdown);
      console.log('[WeChat Publisher] Markdown converted to HTML');

      // Clean HTML: Fix list rendering issues for WeChat compatibility
      rawHtml = rawHtml
        // Remove <p> tags inside <li> (marked.js may wrap content in <p>)
        .replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi, '<li>$1</li>')
        // Remove empty <li></li>
        .replace(/<li>\s*<\/li>/g, '')
        // Remove <li> containing only <br>
        .replace(/<li>\s*<br\s*\/?>\s*<\/li>/g, '')
        // Remove <br> at start of <li>
        .replace(/<li>(\s*<br\s*\/?>\s*)+/g, '<li>')
        // Remove <br> before </li>
        .replace(/(\s*<br\s*\/?>\s*)+<\/li>/g, '</li>')
        // Remove newlines inside list items
        .replace(/<li>([\s\S]*?)<\/li>/gi, (_, content) => {
          return '<li>' + content.replace(/\n/g, ' ').trim() + '</li>';
        });

      // Convert external links to footnotes (WeChat rejects external links)
      rawHtml = this.convertLinksToFootnotes(rawHtml);

      return rawHtml;
    }

    /**
     * Convert external links to inline URL format
     * WeChat MP removes external <a> tags, so we show URLs inline
     */
    convertLinksToInlineUrls(html) {
      const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;

      const processedHtml = html.replace(linkRegex, (match, url, text) => {
        // Skip internal WeChat links and anchor links
        if (url.startsWith('#') || url.includes('mp.weixin.qq.com')) {
          return match;
        }

        // If text equals URL, just show the URL once
        if (text === url || text.includes(url)) {
          return `<span style="color: #0366d6;">${url}</span>`;
        }

        // Show text with URL in parentheses
        return `<span style="color: #0366d6;">${text}</span>（<span style="color: #666; font-size: 0.9em;">${url}</span>）`;
      });

      console.log('[WeChat Publisher] External links converted to inline URLs');
      return processedHtml;
    }

    /**
     * Convert external links to footnotes format
     * WeChat MP removes external links, so we convert them to footnote references
     */
    convertLinksToFootnotes(html) {
      const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
      const footnotes = [];
      let footnoteIndex = 1;

      // Replace links with footnote markers
      const processedHtml = html.replace(linkRegex, (match, url, text) => {
        // Skip internal WeChat links and anchor links
        if (url.startsWith('#') || url.includes('mp.weixin.qq.com')) {
          return match;
        }

        // Check if this URL already has a footnote
        let existingIndex = footnotes.findIndex(f => f.url === url);
        if (existingIndex === -1) {
          footnotes.push({ url, text });
          existingIndex = footnotes.length - 1;
        }

        const idx = existingIndex + 1;
        return `${text}<sup style="color: #0366d6; font-size: 0.8em;">[${idx}]</sup>`;
      });

      // If no footnotes, return original
      if (footnotes.length === 0) {
        return html;
      }

      // Build footnotes section
      const footnotesHtml = `
<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
<section style="font-size: 14px; color: #666; line-height: 1.8;">
<p style="font-weight: bold; margin-bottom: 10px;">参考链接：</p>
${footnotes.map((f, i) => `<p style="margin: 5px 0; word-break: break-all;"><sup>[${i + 1}]</sup> ${f.text}: ${f.url}</p>`).join('\n')}
</section>`;

      console.log(`[WeChat Publisher] Converted ${footnotes.length} links to footnotes`);
      return processedHtml + footnotesHtml;
    }

    /**
     * Inline CSS styles (simplified: no juice.js dependency)
     */
    inlineCSS(html) {
      // Create temporary container
      const container = document.createElement('div');
      container.innerHTML = html;

      // Apply styles to elements
      // Headings
      container.querySelectorAll('h1').forEach(el => {
        el.style.cssText = 'font-size: 2em; margin: 25px 0 15px; padding: 0; font-weight: bold; color: #2c3e50; line-height: 1.4; text-align: center;';
      });
      container.querySelectorAll('h2').forEach(el => {
        el.style.cssText = 'font-size: 1.6em; margin: 20px 0 12px; padding: 0; font-weight: bold; color: #34495e; line-height: 1.4;';
      });
      container.querySelectorAll('h3').forEach(el => {
        el.style.cssText = 'font-size: 1.3em; margin: 15px 0 10px; padding: 0; font-weight: bold; color: #34495e; line-height: 1.4;';
      });

      // Horizontal rules
      container.querySelectorAll('hr').forEach(el => {
        el.style.cssText = 'border: none; border-top: 2px solid #eee; margin: 30px 0; height: 0;';
      });

      // Paragraphs
      container.querySelectorAll('p').forEach(el => {
        el.style.cssText = 'margin: 10px 0; line-height: 1.75; color: #3f3f3f;';
      });

      // Code blocks
      container.querySelectorAll('pre').forEach(el => {
        el.style.cssText = 'background: #f6f8fa; padding: 15px; border-radius: 5px; overflow-x: auto; margin: 10px 0; line-height: 1.5;';
      });

      container.querySelectorAll('pre code').forEach(el => {
        el.style.cssText = 'font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; font-size: 14px; color: #24292e;';
      });

      // Inline code
      container.querySelectorAll('code').forEach(el => {
        if (el.parentElement.tagName !== 'PRE') {
          el.style.cssText = 'background: #f6f8fa; padding: 2px 5px; border-radius: 3px; font-family: "SFMono-Regular", Consolas, monospace; color: #e83e8c; font-size: 0.9em;';
        }
      });

      // Blockquotes
      container.querySelectorAll('blockquote').forEach(el => {
        el.style.cssText = 'border-left: 4px solid #dfe2e5; padding-left: 15px; margin: 10px 0; color: #6a737d; font-style: italic;';
      });

      // Tables
      container.querySelectorAll('table').forEach(el => {
        el.style.cssText = 'border-collapse: collapse; width: 100%; margin: 10px 0;';
      });

      container.querySelectorAll('th').forEach(el => {
        el.style.cssText = 'border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left; background: #f6f8fa; font-weight: bold;';
      });

      container.querySelectorAll('td').forEach(el => {
        el.style.cssText = 'border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left;';
      });

      // Links
      container.querySelectorAll('a').forEach(el => {
        el.style.cssText = 'color: #0366d6; text-decoration: none;';
      });

      // Images
      container.querySelectorAll('img').forEach(el => {
        el.style.cssText = 'max-width: 100%; height: auto; display: block; margin: 10px auto;';
      });

      // Lists - convert to sections with manual bullets (WeChat has issues with native lists)
      container.querySelectorAll('ul').forEach(ul => {
        const section = document.createElement('section');
        section.style.cssText = 'margin: 10px 0; padding-left: 0;';

        ul.querySelectorAll(':scope > li').forEach(li => {
          const p = document.createElement('p');
          p.style.cssText = 'margin: 5px 0; line-height: 1.75; color: #3f3f3f; padding-left: 1.5em; text-indent: -1.5em;';
          p.innerHTML = '• ' + li.innerHTML;
          section.appendChild(p);
        });

        ul.replaceWith(section);
      });

      container.querySelectorAll('ol').forEach(ol => {
        const section = document.createElement('section');
        section.style.cssText = 'margin: 10px 0; padding-left: 0;';

        ol.querySelectorAll(':scope > li').forEach((li, index) => {
          const p = document.createElement('p');
          p.style.cssText = 'margin: 5px 0; line-height: 1.75; color: #3f3f3f; padding-left: 1.5em; text-indent: -1.5em;';
          p.innerHTML = `${index + 1}. ` + li.innerHTML;
          section.appendChild(p);
        });

        ol.replaceWith(section);
      });

      // Emphasis and italic
      container.querySelectorAll('strong').forEach(el => {
        el.style.cssText = 'font-weight: bold; color: #2c3e50;';
      });

      container.querySelectorAll('em').forEach(el => {
        el.style.cssText = 'font-style: italic; color: #555;';
      });

      // Wrap in section
      const section = document.createElement('section');
      section.style.cssText = 'margin-left: 6px; margin-right: 6px; line-height: 1.75em; font-size: 16px; color: #3f3f3f; font-family: -apple-system-font, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif;';
      section.innerHTML = container.innerHTML;

      console.log('[WeChat Publisher] CSS styles inlined (simplified method)');
      return section.outerHTML;
    }

    /**
     * 处理图片 - 提取所有图片 (包括 data URLs 和外部 URLs)
     */
    extractImages(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const images = doc.querySelectorAll('img');

      const imageUrls = [];
      const dataUrls = [];

      images.forEach(img => {
        const src = img.getAttribute('src');
        if (!src || src.includes('mmbiz.qpic.cn')) {
          return;  // Skip already uploaded WeChat CDN images
        }

        if (src.startsWith('data:')) {
          dataUrls.push(src);
        } else {
          imageUrls.push(src);
        }
      });

      console.log(`[WeChat Publisher] Found ${imageUrls.length} external images, ${dataUrls.length} data URLs`);
      return { imageUrls, dataUrls };
    }

    /**
     * Convert data URL to Blob
     */
    dataUrlToBlob(dataUrl) {
      const [header, base64] = dataUrl.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      return new Blob([array], { type: mime });
    }

    /**
     * 上传单张图片到微信 CDN
     * @param {string} imageSource - URL or data URL
     */
    async uploadImage(imageSource) {
      const isDataUrl = imageSource.startsWith('data:');
      const displayName = isDataUrl ? 'data:image...' : imageSource.substring(0, 50);
      this.updateProgress(`上传图片: ${displayName}...`);

      try {
        let blob;

        if (isDataUrl) {
          // Convert data URL to blob
          blob = this.dataUrlToBlob(imageSource);
          console.log(`[WeChat Publisher] Converted data URL to blob: ${blob.size} bytes, type: ${blob.type}`);
        } else {
          // 下载图片
          const response = await fetch(imageSource);
          if (!response.ok) {
            throw new Error(`下载图片失败: ${response.status}`);
          }
          blob = await response.blob();
        }

        const ext = blob.type.split('/')[1] || 'jpg';
        const fileName = `${Date.now()}.${ext}`;

        // Construct FormData
        const formData = new FormData();
        formData.append('type', blob.type || 'image/jpeg');
        formData.append('id', Date.now().toString());
        formData.append('name', fileName);
        formData.append('lastModifiedDate', new Date().toString());
        formData.append('size', blob.size.toString());
        formData.append('file', blob, fileName);

        // 获取微信元数据
        const token = await this.getAuthToken();
        const uploadUrl = `https://mp.weixin.qq.com/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&ticket_id=&ticket=&svr_time=&token=${token}&lang=zh_CN&seq=${Date.now()}&t=${Math.random()}`;

        // 上传到微信
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        const result = await uploadResponse.json();

        if (result.base_resp?.err_msg !== 'ok' || !result.cdn_url) {
          throw new Error(`图片上传失败: ${result.base_resp?.err_msg || '未知错误'}`);
        }

        console.log(`[WeChat Publisher] Image uploaded: ${result.cdn_url}`);
        return result.cdn_url;

      } catch (error) {
        console.error(`[WeChat Publisher] Upload failed for ${imageUrl}:`, error);
        throw error;
      }
    }

    /**
     * 替换 HTML 中的图片 URL
     */
    async replaceImages(html) {
      const { imageUrls, dataUrls } = this.extractImages(html);
      const totalImages = imageUrls.length + dataUrls.length;

      if (totalImages === 0) {
        console.log('[WeChat Publisher] No images to upload');
        return html;
      }

      this.updateProgress(`开始上传 ${totalImages} 张图片...`);

      let processedHtml = html;
      let uploadedCount = 0;

      // Upload external URLs
      for (let i = 0; i < imageUrls.length; i++) {
        const originalUrl = imageUrls[i];
        uploadedCount++;
        this.updateProgress(`上传图片 ${uploadedCount}/${totalImages}`);

        try {
          const cdnUrl = await this.uploadImage(originalUrl);
          processedHtml = processedHtml.replace(originalUrl, cdnUrl);
        } catch (error) {
          console.warn(`[WeChat Publisher] Failed to upload external image ${i + 1}, keeping original URL`);
        }
      }

      // Upload data URLs (local images converted to base64)
      for (let i = 0; i < dataUrls.length; i++) {
        const dataUrl = dataUrls[i];
        uploadedCount++;
        this.updateProgress(`上传本地图片 ${uploadedCount}/${totalImages}`);

        try {
          const cdnUrl = await this.uploadImage(dataUrl);
          // Data URLs are long, need to escape for regex
          processedHtml = processedHtml.split(dataUrl).join(cdnUrl);
        } catch (error) {
          console.warn(`[WeChat Publisher] Failed to upload local image ${i + 1}:`, error.message);
        }
      }

      this.updateProgress(`图片上传完成 (${totalImages})`);
      return processedHtml;
    }

    /**
     * 发布文章到微信草稿箱
     */
    async publishArticle(title, content) {
      this.updateProgress('准备发布文章...');

      const token = await this.getAuthToken();

      const formData = new URLSearchParams({
        token,
        lang: 'zh_CN',
        f: 'json',
        ajax: '1',
        random: String(Math.random()),
        AppMsgId: '',
        count: '1',
        data_seq: '0',
        operate_from: 'Chrome',
        isnew: '0',
        ad_video_transition0: '',
        can_reward0: '0',
        related_video0: '',
        is_video_recommend0: '-1',
        title0: title,
        author0: '',
        writerid0: '0',
        fileid0: '',
        digest0: '',
        auto_gen_digest0: '1',
        content0: content,
        sourceurl0: '',
        need_open_comment0: '1',
        only_fans_can_comment0: '0',
        cdn_url0: '',
        cdn_235_1_url0: '',
        cdn_1_1_url0: '',
        cdn_url_back0: '',
        crop_list0: '',
        music_id0: '',
        video_id0: '',
        voteid0: '',
        voteismlt0: '',
        supervoteid0: '',
        cardid0: '',
        cardquantity0: '',
        cardlimit0: '',
        vid_type0: '',
        show_cover_pic0: '0',
        shortvideofileid0: '',
        copyright_type0: '0',
        releasefirst0: '',
        platform0: '',
        reprint_permit_type0: '',
        allow_reprint0: '',
        allow_reprint_modify0: '',
        original_article_type0: '',
        ori_white_list0: '',
        free_content0: '',
        fee0: '0',
        ad_id0: '',
        guide_words0: '',
        is_share_copyright0: '0',
        share_copyright_url0: '',
        source_article_type0: '',
        reprint_recommend_title0: '',
        reprint_recommend_content0: '',
        share_page_type0: '0',
        share_imageinfo0: '{"list":[]}',
        share_video_id0: '',
        dot0: '{}',
        share_voice_id0: '',
        insert_ad_mode0: '',
        categories_list0: '[]'
      });

      const publishUrl = `https://mp.weixin.qq.com/cgi-bin/operate_appmsg?t=ajax-response&sub=create&type=77&token=${token}&lang=zh_CN`;

      this.updateProgress('正在提交到微信...');

      const response = await fetch(publishUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData,
        credentials: 'include'
      });

      const result = await response.json();

      console.log('[WeChat Publisher] Publish response:', result);

      if (!result.appMsgId) {
        const errorMsg = this.formatError(result);
        throw new Error(errorMsg);
      }

      const draftUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&appmsgid=${result.appMsgId}&token=${token}&lang=zh_CN`;

      console.log('[WeChat Publisher] Article published successfully:', draftUrl);
      return draftUrl;
    }

    /**
     * 格式化错误信息
     */
    formatError(result) {
      const ret = result.ret ?? result.base_resp?.ret;

      const errorMap = {
        [-6]: '请输入验证码',
        [-8]: '请输入验证码',
        [-1]: '系统错误，请注意备份内容后重试',
        [-2]: '参数错误，请注意备份内容后重试',
        [-99]: '内容超出字数，请调整',
        [-206]: '服务负荷过大，请稍后重试',
        [200003]: '登录态超时，请重新登录',
        [64705]: '内容超出字数，请调整',
        [64702]: '标题超出64字长度限制'
      };

      return errorMap[ret] || `发布失败 (错误码: ${ret})`;
    }

    /**
     * Extract H1 title from markdown and remove it from content
     * Returns { title, content } where title is the H1 text (or null) and content is markdown without H1
     */
    extractH1Title(markdown) {
      // Match H1 at the beginning of markdown (with optional leading whitespace/newlines)
      const h1Regex = /^\s*#\s+(.+?)(?:\r?\n|$)/;
      const match = markdown.match(h1Regex);

      if (match) {
        const title = match[1].trim();
        const content = markdown.replace(h1Regex, '').trim();
        console.log(`[WeChat Publisher] Extracted H1 title: "${title}"`);
        return { title, content };
      }

      return { title: null, content: markdown };
    }

    /**
     * 完整发布流程
     */
    async publish(markdown, title = '未命名') {
      try {
        console.log('[WeChat Publisher] Starting publish process...');

        // 0. Extract H1 as title if present
        const extracted = this.extractH1Title(markdown);
        if (extracted.title) {
          title = extracted.title;
          markdown = extracted.content;
          console.log(`[WeChat Publisher] Using H1 as title: "${title}"`);
        }

        // 1. Convert Markdown to HTML
        this.updateProgress('转换 Markdown...');
        let html = this.convertMarkdownToHTML(markdown);

        // 2. Inline CSS styles
        this.updateProgress('处理样式...');
        html = this.inlineCSS(html);

        // 3. Upload images
        html = await this.replaceImages(html);

        // 4. Publish article
        const draftUrl = await this.publishArticle(title, html);

        this.updateProgress('发布成功！');
        return {
          success: true,
          draftUrl
        };

      } catch (error) {
        console.error('[WeChat Publisher] Publish failed:', error);
        this.updateProgress('发布失败: ' + error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }

    /**
     * 更新进度
     */
    updateProgress(message) {
      console.log(`[WeChat Publisher] ${message}`);
      if (this.progressCallback) {
        this.progressCallback(message);
      }
    }

    /**
     * 设置进度回调
     */
    onProgress(callback) {
      this.progressCallback = callback;
    }
  }

  // Expose to global scope for popup access
  window.WeChatPublisher = WeChatPublisher;

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'publish') {
      const publisher = new WeChatPublisher();

      // 设置进度回调
      publisher.onProgress((msg) => {
        console.log('[Progress]', msg);
      });

      // 执行发布（异步）
      publisher.publish(request.markdown, request.title)
        .then(result => {
          sendResponse(result);
        })
        .catch(error => {
          sendResponse({
            success: false,
            error: error.message
          });
        });

      // Return true for async response
      return true;
    }

    if (request.action === 'checkStatus') {
      // Check if token exists
      const scriptText = document.documentElement.outerHTML;
      const hasToken = /token\s*[:=]\s*["']([^"']+)["']/.test(scriptText);
      sendResponse({ hasToken });
      return true;
    }
  });

  console.log('[WeChat Publisher] Content script loaded');

})();
