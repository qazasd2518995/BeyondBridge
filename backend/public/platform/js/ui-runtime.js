(function attachPlatformUiRuntime(global) {
  const cssVarPalette = {
    'var(--olive)': 'rgba(111, 135, 58, 0.16)',
    'var(--terracotta)': 'rgba(190, 96, 62, 0.16)',
    'var(--gray-500)': 'rgba(107, 114, 128, 0.16)',
    'var(--gray-400)': 'rgba(148, 163, 184, 0.16)'
  };

  function clampProgressValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, numeric));
  }

  function getSoftAccentBackground(color) {
    const normalized = String(color || '').trim();
    if (cssVarPalette[normalized]) return cssVarPalette[normalized];

    const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      const fullHex = hex.length === 3
        ? hex.split('').map((part) => part + part).join('')
        : hex;
      const red = parseInt(fullHex.slice(0, 2), 16);
      const green = parseInt(fullHex.slice(2, 4), 16);
      const blue = parseInt(fullHex.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, 0.16)`;
    }

    const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
      const parts = rgbMatch[1]
        .split(',')
        .map((part) => Number(part.trim()))
        .filter(Number.isFinite);
      if (parts.length >= 3) {
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.16)`;
      }
    }

    return 'rgba(148, 163, 184, 0.16)';
  }

  function getScopedNodes(root, selector) {
    const nodes = [];
    if (!root) return nodes;
    if (root instanceof Element && root.matches(selector)) {
      nodes.push(root);
    }
    if (typeof root.querySelectorAll === 'function') {
      nodes.push(...root.querySelectorAll(selector));
    }
    return nodes;
  }

  function setProgressWidth(element, value) {
    if (!element) return 0;
    const progress = clampProgressValue(value ?? element.dataset.progressWidth);
    element.dataset.progressWidth = String(progress);
    element.style.width = `${progress}%`;
    return progress;
  }

  function applyProgressWidths(root = document) {
    getScopedNodes(root, '[data-progress-width]').forEach((node) => {
      setProgressWidth(node, node.dataset.progressWidth);
    });
  }

  function setBackgroundFill(element, background) {
    if (!element) return '';
    const resolved = String(background ?? element.dataset.coverGradient ?? '').trim();
    if (!resolved) return '';
    element.dataset.coverGradient = resolved;
    element.style.background = resolved;
    return resolved;
  }

  function applyBackgroundFills(root = document) {
    getScopedNodes(root, '[data-cover-gradient]').forEach((node) => {
      setBackgroundFill(node, node.dataset.coverGradient);
    });
  }

  function setAccentTone(element, color) {
    if (!element) return '';
    const accentColor = String(color ?? element.dataset.accentColor ?? 'var(--gray-400)').trim() || 'var(--gray-400)';
    element.dataset.accentColor = accentColor;
    element.style.color = accentColor;
    element.style.background = getSoftAccentBackground(accentColor);
    return accentColor;
  }

  function applyAccentTones(root = document) {
    getScopedNodes(root, '[data-accent-color]').forEach((node) => {
      setAccentTone(node, node.dataset.accentColor);
    });
  }

  function setTreeIndent(element, level) {
    if (!element) return 0;
    const numericLevel = Number(level ?? element.dataset.treeIndent);
    const safeLevel = Number.isFinite(numericLevel) ? Math.max(0, numericLevel) : 0;
    element.dataset.treeIndent = String(safeLevel);
    element.style.paddingLeft = `${safeLevel * 20}px`;
    return safeLevel;
  }

  function applyTreeIndent(root = document) {
    getScopedNodes(root, '[data-tree-indent]').forEach((node) => {
      setTreeIndent(node, node.dataset.treeIndent);
    });
  }

  const responsiveTableSelector = [
    'table.management-table',
    'table.data-table',
    'table.attempts-table',
    'table.proctoring-table',
    'table.bridge-members-table'
  ].join(',');

  function applyResponsiveTableLabels(root = document) {
    getScopedNodes(root, responsiveTableSelector).forEach((table) => {
      if (!(table instanceof HTMLTableElement)) return;
      const headers = Array.from(table.querySelectorAll('thead th')).map((header) => (
        String(header.textContent || '').replace(/\s+/g, ' ').trim()
      ));
      if (headers.length === 0) return;

      table.classList.add('responsive-card-table');
      Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (!(cell instanceof HTMLTableCellElement) || cell.tagName !== 'TD') return;
          const label = headers[index] || '';
          if (label && !cell.hasAttribute('data-label')) {
            cell.setAttribute('data-label', label);
          }
        });
      });
    });
  }

  function applyRuntimeUi(root = document) {
    applyProgressWidths(root);
    applyBackgroundFills(root);
    applyAccentTones(root);
    applyTreeIndent(root);
    applyResponsiveTableLabels(root);
  }

  let runtimeObserver = null;

  function observeRuntimeUi(root = document.body) {
    if (runtimeObserver || typeof MutationObserver === 'undefined' || !root) {
      return runtimeObserver;
    }

    runtimeObserver = new MutationObserver((mutations) => {
      const seenNodes = new Set();
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element) || seenNodes.has(node)) return;
          seenNodes.add(node);
          applyRuntimeUi(node);
        });
      });
    });

    runtimeObserver.observe(root, { childList: true, subtree: true });
    return runtimeObserver;
  }

  global.PlatformUIRuntime = {
    clampProgressValue,
    getSoftAccentBackground,
    getScopedNodes,
    setProgressWidth,
    applyProgressWidths,
    setBackgroundFill,
    applyBackgroundFills,
    setAccentTone,
    applyAccentTones,
    setTreeIndent,
    applyTreeIndent,
    applyResponsiveTableLabels,
    applyRuntimeUi,
    observeRuntimeUi
  };
})(window);
