document.addEventListener('DOMContentLoaded', function () {
    const editor = document.getElementById('editor');
    const titleInput = document.getElementById('title');
    const authorInput = document.getElementById('author');
    const publishBtn = document.getElementById('publish-btn');
    const editHtmlBtn = document.getElementById('edit-html-btn');
    const successModal = document.getElementById('success-modal');
    const articleUrlInput = document.getElementById('article-url');
    const copyBtn = document.getElementById('copy-btn');
    const viewLink = document.getElementById('view-link');
    const newArticleBtn = document.getElementById('new-article-btn');
    const charCounter = document.getElementById('char-counter');
    const htmlModal = document.getElementById('html-modal');
    const htmlArea = document.getElementById('html-area');
    const applyHtmlBtn = document.getElementById('apply-html');
    const closeHtmlBtn = document.getElementById('close-html');

    let currentArticleId = null;
    let isRestoring = false;

    const floatingToolbar = document.createElement('div');
    floatingToolbar.className = 'floating-toolbar';
    floatingToolbar.innerHTML = `
        <button data-cmd="bold" title="Жирный"><i class="fas fa-bold"></i></button>
        <button data-cmd="italic" title="Курсив"><i class="fas fa-italic"></i></button>
        <button data-cmd="underline" title="Подчеркнуть"><i class="fas fa-underline"></i></button>
        <div style="width:1px;background:var(--color-gray);margin:0 6px"></div>
        <button data-cmd="justifyLeft" title="Выровнять влево"><i class="fas fa-align-left"></i></button>
        <button data-cmd="justifyCenter" title="Выровнять по центру"><i class="fas fa-align-center"></i></button>
        <button data-cmd="justifyRight" title="Выровнять вправо"><i class="fas fa-align-right"></i></button>
        <div style="width:1px;background:var(--color-gray);margin:0 6px"></div>
        <button data-cmd="outdent" title="Уменьшить отступ"><i class="fas fa-outdent"></i></button>
        <button data-cmd="indent" title="Увеличить отступ"><i class="fas fa-indent"></i></button>
        <div style="width:1px;background:var(--color-gray);margin:0 6px"></div>
        <button data-cmd="insertUnorderedList" title="Список"><i class="fas fa-list-ul"></i></button>
        <button data-cmd="insertOrderedList" title="Нумерованный"><i class="fas fa-list-ol"></i></button>
        <button data-cmd="blockquote" title="Цитата"><i class="fas fa-quote-right"></i></button>
        <button data-cmd="insertHr" title="Горизонтальная линия"><i class="fas fa-minus"></i></button>
        <div style="width:1px;background:var(--color-gray);margin:0 6px"></div>
        <select class="heading-select" title="Оформить как">
            <option value="p">Обычный текст</option>
            <option value="h1">Заголовок 1</option>
            <option value="h2">Заголовок 2</option>
            <option value="h3">Заголовок 3</option>
        </select>
        <button data-cmd="createLink" title="Добавить ссылку"><i class="fas fa-link"></i></button>
        <button data-action="insertImage" title="Добавить изображение"><i class="fas fa-image"></i></button>
        <button data-cmd="insertTable" title="Вставить таблицу"><i class="fas fa-table"></i></button>
    `;
    document.body.appendChild(floatingToolbar);

    const ftButtons = Array.from(floatingToolbar.querySelectorAll('button[data-cmd]'));
    const headingSelect = floatingToolbar.querySelector('.heading-select');

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function autoSave() {
        if (isRestoring) return;
        const title = titleInput.value.trim();
        const content = editor.innerHTML;
        const textOnlyContent = editor.textContent.trim();
        const hasMeaningfulContent = textOnlyContent.length >= 3 || title.length >= 3;
        const hasRealContent = content &&
            content !== '<br>' &&
            content !== '<p></p>' &&
            content !== '<p><br></p>';

        if ((title || hasRealContent) && hasMeaningfulContent) {
            const data = {
                title: titleInput.value,
                author: authorInput.value,
                content: editor.innerHTML,
                timestamp: new Date().getTime()
            };
            localStorage.setItem('blocknote_draft', JSON.stringify(data));
        } else {
            localStorage.removeItem('blocknote_draft');
        }
    }
    const autoSaveDebounced = debounce(autoSave, 500);

    updateCharCount();
    restoreDraft();

    editor.addEventListener('input', () => { updateCharCount(); autoSaveDebounced(); updateToolbarState(); });
    titleInput.addEventListener('input', () => { updateCharCount(); autoSaveDebounced(); });
    authorInput.addEventListener('input', autoSaveDebounced);

    function updateCharCount() {
        const text = (editor.textContent || '') + (titleInput.value || '');
        charCounter.textContent = text.length;
    }

    function showFloatingToolbarAtRect(rect) {
        if (!rect) return hideFloatingToolbar();
        const toolbarRect = floatingToolbar.getBoundingClientRect();
        const left = Math.max(8, rect.left + (rect.width / 2) - (toolbarRect.width / 2));
        const top = Math.max(8, window.scrollY + rect.top - toolbarRect.height - 12);
        floatingToolbar.style.left = `${left}px`;
        floatingToolbar.style.top = `${top}px`;
        floatingToolbar.classList.add('show');
        updateToolbarState();
    }
    function hideFloatingToolbar() { floatingToolbar.classList.remove('show'); }

    function getSelectionRect() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        if (!isRangeInsideEditor(range)) return null;
        let rect = range.getBoundingClientRect();
        if (rect && (rect.width || rect.height)) return rect;
        const span = document.createElement('span');
        span.appendChild(document.createTextNode('\u200b'));
        const cloned = range.cloneRange();
        cloned.insertNode(span);
        const caretRect = span.getBoundingClientRect();
        span.parentNode.removeChild(span);
        return caretRect;
    }

    function isRangeInsideEditor(range) {
        let node = range.commonAncestorContainer;
        return editor.contains(node) || node === editor;
    }

    function findClosestAncestor(node, tagName) {
        if (!node) return null;
        let cur = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
        while (cur && cur !== editor && cur.nodeType === Node.ELEMENT_NODE) {
            if (cur.tagName === tagName.toUpperCase()) return cur;
            cur = cur.parentElement;
        }
        return null;
    }

    function isSelectionFullyWrappedBy(tag) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (sel.isCollapsed) return false;
        const startAncestor = findClosestAncestor(range.startContainer, tag);
        const endAncestor = findClosestAncestor(range.endContainer, tag);
        return startAncestor && endAncestor && startAncestor === endAncestor;
    }

    function unwrapAncestor(ancestor) {
        if (!ancestor || !ancestor.parentNode) return;
        const parent = ancestor.parentNode;
        while (ancestor.firstChild) parent.insertBefore(ancestor.firstChild, ancestor);
        parent.removeChild(ancestor);
        parent.normalize();
    }

    function toggleInlineFormat(tag) {
        const sel = window.getSelection();
        if (!sel) return;
        if (sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);

        if (!sel.isCollapsed && isSelectionFullyWrappedBy(tag)) {
            const ancestor = findClosestAncestor(range.startContainer, tag);
            if (ancestor) {
                unwrapAncestor(ancestor);
                sanitizeFormatting(editor);
                return;
            }
        }

        if (sel.isCollapsed) {
            const el = document.createElement(tag);
            const zw = document.createTextNode('\u200b');
            el.appendChild(zw);

            range.insertNode(el);

            const newRange = document.createRange();
            newRange.setStart(el.firstChild, 1);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);

            sanitizeFormatting(editor);
            updateToolbarState();
            return;
        }

        const extracted = range.extractContents();
        const wrapper = document.createElement(tag);
        wrapper.appendChild(extracted);

        range.insertNode(wrapper);

        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(wrapper);
        sel.addRange(newRange);

        sanitizeFormatting(editor);
        updateToolbarState();
    }

    function removeInlineFormatInRange(tag) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT, {
            acceptNode(node) {
                if (node.tagName === tag.toUpperCase()) {
                    try {
                        const nodeRange = document.createRange();
                        nodeRange.selectNodeContents(node);
                        if (nodeRange.compareBoundaryPoints(Range.END_TO_START, range) >= 0 ||
                            nodeRange.compareBoundaryPoints(Range.START_TO_END, range) <= 0) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    } catch (e) { return NodeFilter.FILTER_REJECT; }
                }
                return NodeFilter.FILTER_SKIP;
            }
        });
        const toUnwrap = [];
        let n;
        while ((n = walker.nextNode())) toUnwrap.push(n);
        toUnwrap.forEach(unwrapAncestor);
        sanitizeFormatting(editor);
    }

    function sanitizeFormatting(root) {
        ['b', 'i'].forEach(tag => {
            const els = Array.from(root.getElementsByTagName(tag));
            els.forEach(el => {
                const s = document.createElement(tag === 'b' ? 'strong' : 'em');
                while (el.firstChild) s.appendChild(el.firstChild);
                el.parentNode.replaceChild(s, el);
            });
        });

        ['strong', 'em', 'u'].forEach(tag => {
            const els = Array.from(root.getElementsByTagName(tag));
            els.forEach(el => {
                if (!el.textContent || el.textContent.trim() === '\u200b') {
                    if (el.textContent.trim() === '\u200b') {
                        const zw = document.createTextNode('\u200b');
                        el.parentNode.insertBefore(zw, el);
                    }
                    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
                    el.parentNode.removeChild(el);
                }
            });
        });

        const all = Array.from(root.querySelectorAll('*'));
        all.forEach(node => {
            if (!node.parentNode) return;
            let next = node.nextSibling;
            if (!next || next.nodeType !== Node.ELEMENT_NODE) return;
            if (node.tagName === next.tagName && ['STRONG', 'EM', 'U'].includes(node.tagName)) {
                while (next.firstChild) node.appendChild(next.firstChild);
                next.parentNode.removeChild(next);
            }
        });

        root.normalize();
    }

    function updateToolbarState() {
        const sel = window.getSelection();
        ftButtons.forEach(btn => btn.classList.remove('active'));

        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const start = range.startContainer;

        const strong = findClosestAncestor(start, 'strong');
        const em = findClosestAncestor(start, 'em');
        const u = findClosestAncestor(start, 'u');

        if (strong) floatingToolbar.querySelector('[data-cmd="bold"]').classList.add('active');
        if (em) floatingToolbar.querySelector('[data-cmd="italic"]').classList.add('active');
        if (u) floatingToolbar.querySelector('[data-cmd="underline"]').classList.add('active');

        const tag = getCurrentBlockTagName();
        headingSelect.value = tag || 'p';
    }

    function getCurrentBlockTagName() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return 'p';
        let node = sel.getRangeAt(0).startContainer;
        let cur = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
        while (cur && cur !== editor) {
            if (['H1', 'H2', 'H3', 'P', 'BLOCKQUOTE'].includes(cur.tagName)) return cur.tagName.toLowerCase();
            cur = cur.parentElement;
        }
        return 'p';
    }

    document.addEventListener('selectionchange', debounce(() => {
        const rect = getSelectionRect();
        const sel = window.getSelection();
        const inside = sel && sel.rangeCount && isRangeInsideEditor(sel.getRangeAt(0));
        if (inside) {
            if (rect) showFloatingToolbarAtRect(rect);
            else {
                const caretRect = getSelectionRect();
                if (caretRect) showFloatingToolbarAtRect(caretRect);
            }
        } else hideFloatingToolbar();
    }, 50));

    editor.addEventListener('mouseup', () => {
        const rect = getSelectionRect();
        if (rect) showFloatingToolbarAtRect(rect); else hideFloatingToolbar();
    });
    editor.addEventListener('keyup', () => {
        const rect = getSelectionRect();
        if (rect) showFloatingToolbarAtRect(rect); else hideFloatingToolbar();
    });

    document.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (!editor.contains(target) && !floatingToolbar.contains(target)) {
            hideFloatingToolbar();
        }
    });

    floatingToolbar.addEventListener('click', (e) => {
        const imgBtn = e.target.closest('button[data-action="insertImage"]');
        if (imgBtn) {
            const url = prompt('Введите URL изображения:', 'https://');
            if (url && url.trim()) insertImageByUrl(url.trim());
            hideFloatingToolbar();
            return;
        }

        const btn = e.target.closest('button[data-cmd]');
        if (!btn) return;
        const cmd = btn.getAttribute('data-cmd');

        if (cmd === 'bold') {
            toggleInlineFormat('strong');
        } else if (cmd === 'italic') {
            toggleInlineFormat('em');
        } else if (cmd === 'underline') {
            toggleInlineFormat('u');
        } else if (cmd === 'createLink') {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const url = prompt('Введите URL ссылки:', 'https://');
            if (url) {
                const range = sel.getRangeAt(0);
                if (sel.isCollapsed) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.textContent = url;
                    range.insertNode(a);
                } else {
                    const a = document.createElement('a');
                    a.href = url;
                    a.appendChild(range.extractContents());
                    range.insertNode(a);
                }
                sanitizeFormatting(editor);
            }
        } else if (cmd === 'insertUnorderedList') {
            document.execCommand('insertUnorderedList', false, null);
        } else if (cmd === 'insertOrderedList') {
            document.execCommand('insertOrderedList', false, null);
        } else if (cmd === 'blockquote') {
            document.execCommand('formatBlock', false, 'blockquote');
        } else if (cmd === 'insertHr') {
            document.execCommand('insertHorizontalRule', false, null);
        } else if (cmd === 'justifyLeft' || cmd === 'justifyCenter' || cmd === 'justifyRight') {
            document.execCommand(cmd, false, null);
        } else if (cmd === 'outdent') {
            document.execCommand('outdent', false, null);
        } else if (cmd === 'indent') {
            document.execCommand('indent', false, null);
        } else if (cmd === 'insertTable') {
            insertTablePrompt();
        }

        sanitizeFormatting(editor);
        const rect = getSelectionRect();
        if (rect) showFloatingToolbarAtRect(rect); else hideFloatingToolbar();
    });

    headingSelect.addEventListener('change', function () {
        const tag = this.value;
        if (tag === 'p') document.execCommand('formatBlock', false, '<p>');
        else document.execCommand('formatBlock', false, `<${tag}>`);
        sanitizeFormatting(editor);
        const rect = getSelectionRect();
        if (rect) showFloatingToolbarAtRect(rect);
    });

    function insertImageByUrl(url) {
        if (!url) return;
        const figure = document.createElement('figure');
        figure.className = 'image-block';
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        const caption = document.createElement('figcaption');
        caption.contentEditable = "true";
        caption.setAttribute('placeholder', 'Подпись...');
        figure.appendChild(img);
        figure.appendChild(caption);

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            editor.appendChild(figure);
            const p = document.createElement('p'); p.innerHTML = '<br>';
            editor.appendChild(p);
            const newRange = document.createRange();
            newRange.setStart(p, 0); newRange.collapse(true);
            sel.removeAllRanges(); sel.addRange(newRange);
            autoSave();
            return;
        }
        const range = sel.getRangeAt(0);
        function findClosestBlock(node) {
            const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'FIGURE', 'BLOCKQUOTE', 'UL', 'OL'];
            let cur = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
            while (cur && cur !== editor) {
                if (cur.nodeType === Node.ELEMENT_NODE && blockTags.includes(cur.tagName)) return cur;
                cur = cur.parentElement;
            }
            return null;
        }
        const block = findClosestBlock(range.startContainer);
        if (block && block.parentNode) block.parentNode.insertBefore(figure, block.nextSibling);
        else editor.appendChild(figure);
        const p = document.createElement('p'); p.innerHTML = '<br>';
        figure.parentNode.insertBefore(p, figure.nextSibling);
        const newRange = document.createRange();
        newRange.setStart(p, 0); newRange.collapse(true);
        sel.removeAllRanges(); sel.addRange(newRange);
        figure.scrollIntoView({ behavior: 'smooth', block: 'center' });
        autoSave();
    }

    function insertTablePrompt() {
        const rows = parseInt(prompt('Число строк:', '2'), 10) || 2;
        const cols = parseInt(prompt('Число столбцов:', '2'), 10) || 2;
        
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        
        for (let r = 0; r < rows; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < cols; c++) {
                const td = document.createElement(r === 0 ? 'th' : 'td');
                td.style.border = '1px solid var(--color-border)';
                td.style.padding = '8px';
                td.innerHTML = '&nbsp;';
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            editor.appendChild(table);
            editor.appendChild(document.createElement('p'));
            return;
        }
        
        const range = sel.getRangeAt(0);
        range.collapse(false);
        range.insertNode(table);
    }

    function openHtmlEditor() {
        htmlArea.value = editor.innerHTML;
        htmlModal.style.display = 'flex';
    }

    function applyHtmlChanges() {
        editor.innerHTML = htmlArea.value;
        htmlModal.style.display = 'none';
        updateCharCount();
        autoSave();
    }

    // Обработчики для новых кнопок
    editHtmlBtn.addEventListener('click', openHtmlEditor);
    applyHtmlBtn.addEventListener('click', applyHtmlChanges);
    closeHtmlBtn.addEventListener('click', () => {
        htmlModal.style.display = 'none';
    });

    // Закрытие HTML модального окна при клике вне его
    htmlModal.addEventListener('click', (e) => {
        if (e.target === htmlModal) {
            htmlModal.style.display = 'none';
        }
    });

    // Горячие клавиши
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            openHtmlEditor();
        }
    });

    publishBtn.addEventListener('click', async function () {
        const title = titleInput.value.trim();
        const content = editor.innerHTML;
        const author = authorInput.value.trim();

        if (!content || content === '<br>' || content === '') {
            alert('Статья не может быть пустой!');
            return;
        }

        publishBtn.disabled = true;
        publishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Публикация...';

        try {
            const response = await fetch('/api/article', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title || 'Без названия',
                    content: content,
                    author: author || 'Аноним'
                })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const article = await response.json();

            if (article && article.id) {
                currentArticleId = article.id;
                showSuccessModal(article.id);
                localStorage.removeItem('blocknote_draft');
            } else {
                throw new Error('Invalid response from server');
            }
        } catch (error) {
            console.error('Ошибка публикации:', error);
            alert('Ошибка при публикации статьи. Попробуйте снова.');
        } finally {
            publishBtn.disabled = false;
            publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Опубликовать';
        }
    });

    function showSuccessModal(articleId) {
        const url = `${window.location.origin}/${articleId}`;
        articleUrlInput.value = url;
        viewLink.href = url;
        successModal.style.display = 'flex';
    }

    copyBtn.addEventListener('click', function () {
        articleUrlInput.select();
        document.execCommand('copy');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
        setTimeout(() => { copyBtn.innerHTML = originalText; }, 2000);
    });

    newArticleBtn.addEventListener('click', function () {
        titleInput.value = '';
        authorInput.value = '';
        editor.innerHTML = '';
        successModal.style.display = 'none';
        updateCharCount();
        localStorage.removeItem('blocknote_draft');
        titleInput.focus();
    });

    successModal.addEventListener('click', function (e) {
        if (e.target === successModal) successModal.style.display = 'none';
    });

    editor.addEventListener('paste', function (e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
    });

    editor.addEventListener('focus', () => {
        const rect = getSelectionRect();
        if (rect) showFloatingToolbarAtRect(rect);
    });
    editor.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement || (!editor.contains(document.activeElement) && !floatingToolbar.contains(document.activeElement))) {
                hideFloatingToolbar();
            }
        }, 150);
    });

    function restoreDraft() {
        const draft = localStorage.getItem('blocknote_draft');
        if (draft) {
            const data = JSON.parse(draft);
            const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
            if (data.timestamp > dayAgo) {
                const hasContent =
                    (data.title && data.title.trim() !== '') ||
                    (data.content && data.content.trim() !== '' &&
                        data.content !== '<br>' &&
                        data.content !== '<p></p>');
                const textOnlyContent = data.content ? data.content.replace(/<[^>]*>/g, '').trim() : '';
                const hasMeaningfulContent = textOnlyContent.length >= 10;
                if (hasContent && hasMeaningfulContent) {
                    isRestoring = true;
                    if (confirm('Найдена несохраненная статья. Восстановить?')) {
                        titleInput.value = data.title || '';
                        authorInput.value = data.author || '';
                        editor.innerHTML = data.content || '';
                        updateCharCount();
                    } else {
                        localStorage.removeItem('blocknote_draft');
                        titleInput.value = '';
                        authorInput.value = '';
                        editor.innerHTML = '';
                        updateCharCount();
                    }
                    isRestoring = false;
                } else localStorage.removeItem('blocknote_draft');
            } else localStorage.removeItem('blocknote_draft');
        }
    }

    const tipBtn = document.getElementById('tip-btn');
    const tipModal = document.getElementById('tip-modal');
    const closeTipBtn = document.querySelector('.close-tip');

    if (tipBtn && tipModal) {
        tipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            tipModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });

        closeTipBtn.addEventListener('click', () => {
            tipModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });

        tipModal.addEventListener('click', (e) => {
            if (e.target === tipModal) {
                tipModal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && tipModal.style.display === 'flex') {
                tipModal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    }
});