router.register('jianli', async function() {
  const mainContent = document.getElementById('mainContent');

  const styleId = 'jianli-page-style';
  const existingStyle = document.getElementById(styleId);
  if (existingStyle) existingStyle.remove();
  const link = document.createElement('link');
  link.id = styleId;
  link.rel = 'stylesheet';
  link.href = 'css/jianli.css?v=' + Date.now();
  document.head.appendChild(link);

  const response = await fetch('pages/jianli.html', { cache: 'no-store' });
  const resumePageHtml = await response.text();
  mainContent.innerHTML = resumePageHtml;

  const exportBtn = document.getElementById('exportResumePdfBtn');
  const exportPortfolioBtn = document.getElementById('exportPortfolioPdfBtn');

  const waitForImages = async (container) => {
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }));
  };

  const doPrint = async (btn, hideSelector) => {
    const root = document.getElementById('resumePdfRoot');
    if (!root) return;

    const originalText = btn.textContent;
    const existingPageStyle = document.getElementById('resume-print-page-style');
    if (existingPageStyle) existingPageStyle.remove();

    // Hide the other section
    const hiddenEls = hideSelector ? Array.from(root.querySelectorAll(hideSelector)) : [];
    hiddenEls.forEach(el => el.style.display = 'none');

    btn.disabled = true;
    btn.textContent = '准备中...';

    const cleanup = () => {
      document.body.classList.remove('resume-print-mode');
      const ps = document.getElementById('resume-print-page-style');
      if (ps) ps.remove();
      hiddenEls.forEach(el => el.style.display = '');
      btn.disabled = false;
      btn.textContent = originalText;
      window.removeEventListener('afterprint', cleanup);
    };

    try {
      await waitForImages(root);

      // Apply print mode so .pf gets fixed 1080px width
      document.body.classList.add('resume-print-mode');

      // Wait for layout to settle
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // Measure .pf for exact content dimensions
      const pf = root.querySelector('.pf');
      const measureEl = pf || root;
      const widthMm = Math.ceil(measureEl.scrollWidth * 0.264583) + 1;
      const heightMm = Math.ceil(measureEl.scrollHeight * 0.264583) + 1;

      const pageStyle = document.createElement('style');
      pageStyle.id = 'resume-print-page-style';
      pageStyle.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;
      document.head.appendChild(pageStyle);

      btn.textContent = '下载中...';
      window.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(() => window.print(), 100);
    } catch (error) {
      cleanup();
      console.error('导出失败:', error);
      alert('导出失败，请重试。');
    }
  };

  if (exportBtn) {
    exportBtn.addEventListener('click', () => doPrint(exportBtn, '.portfolio'));
  }
  if (exportPortfolioBtn) {
    exportPortfolioBtn.addEventListener('click', () => doPrint(exportPortfolioBtn, '.hero,.resume-main'));
  }
});
