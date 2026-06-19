import web_webview from '@ohos.web.webview';

const NGF_RICH_CONTENT_MARKDOWN_MAX_CHARS: number = 140000;
const NGF_RICH_CONTENT_MARKDOWN_MAX_LINES: number = 1800;
const NGF_RICH_CONTENT_HTML_MAX_CHARS: number = 120000;
const NGF_RICH_CONTENT_HTML_MAX_LINES: number = 1200;
const NGF_RICH_CONTENT_PLAIN_MAX_CHARS: number = 160000;
const NGF_RICH_CONTENT_PLAIN_MAX_LINES: number = 2200;
const NGF_RICH_CONTENT_DIFF_MAX_CHARS: number = 180000;
const NGF_RICH_CONTENT_DIFF_MAX_LINES: number = 1800;
const NGF_RICH_CONTENT_MAX_LINE_CHARS: number = 1400;

export class NGFRichContentKind {
  static readonly MARKDOWN: string = 'markdown';
  static readonly HTML: string = 'html';
  static readonly PLAIN: string = 'plain';
  static readonly DIFF: string = 'diff';
  static readonly SVG: string = 'svg';
  static readonly IMAGE: string = 'image';
}

@Component
export struct NGFRichContentRenderer {
  @Prop content: string = '';
  @Prop contentKind: string = 'markdown';
  @Prop mediaType: string = '';
  @Prop isDarkMode: boolean = false;
  @Prop previewSurfaceDark: boolean = false;
  @Prop bottomPadding: number = 16;
  private controller: web_webview.WebviewController = new web_webview.WebviewController();

  build() {
    Web({ src: this.documentDataUrl(), controller: this.controller })
      .width('100%')
      .height('100%')
      .javaScriptAccess(false)
      .domStorageAccess(false)
      .backgroundColor(Color.Transparent)
  }

  private documentDataUrl(): string {
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(this.buildDocumentHtml());
  }

  private buildDocumentHtml(): string {
    if (
      this.contentKind === NGFRichContentKind.HTML &&
        this.content.length <= this.maxRenderChars() &&
        !this.normalizedTextHasMoreLinesThan(this.content, this.maxRenderLines()) &&
        this.isFullHtmlDocument(this.content)
    ) {
      return this.sanitizeHtml(this.content);
    }
    if (this.contentKind === NGFRichContentKind.SVG || this.contentKind === NGFRichContentKind.IMAGE) {
      return '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
        '<style>' + this.buildDocumentStyle() + '</style></head><body>' +
        '<main class="ngf-rich">' + this.renderContentHtml(this.content) + '</main></body></html>';
    }
    const source = this.boundedContent();
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
      '<style>' + this.buildDocumentStyle() + '</style></head><body>' +
      '<main class="ngf-rich">' + this.renderContentHtml(source) + '</main></body></html>';
  }

