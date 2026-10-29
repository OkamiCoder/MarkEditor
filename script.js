(function () {
  'use strict';

  const DEFAULT_TEXT = `# Привет, мир!

Добро пожаловать в **MarkEditor** — быстрый браузерный редактор Markdown с живым предпросмотром.

## Что умеет

- **Жирный**, *курсив*, ~~зачёркнутый~~ и \`инлайн-код\`
- Заголовки, списки, цитаты, таблицы
- Блоки кода с подсветкой

## Пример кода

\`\`\`js
function greet(name) {
  return \`Привет, \${name}!\`;
}

console.log(greet('Мир'));
\`\`\`

## Горячие клавиши

| Действие   | Комбинация   |
| ---------- | ------------ |
| Жирный     | Ctrl + B     |
| Курсив     | Ctrl + I     |
| Ссылка     | Ctrl + K     |
| Сохранить  | Ctrl + S     |

> Markdown — это просто. Начни печатать!

[Узнать больше о Markdown](https://ru.wikipedia.org/wiki/Markdown)
`;

  const CONTENT_KEY       = 'markeditor:content';
  const THEME_KEY         = 'markeditor:theme';
  const WIDTH_KEY         = 'markeditor:editor-width';
  const RESTORE_FLAG_KEY  = 'markeditor:restore-toast-shown';
  const SAVE_DELAY        = 400;

  const $ = (id) => document.getElementById(id);

  const editor       = $('editor');
  const preview      = $('preview');
  const main         = $('main');
  const divider      = $('divider');
  const panelEditor  = $('panelEditor');
  const panelPreview = $('panelPreview');
  const toolbar      = $('toolbar');
  const cursorInfo   = $('cursorInfo');
  const statWords    = $('statWords');
  const statChars    = $('statChars');
  const statLines    = $('statLines');
  const statRead     = $('statRead');
  const toastEl      = $('toast');
  const btnTheme     = $('btnTheme');
  const btnCopy      = $('btnCopy');
  const btnDownloadMd   = $('btnDownloadMd');
  const btnDownloadHtml = $('btnDownloadHtml');
  const btnClear     = $('btnClear');
  const iconMoon     = $('iconMoon');
  const iconSun      = $('iconSun');

  if (window.marked) {
    try { marked.setOptions({ gfm: true, breaks: true }); } catch (e) {}
  }

  const sanitizeHtml = (html) =>
    (typeof window.DOMPurify !== 'undefined')
      ? window.DOMPurify.sanitize(html)
      : html;

  let saveTimer       = 0;
  let saveStatusTimer = 0;
  let saveStatusEl    = null;

function initSaveStatus() {
    if (!panelEditor) return;
    const head = panelEditor.querySelector('.panel-head');
    if (!head) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px;';

    saveStatusEl = document.createElement('span');
    saveStatusEl.id = 'saveStatus';
    saveStatusEl.setAttribute('aria-live', 'polite');
    saveStatusEl.style.cssText = [
      'font-family:"JetBrains Mono",ui-monospace,monospace',
      'font-size:10px',
      'font-weight:600',
      'color:var(--accent,#6366f1)',
      'opacity:0',
      'transition:opacity .3s ease',
      'user-select:none',
      'pointer-events:none'
    ].join(';');

    if (cursorInfo && cursorInfo.parentNode === head) {
      head.insertBefore(wrap, cursorInfo);
      wrap.appendChild(saveStatusEl);
      wrap.appendChild(cursorInfo);
    } else {
      head.appendChild(wrap);
      wrap.appendChild(saveStatusEl);
    }
  }

  function flashSaveStatus() {
    if (!saveStatusEl) return;
    saveStatusEl.textContent = 'Сохранено';
    saveStatusEl.style.opacity = '1';
    clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => {
      if (saveStatusEl) saveStatusEl.style.opacity = '0';
    }, 1500);
  }

  function saveContent() {
    try {
      localStorage.setItem(CONTENT_KEY, editor.value);
      flashSaveStatus();
    } catch (e) {
      console.warn('[MarkEditor] autosave failed:', e);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveContent, SAVE_DELAY);
  }

  function loadContent() {
    try {
      return localStorage.getItem(CONTENT_KEY);
    } catch (e) {
      return null;
    }
  }

  function clearSavedContent() {
    try { localStorage.removeItem(CONTENT_KEY); } catch (e) {}
  }

  function notifyRestoredOnce() {
    try {
      if (sessionStorage.getItem(RESTORE_FLAG_KEY)) return;
      sessionStorage.setItem(RESTORE_FLAG_KEY, '1');
    } catch (e) {
    }
    showToast('Черновик восстановлен');
  }

  let renderTimer = 0;

  function renderNow() {
    const raw = editor.value;
    let html;

    try {
      if (window.marked) {
        html = marked.parse(raw);
      } else {
        html = raw.replace(/[&<>"']/g, (c) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c])).replace(/\n/g, '<br>');
      }
    } catch (e) {
      html = '<p style="color:#ef4444">Ошибка разбора Markdown</p>';
    }

    preview.innerHTML = sanitizeHtml(html);

    preview.querySelectorAll('a[href]').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    updateStats();
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, 60);
  }

  function updateStats() {
    const text  = editor.value;
    const chars = text.length;
    const lines = text ? text.split('\n').length : 0;
    const words = text.trim() ? (text.trim().match(/\S+/g) || []).length : 0;
    const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));

    statWords.textContent = words;
    statChars.textContent = chars;
    statLines.textContent = lines;
    statRead.textContent  = `~${minutes} мин чтения`;
  }

  function updateCursor() {
    const pos = editor.selectionStart || 0;
    const before = editor.value.slice(0, pos);
    const lines = before.split('\n');
    cursorInfo.textContent = `Стр ${lines.length}, Кол ${lines[lines.length - 1].length + 1}`;
  }

  function replaceRange(start, end, replacement, selStart, selEnd) {
    const v = editor.value;
    editor.value = v.slice(0, start) + replacement + v.slice(end);
    editor.focus();
    const a = (selStart != null) ? selStart : start + replacement.length;
    const b = (selEnd   != null) ? selEnd   : a;
    editor.setSelectionRange(a, b);
    updateCursor();
    scheduleRender();
    scheduleSave();
  }

  function wrapSelection(before, after, placeholder) {
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    const selected = editor.value.slice(start, end);
    const inner = selected || placeholder || '';
    const replacement = before + inner + after;
    const innerStart = start + before.length;
    replaceRange(start, end, replacement, innerStart, innerStart + inner.length);
  }

  function eachSelectedLine(fn) {
    const v = editor.value;
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    const lineStart = v.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = v.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = v.length;

    const lines = v.slice(lineStart, lineEnd).split('\n');
    const out = lines.map((line, i) => fn(line, i));
    const replacement = out.join('\n');

    replaceRange(lineStart, lineEnd, replacement, lineStart, lineStart + replacement.length);
  }

  function prefixLines(prefix, stripPatterns) {
    eachSelectedLine((line) => {
      let cleaned = line;
      if (stripPatterns) {
        for (const p of stripPatterns) cleaned = cleaned.replace(p, '');
      }
      if (cleaned.trim() === '') return '';
      return prefix + cleaned;
    });
  }

  function applyHeading(level) {
    const hashes = '#'.repeat(level) + ' ';
    eachSelectedLine((line) => {
      const cleaned = line.replace(/^#{1,6}\s+/, '');
      if (cleaned.trim() === '') return '';
      return hashes + cleaned;
    });
  }

  function applyNumberedList() {
    eachSelectedLine((line, i) => {
      const cleaned = line.replace(/^(?:[-*+]\s+|\d+\.\s+)/, '');
      if (cleaned.trim() === '') return '';
      return (i + 1) + '. ' + cleaned;
    });
  }

  function insertAtCursor(text) {
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    replaceRange(start, end, text, start + text.length, start + text.length);
  }

  function insertLink() {
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    const selected = editor.value.slice(start, end) || 'текст ссылки';
    const replacement = `[${selected}](url)`;
    const urlStart = start + 1 + selected.length + 2;
    replaceRange(start, end, replacement, urlStart, urlStart + 3);
  }

  function insertImage() {
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    const selected = editor.value.slice(start, end) || 'alt текст';
    const replacement = `![${selected}](url)`;
    const urlStart = start + 2 + selected.length + 2;
    replaceRange(start, end, replacement, urlStart, urlStart + 3);
  }

  function insertTable() {
    const table = [
      '| Column 1 | Column 2 | Column 3 |',
      '| -------- | -------- | -------- |',
      '| Cell 1   | Cell 2   | Cell 3   |'
    ].join('\n');

    const start = editor.selectionStart;
    const v = editor.value;
    const before = (start > 0 && v[start - 1] !== '\n') ? '\n\n' : '';
    insertAtCursor(before + table + '\n');
  }

  function insertHr() {
    const start = editor.selectionStart;
    const v = editor.value;
    const before = (start > 0 && v[start - 1] !== '\n') ? '\n\n' : '';
    insertAtCursor(before + '---\n\n');
  }

  function insertCodeBlock() {
    wrapSelection('```\n', '\n```', 'code');
  }

  function runAction(action) {
    switch (action) {
      case 'bold':       wrapSelection('**', '**', 'жирный текст'); break;
      case 'italic':     wrapSelection('*', '*', 'курсив'); break;
      case 'strike':     wrapSelection('~~', '~~', 'зачёркнутый'); break;
      case 'h1':         applyHeading(1); break;
      case 'h2':         applyHeading(2); break;
      case 'h3':         applyHeading(3); break;
      case 'code':       wrapSelection('`', '`', 'код'); break;
      case 'codeblock':  insertCodeBlock(); break;
      case 'link':       insertLink(); break;
      case 'image':      insertImage(); break;
      case 'ul':         prefixLines('- ', [/^[-*+]\s+/, /^\d+\.\s+/]); break;
      case 'ol':         applyNumberedList(); break;
      case 'quote':      prefixLines('> ', [/^>\s?/]); break;
      case 'hr':         insertHr(); break;
      case 'table':      insertTable(); break;
    }
  }

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tbtn');
    if (!btn) return;
    runAction(btn.dataset.action);
  });

  editor.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') { e.preventDefault(); runAction('bold');   return; }
      if (key === 'i') { e.preventDefault(); runAction('italic'); return; }
      if (key === 'k') { e.preventDefault(); runAction('link');   return; }
      if (key === 's') { e.preventDefault(); downloadMd();        return; }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end   = editor.selectionEnd;

      if (e.shiftKey) {
        eachSelectedLine((line) => line.replace(/^ {1,2}|^\t/, ''));
      } else if (start === end) {
        replaceRange(start, end, '  ', start + 2, start + 2);
      } else {
        eachSelectedLine((line) => '  ' + line);
      }
      return;
    }
  });

  editor.addEventListener('input',  () => { updateCursor(); updateStats(); scheduleRender(); scheduleSave(); });
  editor.addEventListener('click',  updateCursor);
  editor.addEventListener('keyup',  updateCursor);
  editor.addEventListener('select', updateCursor);

  function syncThemeIcons() {
    const isDark = document.documentElement.classList.contains('dark');
    iconMoon.classList.toggle('is-hidden', isDark);
    iconSun.classList.toggle('is-hidden', !isDark);
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) document.documentElement.classList.remove('dark');
    else        document.documentElement.classList.add('dark');

    try {
      localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark');
    } catch (e) {}

    syncThemeIcons();
  }

  btnTheme.addEventListener('click', toggleTheme);
  syncThemeIcons();

  let toastTimer = 0;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadMd() {
    downloadBlob(editor.value, 'document.md', 'text/markdown;charset=utf-8');
    showToast('Скачано: document.md');
  }

  const EXPORT_CSS = `
*{box-sizing:border-box}
body{max-width:820px;margin:2rem auto;padding:0 1.2rem;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.75;color:#1e293b;background:#fff}
h1,h2,h3,h4,h5,h6{font-weight:700;line-height:1.3;margin:1.5em 0 .5em}
h1{font-size:2em;border-bottom:1px solid #e2e8f0;padding-bottom:.3em}
h2{font-size:1.5em;border-bottom:1px solid #e2e8f0;padding-bottom:.3em}
h3{font-size:1.25em}
a{color:#4f46e5;text-decoration:underline}
code{background:#f1f5f9;padding:.15em .4em;border-radius:4px;font-family:ui-monospace,monospace;font-size:.9em;color:#db2777}
pre{background:#0f172a;color:#e2e8f0;padding:1em 1.2em;border-radius:8px;overflow-x:auto;line-height:1.6}
pre code{background:none;color:inherit;padding:0;font-size:.88em}
blockquote{border-left:4px solid #6366f1;margin:1em 0;padding:.5em 1em;color:#475569;background:#f8fafc}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #e2e8f0;padding:.5em .8em;text-align:left}
th{background:#f1f5f9;font-weight:600}
tr:nth-child(even) td{background:#f8fafc}
ul,ol{padding-left:1.6em;margin:.8em 0}
img{max-width:100%;border-radius:6px}
hr{border:none;border-top:1px solid #e2e8f0;margin:2em 0}
`;

  function downloadHtml() {
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="author" content="OkamiCoder">
<title>MarkEditor Export</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
${preview.innerHTML}
</body>
</html>`;
    downloadBlob(html, 'document.html', 'text/html;charset=utf-8');
    showToast('Скачано: document.html');
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(editor.value);
      showToast('Markdown скопирован');
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = editor.value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Markdown скопирован');
      } catch (err) {
        showToast('Не удалось скопировать');
      }
    }
  }

  btnCopy.addEventListener('click', copyMarkdown);
  btnDownloadMd.addEventListener('click', downloadMd);
  btnDownloadHtml.addEventListener('click', downloadHtml);

  btnClear.addEventListener('click', () => {
    if (editor.value.trim() === '') return;
    if (confirm('Очистить редактор? Это действие нельзя отменить.')) {
      clearTimeout(saveTimer);
      editor.value = '';
      clearSavedContent();
      editor.focus();
      updateCursor();
      scheduleRender();
      showToast('Редактор очищен');
    }
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach((t) =>
        t.classList.toggle('tab-active', t === tab)
      );
      panelEditor.classList.toggle('active', target === 'editor');
      panelPreview.classList.toggle('active', target === 'preview');
    });
  });

  const MIN_PANEL = 240;
  const DIVIDER_WIDTH = 6;
  let dragging = false;

  function getClientX(e) {
    if (e.touches && e.touches.length) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX;
    return e.clientX;
  }

  function startDrag(e) {
    if (window.innerWidth < 768) return;
    dragging = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function onDrag(e) {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    let x = getClientX(e) - rect.left;
    const max = rect.width - MIN_PANEL - DIVIDER_WIDTH;
    x = Math.max(MIN_PANEL, Math.min(max, x));
    main.style.setProperty('--editor-width', x + 'px');
    if (e.cancelable) e.preventDefault();
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try {
      localStorage.setItem(WIDTH_KEY, main.style.getPropertyValue('--editor-width'));
    } catch (e) {}
  }

  divider.addEventListener('mousedown', startDrag);
  divider.addEventListener('touchstart', startDrag, { passive: false });
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag, { passive: false });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);

  try {
    const savedWidth = localStorage.getItem(WIDTH_KEY);
    if (savedWidth) main.style.setProperty('--editor-width', savedWidth);
  } catch (e) {}

  window.addEventListener('beforeunload', () => {
    clearTimeout(saveTimer);
    saveContent();
  });

  initSaveStatus();

  const savedContent = loadContent();
  editor.value = (savedContent !== null) ? savedContent : DEFAULT_TEXT;

  updateCursor();
  renderNow();

  if (savedContent !== null && savedContent !== '') {
    notifyRestoredOnce();
  }

})();
