/**
 * WeChat Markdown Publisher - Content Script
 * 在微信公众号后台页面注入，直接调用微信 API 发布文章
 */

(function() {
  'use strict';

  // 微信默认样式
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
     * 从页面或 Cookie 获取认证 token
     */
    async getAuthToken() {
      if (this.token) return this.token;

      // 方法 1: 从页面 HTML 中提取 token
      const scriptText = document.documentElement.outerHTML;
      const tokenMatch = scriptText.match(/token\s*[:=]\s*["']([^"']+)["']/);
      if (tokenMatch) {
        this.token = tokenMatch[1];
        console.log('[WeChat Publisher] Token found from page');
        return this.token;
      }

      // 方法 2: 从 Cookie 中提取
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'token') {
          this.token = value;
          console.log('[WeChat Publisher] Token found from cookie');
          return this.token;
        }
      }

      throw new Error('无法获取认证 token，请确认已登录微信公众号');
    }

    /**
     * Markdown 转 HTML
     */
    convertMarkdownToHTML(markdown) {
      if (typeof marked === 'undefined') {
        throw new Error('marked.js 未加载');
      }

      // 使用 marked 解析 Markdown
      const rawHtml = marked.parse(markdown);
      console.log('[WeChat Publisher] Markdown converted to HTML');

      return rawHtml;
    }

    /**
     * 内联 CSS 样式（简化版：不依赖 juice.js）
     */
    inlineCSS(html) {
      // 创建临时容器
      const container = document.createElement('div');
      container.innerHTML = html;

      // 应用样式到各类元素
      // 标题
      container.querySelectorAll('h1').forEach(el => {
        el.style.cssText = 'font-size: 1.8em; margin: 20px 0 10px; padding: 0; font-weight: bold; color: #333;';
      });
      container.querySelectorAll('h2').forEach(el => {
        el.style.cssText = 'font-size: 1.5em; margin: 20px 0 10px; padding: 0; font-weight: bold; color: #333;';
      });
      container.querySelectorAll('h3').forEach(el => {
        el.style.cssText = 'font-size: 1.3em; margin: 15px 0 10px; padding: 0; font-weight: bold; color: #333;';
      });

      // 段落
      container.querySelectorAll('p').forEach(el => {
        el.style.cssText = 'margin: 10px 0; line-height: 1.75; color: #3f3f3f;';
      });

      // 代码块
      container.querySelectorAll('pre').forEach(el => {
        el.style.cssText = 'background: #f6f8fa; padding: 15px; border-radius: 5px; overflow-x: auto; margin: 10px 0; line-height: 1.5;';
      });

      container.querySelectorAll('pre code').forEach(el => {
        el.style.cssText = 'font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; font-size: 14px; color: #24292e;';
      });

      // 行内代码
      container.querySelectorAll('code').forEach(el => {
        if (el.parentElement.tagName !== 'PRE') {
          el.style.cssText = 'background: #f6f8fa; padding: 2px 5px; border-radius: 3px; font-family: "SFMono-Regular", Consolas, monospace; color: #e83e8c; font-size: 0.9em;';
        }
      });

      // 引用
      container.querySelectorAll('blockquote').forEach(el => {
        el.style.cssText = 'border-left: 4px solid #dfe2e5; padding-left: 15px; margin: 10px 0; color: #6a737d; font-style: italic;';
      });

      // 表格
      container.querySelectorAll('table').forEach(el => {
        el.style.cssText = 'border-collapse: collapse; width: 100%; margin: 10px 0;';
      });

      container.querySelectorAll('th').forEach(el => {
        el.style.cssText = 'border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left; background: #f6f8fa; font-weight: bold;';
      });

      container.querySelectorAll('td').forEach(el => {
        el.style.cssText = 'border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left;';
      });

      // 链接
      container.querySelectorAll('a').forEach(el => {
        el.style.cssText = 'color: #0366d6; text-decoration: none;';
      });

      // 图片
      container.querySelectorAll('img').forEach(el => {
        el.style.cssText = 'max-width: 100%; height: auto; display: block; margin: 10px auto;';
      });

      // 列表
      container.querySelectorAll('ul, ol').forEach(el => {
        el.style.cssText = 'margin: 10px 0; padding-left: 20px;';
      });

      container.querySelectorAll('li').forEach(el => {
        el.style.cssText = 'margin: 5px 0; line-height: 1.75;';
      });

      // 包装在 section 中
      const section = document.createElement('section');
      section.style.cssText = 'margin-left: 6px; margin-right: 6px; line-height: 1.75em; font-size: 16px; color: #3f3f3f; font-family: -apple-system-font, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif;';
      section.innerHTML = container.innerHTML;

      console.log('[WeChat Publisher] CSS styles inlined (simplified method)');
      return section.outerHTML;
    }

    /**
     * 处理图片 - 提取所有图片 URL
     */
    extractImages(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const images = doc.querySelectorAll('img');

      const imageUrls = [];
      images.forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.includes('mmbiz.qpic.cn')) {
          imageUrls.push(src);
        }
      });

      console.log(`[WeChat Publisher] Found ${imageUrls.length} external images`);
      return imageUrls;
    }

    /**
     * 上传单张图片到微信 CDN
     */
    async uploadImage(imageUrl) {
      this.updateProgress(`上传图片: ${imageUrl.substring(0, 50)}...`);

      try {
        // 下载图片
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`下载图片失败: ${response.status}`);
        }

        const blob = await response.blob();
        const fileName = `${Date.now()}.jpg`;

        // 构造 FormData
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
      const imageUrls = this.extractImages(html);

      if (imageUrls.length === 0) {
        console.log('[WeChat Publisher] No external images to upload');
        return html;
      }

      this.updateProgress(`开始上传 ${imageUrls.length} 张图片...`);

      let processedHtml = html;

      for (let i = 0; i < imageUrls.length; i++) {
        const originalUrl = imageUrls[i];
        this.updateProgress(`上传图片 ${i + 1}/${imageUrls.length}`);

        try {
          const cdnUrl = await this.uploadImage(originalUrl);
          processedHtml = processedHtml.replace(originalUrl, cdnUrl);
        } catch (error) {
          console.warn(`[WeChat Publisher] Failed to upload image ${i + 1}, keeping original URL`);
          // 继续处理其他图片
        }
      }

      this.updateProgress(`图片上传完成 (${imageUrls.length})`);
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
     * 完整发布流程
     */
    async publish(markdown, title = '未命名') {
      try {
        console.log('[WeChat Publisher] Starting publish process...');

        // 1. 转换 Markdown 到 HTML
        this.updateProgress('转换 Markdown...');
        let html = this.convertMarkdownToHTML(markdown);

        // 2. 内联 CSS 样式
        this.updateProgress('处理样式...');
        html = this.inlineCSS(html);

        // 3. 上传图片
        html = await this.replaceImages(html);

        // 4. 发布文章
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

  // 暴露到全局作用域，供 popup 调用
  window.WeChatPublisher = WeChatPublisher;

  // 监听来自 popup 的消息
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

      // 返回 true 表示异步响应
      return true;
    }

    if (request.action === 'checkStatus') {
      // 检查是否有 token
      const scriptText = document.documentElement.outerHTML;
      const hasToken = /token\s*[:=]\s*["']([^"']+)["']/.test(scriptText);
      sendResponse({ hasToken });
      return true;
    }
  });

  console.log('[WeChat Publisher] Content script loaded');

})();