  private buildDocumentStyle(): string {
    const textColor = this.isDarkMode ? '#F7FFFFFF' : '#111827';
    const secondaryColor = this.isDarkMode ? '#B8FFFFFF' : '#5F6B7A';
    const mutedColor = this.isDarkMode ? '#80FFFFFF' : '#96A2B2';
    const surfaceColor = this.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.74)';
    const strongSurfaceColor = this.isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(244,247,251,0.92)';
    const borderColor = this.isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(148,163,184,0.28)';
    const codeTextColor = this.isDarkMode ? '#D7F1FF' : '#334155';
    const addBg = this.isDarkMode ? 'rgba(52,199,89,0.16)' : 'rgba(52,199,89,0.13)';
    const addText = this.isDarkMode ? '#BDF6CB' : '#116B31';
    const delBg = this.isDarkMode ? 'rgba(255,59,48,0.16)' : 'rgba(255,59,48,0.12)';
    const delText = this.isDarkMode ? '#FFC6C2' : '#9B1C1C';
    const hunkBg = this.isDarkMode ? 'rgba(10,132,255,0.18)' : 'rgba(10,132,255,0.12)';
    const hunkText = this.isDarkMode ? '#BFDFFF' : '#1D4ED8';
    const bodyBg = this.isDarkMode ? 'rgba(12,18,28,0)' : 'rgba(255,255,255,0)';
    const mediaStageBg = this.previewSurfaceDark ? '#101826' : '#F8FAFC';
    const mediaStageText = this.previewSurfaceDark ? '#F8FAFC' : '#111827';
    const mediaChecker = this.previewSurfaceDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    return 'html,body{margin:0;padding:0;background:' + bodyBg + ';color:' + textColor +
      ';font-family:HarmonyOS Sans,Arial,sans-serif;font-size:15px;line-height:1.68;}' +
      'body{-webkit-text-size-adjust:100%;overflow-x:hidden;}' +
      '.ngf-rich{box-sizing:border-box;width:100%;min-height:100%;padding:4px 0 ' + this.bottomPadding.toString() + 'px 0;}' +
      'h1,h2,h3,h4,h5,h6{margin:18px 0 8px;color:' + textColor + ';font-weight:700;line-height:1.28;}' +
      'h1{font-size:26px;}h2{font-size:22px;}h3{font-size:19px;}h4{font-size:17px;}h5,h6{font-size:15px;}' +
      'p{margin:9px 0;color:' + textColor + ';}' +
      'a{color:#0A84FF;text-decoration:none;border-bottom:1px solid rgba(10,132,255,0.28);}' +
      'strong{font-weight:700;}em{font-style:italic;}' +
      'ul,ol{margin:8px 0 12px 0;padding-left:24px;}li{margin:5px 0;padding-left:2px;}' +
      'blockquote{margin:12px 0;padding:8px 12px;border-left:4px solid #0A84FF;border-radius:8px;background:' + surfaceColor + ';color:' + secondaryColor + ';}' +
      'hr{border:0;border-top:1px solid ' + borderColor + ';margin:18px 0;}' +
      'pre{box-sizing:border-box;width:100%;overflow:auto;margin:12px 0;padding:12px;border-radius:12px;background:' + strongSurfaceColor +
      ';border:1px solid ' + borderColor + ';color:' + codeTextColor + ';font-family:HarmonyOS Sans Mono,Consolas,monospace;font-size:13px;line-height:1.58;}' +
      'code{font-family:HarmonyOS Sans Mono,Consolas,monospace;}' +
      'p code,li code,td code{padding:2px 5px;border-radius:6px;background:' + strongSurfaceColor + ';color:' + codeTextColor + ';font-size:0.92em;}' +
      'table{width:100%;border-collapse:separate;border-spacing:0;margin:12px 0;overflow:hidden;border:1px solid ' + borderColor + ';border-radius:12px;}' +
      'th,td{padding:9px 10px;border-right:1px solid ' + borderColor + ';border-bottom:1px solid ' + borderColor + ';vertical-align:top;}' +
      'th{background:' + strongSurfaceColor + ';font-weight:700;text-align:left;}tr:last-child td{border-bottom:0;}th:last-child,td:last-child{border-right:0;}' +
      'img{max-width:100%;height:auto;border-radius:12px;margin:10px 0;}' +
      '.plain{white-space:pre-wrap;word-break:break-word;}' +
      '.diff{box-sizing:border-box;width:100%;overflow:auto;border:1px solid ' + borderColor + ';border-radius:14px;background:' + strongSurfaceColor + ';font-family:HarmonyOS Sans Mono,Consolas,monospace;font-size:13px;line-height:1.62;}' +
      '.diff-line{display:flex;min-width:max-content;border-bottom:1px solid rgba(148,163,184,0.10);}' +
      '.diff-no{box-sizing:border-box;width:44px;flex:none;padding:2px 8px;text-align:right;color:' + mutedColor + ';user-select:none;}' +
      '.diff-code{box-sizing:border-box;white-space:pre;padding:2px 12px 2px 4px;color:' + codeTextColor + ';}' +
      '.diff-add{background:' + addBg + ';}.diff-add .diff-code{color:' + addText + ';}' +
      '.diff-del{background:' + delBg + ';}.diff-del .diff-code{color:' + delText + ';}' +
      '.diff-hunk{background:' + hunkBg + ';}.diff-hunk .diff-code{color:' + hunkText + ';font-weight:700;}' +
      '.diff-meta .diff-code{color:' + secondaryColor + ';}' +
      '.diff-empty{padding:18px;color:' + secondaryColor + ';}' +
      '.media-stage{box-sizing:border-box;width:100%;min-height:260px;display:flex;align-items:center;justify-content:center;padding:20px;border:1px solid ' + borderColor +
      ';border-radius:16px;background-color:' + mediaStageBg + ';background-image:linear-gradient(45deg,' + mediaChecker + ' 25%,transparent 25%),linear-gradient(-45deg,' + mediaChecker +
      ' 25%,transparent 25%),linear-gradient(45deg,transparent 75%,' + mediaChecker + ' 75%),linear-gradient(-45deg,transparent 75%,' + mediaChecker +
      ' 75%);background-size:22px 22px;background-position:0 0,0 11px,11px -11px,-11px 0;color:' + mediaStageText + ';}' +
      '.media-stage svg{max-width:100%;max-height:62vh;color:' + mediaStageText + ';}' +
      '.media-image{display:block;max-width:100%;max-height:62vh;width:auto;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,0.20);}';
  }

  private renderContentHtml(source: string): string {
    if (this.contentKind === NGFRichContentKind.SVG) {
      return this.renderSvgPreviewHtml(source);
    }
    if (this.contentKind === NGFRichContentKind.IMAGE) {
      return this.renderImagePreviewHtml(source);
    }
    if (this.contentKind === NGFRichContentKind.HTML) {
      if (this.shouldRenderHtmlAsPlainPreview()) {
        return '<pre class="plain">' + this.escapeHtml(source) + '</pre>';
      }
      return this.sanitizeHtml(source);
    }
    if (this.contentKind === NGFRichContentKind.PLAIN) {
      return '<pre class="plain">' + this.escapeHtml(source) + '</pre>';
    }
    if (this.contentKind === NGFRichContentKind.DIFF) {
      return this.renderDiffHtml(source);
    }
    return this.renderMarkdownHtml(source);
  }

  private renderSvgPreviewHtml(source: string): string {
    if (source.length === 0) {
      return '<section class="media-stage"></section>';
    }
    return '<section class="media-stage">' + this.sanitizeSvg(source) + '</section>';
  }

  private renderImagePreviewHtml(source: string): string {
    if (!this.isSafeImageDataUrl(source)) {
      return '<section class="media-stage"><pre class="plain">' + this.escapeHtml(source) + '</pre></section>';
    }
    return '<section class="media-stage"><img class="media-image" src="' + this.escapeHtmlAttribute(source) + '" alt=""></section>';
  }

  private sanitizeSvg(svg: string): string {
    let result = this.sanitizeHtml(svg);
    result = this.removeHtmlBlock(result, 'foreignobject');
    return result;
  }

  private isSafeImageDataUrl(source: string): boolean {
    const normalized = source.trim().toLowerCase();
    return normalized.startsWith('data:image/png;base64,') ||
      normalized.startsWith('data:image/jpeg;base64,') ||
      normalized.startsWith('data:image/jpg;base64,') ||
      normalized.startsWith('data:image/webp;base64,') ||
      normalized.startsWith('data:image/gif;base64,') ||
      normalized.startsWith('data:image/bmp;base64,') ||
      normalized.startsWith('data:image/x-icon;base64,') ||
      normalized.startsWith('data:image/avif;base64,') ||
      normalized.startsWith('data:image/apng;base64,') ||
      normalized.startsWith('data:image/heic;base64,') ||
      normalized.startsWith('data:image/heif;base64,') ||
      normalized.startsWith('data:image/tiff;base64,');
  }

  private shouldRenderHtmlAsPlainPreview(): boolean {
    if (this.contentKind !== NGFRichContentKind.HTML) {
      return false;
    }
    if (this.content.length > this.maxRenderChars()) {
      return true;
    }
    return this.normalizedTextHasMoreLinesThan(this.content, this.maxRenderLines());
  }

  private boundedContent(): string {
    let source = this.content;
    let limited = false;
    const maxChars = this.maxRenderChars();
    if (source.length > maxChars) {
      source = source.substring(0, maxChars);
      limited = true;
    }
    source = source.split('\r\n').join('\n').split('\r').join('\n');
    const lineLimitedSource = this.limitNormalizedLines(source, this.maxRenderLines());
    if (lineLimitedSource.length < source.length) {
      limited = true;
    }
    if (limited) {
      return lineLimitedSource + '\n\n[Preview truncated]';
    }
    return lineLimitedSource;
  }

  private maxRenderChars(): number {
    if (this.contentKind === NGFRichContentKind.DIFF) {
      return NGF_RICH_CONTENT_DIFF_MAX_CHARS;
    }
    if (this.contentKind === NGFRichContentKind.PLAIN) {
      return NGF_RICH_CONTENT_PLAIN_MAX_CHARS;
    }
    if (this.contentKind === NGFRichContentKind.HTML) {
      return NGF_RICH_CONTENT_HTML_MAX_CHARS;
    }
    return NGF_RICH_CONTENT_MARKDOWN_MAX_CHARS;
  }

  private maxRenderLines(): number {
    if (this.contentKind === NGFRichContentKind.DIFF) {
      return NGF_RICH_CONTENT_DIFF_MAX_LINES;
    }
    if (this.contentKind === NGFRichContentKind.PLAIN) {
      return NGF_RICH_CONTENT_PLAIN_MAX_LINES;
    }
    if (this.contentKind === NGFRichContentKind.HTML) {
      return NGF_RICH_CONTENT_HTML_MAX_LINES;
    }
    return NGF_RICH_CONTENT_MARKDOWN_MAX_LINES;
  }

  private limitNormalizedLines(source: string, maxLines: number): string {
    if (source.length === 0) {
      return source;
    }
    let result = '';
    let lineStart = 0;
    let lineCount = 0;
    while (lineStart <= source.length && lineCount < maxLines) {
      const nextLineStart = source.indexOf('\n', lineStart);
      let line = '';
      if (nextLineStart < 0) {
        line = source.substring(lineStart);
        lineStart = source.length + 1;
      } else {
        line = source.substring(lineStart, nextLineStart);
        lineStart = nextLineStart + 1;
      }
      if (line.length > NGF_RICH_CONTENT_MAX_LINE_CHARS) {
        line = line.substring(0, NGF_RICH_CONTENT_MAX_LINE_CHARS) + '...';
      }
      if (lineCount > 0) {
        result = result + '\n';
      }
      result = result + line;
      lineCount = lineCount + 1;
    }
    return result;
  }

  private normalizedTextHasMoreLinesThan(source: string, maxLines: number): boolean {
    if (source.length === 0) {
      return false;
    }
    const normalized = source.split('\r\n').join('\n').split('\r').join('\n');
    let lineCount = 1;
    for (let index = 0; index < normalized.length; index++) {
      if (normalized.charAt(index) === '\n') {
        lineCount = lineCount + 1;
        if (lineCount > maxLines) {
          return true;
        }
      }
    }
    return false;
  }

  private sanitizeHtml(html: string): string {
    let result = html;
    result = this.removeHtmlBlock(result, 'script');
    result = this.removeHtmlBlock(result, 'iframe');
    result = this.removeHtmlBlock(result, 'object');
    result = this.removeHtmlBlock(result, 'embed');
    return result;
  }

  private isFullHtmlDocument(html: string): boolean {
    const trimmed = html.trim().toLowerCase();
    return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
  }

  private removeHtmlBlock(html: string, tagName: string): string {
    let result = html;
    let searchStart = 0;
    const openNeedle = '<' + tagName;
    const closeNeedle = '</' + tagName + '>';
    while (searchStart < result.length) {
      const lower = result.toLowerCase();
      const openStart = lower.indexOf(openNeedle, searchStart);
      if (openStart < 0) {
        break;
      }
      const openEnd = result.indexOf('>', openStart);
      if (openEnd < 0) {
        break;
      }
      const closeStart = lower.indexOf(closeNeedle, openEnd + 1);
      if (closeStart < 0) {
        result = result.substring(0, openStart) + result.substring(openEnd + 1);
        searchStart = openStart;
      } else {
        result = result.substring(0, openStart) + result.substring(closeStart + closeNeedle.length);
        searchStart = openStart;
      }
    }
    return result;
  }

  private renderMarkdownHtml(markdown: string): string {
    const normalized = markdown.split('\r\n').join('\n').split('\r').join('\n');
    const lines = normalized.split('\n');
    const paragraphLines: Array<string> = [];
    const codeLines: Array<string> = [];
    const listItems: Array<string> = [];
    const tableLines: Array<string> = [];
    let html = '';
    let listKind = '';
    let inCodeBlock = false;
    let codeLanguage = '';
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      if (inCodeBlock) {
        if (this.isFenceLine(trimmed)) {
          html = html + this.flushCodeHtml(codeLines, codeLanguage);
          codeLines.length = 0;
          codeLanguage = '';
          inCodeBlock = false;
        } else {
          codeLines.push(line);
        }
        index = index + 1;
        continue;
      }
      if (this.isFenceLine(trimmed)) {
        html = html + this.flushParagraphHtml(paragraphLines) + this.flushListHtml(listItems, listKind) + this.flushTableHtml(tableLines);
        paragraphLines.length = 0;
        listItems.length = 0;
        tableLines.length = 0;
        listKind = '';
        inCodeBlock = true;
        codeLanguage = trimmed.length > 3 ? trimmed.substring(3).trim() : '';
        index = index + 1;
        continue;
      }
      if (trimmed.length === 0) {
        html = html + this.flushParagraphHtml(paragraphLines) + this.flushListHtml(listItems, listKind) + this.flushTableHtml(tableLines);
        paragraphLines.length = 0;
        listItems.length = 0;
        tableLines.length = 0;
        listKind = '';
        index = index + 1;
        continue;
      }
      if (this.isMarkdownTableLine(trimmed) && index + 1 < lines.length && this.isMarkdownTableSeparator(lines[index + 1].trim())) {
        html = html + this.flushParagraphHtml(paragraphLines) + this.flushListHtml(listItems, listKind);
        paragraphLines.length = 0;
        listItems.length = 0;
        listKind = '';
        tableLines.push(trimmed);
        tableLines.push(lines[index + 1].trim());
        index = index + 2;
        while (index < lines.length && this.isMarkdownTableLine(lines[index].trim())) {
          tableLines.push(lines[index].trim());
          index = index + 1;
        }
        html = html + this.flushTableHtml(tableLines);
        tableLines.length = 0;
        continue;
      }
      const headingLevel = this.markdownHeadingLevel(trimmed);
      if (headingLevel > 0) {
        html = html + this.flushParagraphHtml(paragraphLines) + this.flushListHtml(listItems, listKind) + this.flushTableHtml(tableLines);
        paragraphLines.length = 0;
        listItems.length = 0;
        tableLines.length = 0;
        listKind = '';
        html = html + '<h' + headingLevel.toString() + '>' + this.renderInlineMarkdown(trimmed.substring(headingLevel + 1).trim()) + '</h' + headingLevel.toString() + '>';
        index = index + 1;
        continue;
      }
      if (this.isHorizontalRule(trimmed)) {
        html = html + this.flushParagraphHtml(paragraphLines) + this.flushListHtml(listItems, listKind);
        paragraphLines.length = 0;
        listItems.length = 0;
        listKind = '';
        html = html + '<hr>';
        index = index + 1;
        continue;
      }
      const unorderedText = this.unorderedListText(trimmed);
      if (unorderedText.length > 0) {
        html = html + this.flushParagraphHtml(paragraphLines);
        paragraphLines.length = 0;
        if (listKind.length > 0 && listKind !== 'ul') {
          html = html + this.flushListHtml(listItems, listKind);
          listItems.length = 0;
        }
        listKind = 'ul';
        listItems.push(unorderedText);
        index = index + 1;
        continue;
      }
      const orderedText = this.orderedListText(trimmed);
      if (orderedText.length > 0) {
        html = html + this.flushParagraphHtml(paragraphLines);
        paragraphLines.length = 0;
        if (listKind.length > 0 && listKind !== 'ol') {
          html = html + this.flushListHtml(listItems, listKind);
          listItems.length = 0;
        }
        listKind = 'ol';
        listItems.push(orderedText);
        index = index + 1;
        continue;
      }
      const quoteText = this.quoteText(trimmed);
      if (quoteText.length > 0) {
        html = html + this.flushParagraphHtml(paragraphLines) + this.flushListHtml(listItems, listKind);
        paragraphLines.length = 0;
        listItems.length = 0;
        listKind = '';
        html = html + '<blockquote>' + this.renderInlineMarkdown(quoteText) + '</blockquote>';
        index = index + 1;
        continue;
      }
      html = html + this.flushListHtml(listItems, listKind);
      listItems.length = 0;
      listKind = '';
      paragraphLines.push(trimmed);
      index = index + 1;
    }
    if (inCodeBlock) {
      html = html + this.flushCodeHtml(codeLines, codeLanguage);
    }
    html = html + this.flushParagraphHtml(paragraphLines) + this.flushListHtml(listItems, listKind) + this.flushTableHtml(tableLines);
    if (html.length === 0) {
      return '<p></p>';
    }
    return html;
  }

  private flushParagraphHtml(lines: Array<string>): string {
    if (lines.length === 0) {
      return '';
    }
    return '<p>' + this.renderInlineMarkdown(lines.join(' ')) + '</p>';
  }

  private flushCodeHtml(lines: Array<string>, language: string): string {
    const languageHtml = language.length > 0 ? '<div class="code-lang">' + this.escapeHtml(language) + '</div>' : '';
    return languageHtml + '<pre><code>' + this.escapeHtml(lines.join('\n')) + '</code></pre>';
  }

  private flushListHtml(items: Array<string>, listKind: string): string {
    if (items.length === 0 || listKind.length === 0) {
      return '';
    }
    let html = '<' + listKind + '>';
    for (let index = 0; index < items.length; index++) {
      html = html + '<li>' + this.renderInlineMarkdown(items[index]) + '</li>';
    }
    return html + '</' + listKind + '>';
  }

  private flushTableHtml(lines: Array<string>): string {
    if (lines.length < 2) {
      return '';
    }
    const headers = this.splitTableCells(lines[0]);
    let html = '<table><thead><tr>';
    for (let index = 0; index < headers.length; index++) {
      html = html + '<th>' + this.renderInlineMarkdown(headers[index]) + '</th>';
    }
    html = html + '</tr></thead><tbody>';
    for (let rowIndex = 2; rowIndex < lines.length; rowIndex++) {
      const cells = this.splitTableCells(lines[rowIndex]);
      html = html + '<tr>';
      for (let cellIndex = 0; cellIndex < headers.length; cellIndex++) {
        html = html + '<td>' + this.renderInlineMarkdown(cellIndex < cells.length ? cells[cellIndex] : '') + '</td>';
      }
      html = html + '</tr>';
    }
    return html + '</tbody></table>';
  }

  private renderInlineMarkdown(text: string): string {
    let html = '';
    let index = 0;
    while (index < text.length) {
      const char = text.charAt(index);
      if (char === '`') {
        const closing = text.indexOf('`', index + 1);
        if (closing > index + 1) {
          html = html + '<code>' + this.escapeHtml(text.substring(index + 1, closing)) + '</code>';
          index = closing + 1;
          continue;
        }
      }
      if (index + 1 < text.length && text.substring(index, index + 2) === '**') {
        const closing = text.indexOf('**', index + 2);
        if (closing > index + 2) {
          html = html + '<strong>' + this.renderInlineMarkdown(text.substring(index + 2, closing)) + '</strong>';
          index = closing + 2;
          continue;
        }
      }
      if (char === '*') {
        const closing = text.indexOf('*', index + 1);
        if (closing > index + 1) {
          html = html + '<em>' + this.renderInlineMarkdown(text.substring(index + 1, closing)) + '</em>';
          index = closing + 1;
          continue;
        }
      }
      if (char === '!' && index + 1 < text.length && text.charAt(index + 1) === '[') {
        const labelClose = text.indexOf('](', index + 2);
        if (labelClose > index + 2) {
          const targetClose = text.indexOf(')', labelClose + 2);
          if (targetClose > labelClose + 2) {
            const label = text.substring(index + 2, labelClose);
            const target = text.substring(labelClose + 2, targetClose);
            html = html + '<img src="' + this.escapeHtmlAttribute(target) + '" alt="' + this.escapeHtmlAttribute(label) + '">';
            index = targetClose + 1;
            continue;
          }
        }
      }
      if (char === '[') {
        const labelClose = text.indexOf('](', index + 1);
        if (labelClose > index + 1) {
          const targetClose = text.indexOf(')', labelClose + 2);
          if (targetClose > labelClose + 2) {
            const label = text.substring(index + 1, labelClose);
            const target = text.substring(labelClose + 2, targetClose);
            html = html + '<a href="' + this.escapeHtmlAttribute(target) + '">' + this.renderInlineMarkdown(label) + '</a>';
            index = targetClose + 1;
            continue;
          }
        }
      }
      html = html + this.escapeHtml(char);
      index = index + 1;
    }
    return html;
  }

  private renderDiffHtml(diffText: string): string {
    if (diffText.length === 0) {
      return '<div class="diff-empty"></div>';
    }
    const normalized = diffText.split('\r\n').join('\n').split('\r').join('\n');
    let html = '<section class="diff">';
    let lineStart = 0;
    let lineNumber = 1;
    while (lineStart <= normalized.length) {
      const nextLineStart = normalized.indexOf('\n', lineStart);
      let line = '';
      if (nextLineStart < 0) {
        line = normalized.substring(lineStart);
        lineStart = normalized.length + 1;
      } else {
        line = normalized.substring(lineStart, nextLineStart);
        lineStart = nextLineStart + 1;
      }
      if (line.length === 0 && lineStart > normalized.length) {
        continue;
      }
      html = html + '<div class="diff-line ' + this.diffLineClass(line) + '">' +
        '<span class="diff-no">' + lineNumber.toString() + '</span>' +
        '<span class="diff-code">' + this.escapeHtml(line) + '</span></div>';
      lineNumber = lineNumber + 1;
    }
    return html + '</section>';
  }

  private diffLineClass(line: string): string {
    if (line.startsWith('@@')) {
      return 'diff-hunk';
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file mode')) {
      return 'diff-meta';
    }
    if (line.startsWith('+')) {
      return 'diff-add';
    }
    if (line.startsWith('-')) {
      return 'diff-del';
    }
    return 'diff-context';
  }

  private isFenceLine(line: string): boolean {
    return line.startsWith('```');
  }

  private markdownHeadingLevel(line: string): number {
    let level = 0;
    while (level < line.length && line.charAt(level) === '#') {
      level = level + 1;
    }
    if (level <= 0 || level > 6 || level >= line.length) {
      return 0;
    }
    return line.charAt(level) === ' ' ? level : 0;
  }

  private isHorizontalRule(line: string): boolean {
    return line === '---' || line === '***' || line === '___';
  }

  private unorderedListText(line: string): string {
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('+ ')) {
      return line.substring(2).trim();
    }
    return '';
  }

  private orderedListText(line: string): string {
    let index = 0;
    while (index < line.length) {
      const code = line.charCodeAt(index);
      if (code < 48 || code > 57) {
        break;
      }
      index = index + 1;
    }
    if (index === 0 || index + 1 >= line.length) {
      return '';
    }
    if (line.charAt(index) !== '.' || line.charAt(index + 1) !== ' ') {
      return '';
    }
    return line.substring(index + 2).trim();
  }

  private quoteText(line: string): string {
    if (line.startsWith('> ')) {
      return line.substring(2).trim();
    }
    return '';
  }

  private isMarkdownTableLine(line: string): boolean {
    return line.indexOf('|') >= 0;
  }

  private isMarkdownTableSeparator(line: string): boolean {
    if (line.indexOf('-') < 0 || line.indexOf('|') < 0) {
      return false;
    }
    const cleaned = line.split('|').join('').split('-').join('').split(':').join('').split(' ').join('').split('\t').join('');
    return cleaned.length === 0;
  }

  private splitTableCells(line: string): Array<string> {
    let normalized = line.trim();
    if (normalized.startsWith('|')) {
      normalized = normalized.substring(1);
    }
    if (normalized.endsWith('|')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    const rawCells = normalized.split('|');
    const cells: Array<string> = [];
    for (let index = 0; index < rawCells.length; index++) {
      cells.push(rawCells[index].trim());
    }
    return cells;
  }

  private escapeHtml(text: string): string {
    return text.split('&').join('&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;')
      .split('"').join('&quot;')
      .split('\'').join('&#39;');
  }

  private escapeHtmlAttribute(text: string): string {
    return this.escapeHtml(text).split('\n').join('');
  }
}
