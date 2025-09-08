/**
 * Smart TOC - 智能目錄生成器
 * 主要功能模組
 */

class SmartTOC {
  constructor() {
    this.container = null;
    this.tocList = null;
    this.headings = [];
    this.currentActiveIndex = 0;
    this.isCollapsed = false;
    this.isDragging = false;
    this.position = { x: 0, y: 0 };
    
    // 觀察器
    this.mutationObserver = null;
    this.intersectionObserver = null;
    this.resizeObserver = null;
    
    // 配置
    this.config = {
      minHeadings: 3,        // 最少標題數量才顯示
      minTextLength: 1000,   // 最少文字長度
      supportedHeadings: ['H1', 'H2', 'H3', 'H4'],
      updateDelay: 300       // 防抖延遲
    };
    
    // 防抖函數
    this.debounce = this.createDebounce();
    
    this.init();
  }
  
  // ===== 初始化 =====
  async init() {
    try {
      // 檢查網站相容性
      if (!this.isCompatibleSite()) {
        return;
      }
      
      // 載入用戶設定
      await this.loadSettings();
      
      // 等待頁面內容載入完成
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.start());
      } else {
        this.start();
      }
      
    } catch (error) {
      console.error('Smart TOC 初始化失敗:', error);
    }
  }
  
  start() {
    // 建立目錄
    this.buildTOC();
    
    // 設置監聽器
    this.setupObservers();
    this.setupSPAListeners();
    this.setupScrollListener();
    
    console.log('Smart TOC 已啟動');
  }
  
  // ===== 網站相容性檢測 =====
  isCompatibleSite() {
    // 排除不適合的網站
    const blacklist = [
      'chrome://',
      'chrome-extension://',
      'moz-extension://',
      'about:',
      'file://'
    ];
    
    const currentURL = window.location.href;
    if (blacklist.some(pattern => currentURL.startsWith(pattern))) {
      return false;
    }
    
    // 檢查是否為管理後台等不適合的頁面
    const adminPatterns = [
      '/admin',
      '/dashboard',
      '/login',
      '/wp-admin'
    ];
    
    if (adminPatterns.some(pattern => currentURL.includes(pattern))) {
      return false;
    }
    
    return true;
  }
  
  // ===== 內容分析 =====
  analyzeContent() {
    const headings = this.findHeadings();
    const textLength = this.getTextLength();
    
    // 檢查是否符合啟用條件
    if (headings.length < this.config.minHeadings) {
      console.log(`標題數量不足: ${headings.length} < ${this.config.minHeadings}`);
      return false;
    }
    
    if (textLength < this.config.minTextLength) {
      console.log(`文字長度不足: ${textLength} < ${this.config.minTextLength}`);
      return false;
    }
    
    this.headings = headings;
    return true;
  }
  
  findHeadings() {
    const selector = this.config.supportedHeadings.map(h => h.toLowerCase()).join(',');
    const elements = document.querySelectorAll(selector);
    
    const headings = [];
    elements.forEach((el, index) => {
      // 過濾掉不可見或很短的標題
      if (this.isVisibleHeading(el)) {
        headings.push({
          element: el,
          text: el.textContent.trim(),
          level: parseInt(el.tagName.charAt(1)),
          id: el.id || `toc-heading-${index}`,
          index: index
        });
        
        // 確保有 ID 供錨點使用
        if (!el.id) {
          el.id = `toc-heading-${index}`;
        }
      }
    });
    
    return headings;
  }
  
  isVisibleHeading(element) {
    // 檢查元素是否可見
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    
    // 檢查文字長度
    const text = element.textContent.trim();
    if (text.length < 2 || text.length > 200) {
      return false;
    }
    
    // 檢查是否在主要內容區域
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }
    
    return true;
  }
  
  getTextLength() {
    // 計算主要內容區域的文字長度
    const contentSelectors = [
      'article',
      'main',
      '.content',
      '.post',
      '.entry',
      '#content',
      '.article-body',
      '.post-content'
    ];
    
    let contentElement = null;
    for (const selector of contentSelectors) {
      contentElement = document.querySelector(selector);
      if (contentElement) break;
    }
    
    if (!contentElement) {
      contentElement = document.body;
    }
    
    return contentElement.textContent.trim().length;
  }
  
  // ===== TOC 建立 =====
  buildTOC() {
    if (!this.analyzeContent()) {
      this.removeTOC();
      return;
    }
    
    // 如果已存在，先移除
    this.removeTOC();
    
    // 建立容器
    this.createContainer();
    
    // 建立目錄列表
    this.createTOCList();
    
    // 定位容器
    this.positionContainer();
    
    // 設置交互功能
    this.setupInteractions();
    
    console.log(`Smart TOC 已建立，包含 ${this.headings.length} 個標題`);
  }
  
  createContainer() {
    this.container = document.createElement('div');
    this.container.className = 'smart-toc-container';
    this.container.innerHTML = `
      <div class="smart-toc-header">
        <span class="smart-toc-title">目錄</span>
        <button class="smart-toc-toggle" title="收合/展開">
          <span class="smart-toc-toggle-icon">−</span>
        </button>
        <button class="smart-toc-drag" title="拖曳移動">
          <span class="smart-toc-drag-icon">⋮⋮</span>
        </button>
      </div>
      <div class="smart-toc-content">
        <ul class="smart-toc-list"></ul>
      </div>
    `;
    
    document.body.appendChild(this.container);
    this.tocList = this.container.querySelector('.smart-toc-list');
  }
  
  createTOCList() {
    this.tocList.innerHTML = '';
    
    this.headings.forEach((heading, index) => {
      const li = document.createElement('li');
      li.className = `smart-toc-item smart-toc-level-${heading.level}`;
      li.innerHTML = `
        <a href="#${heading.id}" class="smart-toc-link" data-index="${index}">
          ${this.escapeHtml(heading.text)}
        </a>
      `;
      
      this.tocList.appendChild(li);
    });
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // ===== 智能定位 =====
  positionContainer() {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    const containerRect = this.container.getBoundingClientRect();
    
    // 檢查右側空間
    const rightSpace = this.getAvailableSpace('right');
    const leftSpace = this.getAvailableSpace('left');
    
    let position = { x: 0, y: 100 };
    
    if (rightSpace.width >= 250) {
      // 右側有足夠空間
      position.x = viewport.width - containerRect.width - 20;
      position.y = Math.max(100, rightSpace.y);
    } else if (leftSpace.width >= 250) {
      // 左側有足夠空間
      position.x = 20;
      position.y = Math.max(100, leftSpace.y);
    } else {
      // 空間不足，使用懸浮模式
      position.x = viewport.width - containerRect.width - 20;
      position.y = 100;
      this.container.classList.add('smart-toc-floating');
    }
    
    this.setPosition(position);
  }
  
  getAvailableSpace(side) {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    // 檢測固定定位的元素（如導航欄、側邊欄）
    const fixedElements = document.querySelectorAll('*');
    const obstacles = [];
    
    fixedElements.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) {
          obstacles.push(rect);
        }
      }
    });
    
    if (side === 'right') {
      let availableWidth = 300;
      let obstacleX = viewport.width;
      
      obstacles.forEach(rect => {
        if (rect.right > viewport.width - 350) {
          obstacleX = Math.min(obstacleX, rect.left);
        }
      });
      
      return {
        width: Math.max(0, obstacleX - (viewport.width - 300)),
        y: 100
      };
    } else {
      let availableWidth = 300;
      let obstacleX = 0;
      
      obstacles.forEach(rect => {
        if (rect.left < 350) {
          obstacleX = Math.max(obstacleX, rect.right);
        }
      });
      
      return {
        width: Math.max(0, 300 - obstacleX),
        y: 100
      };
    }
  }
  
  setPosition(position) {
    this.position = position;
    this.container.style.left = `${position.x}px`;
    this.container.style.top = `${position.y}px`;
  }
  
  // ===== 交互功能 =====
  setupInteractions() {
    // 目錄項目點擊
    this.tocList.addEventListener('click', (e) => {
      if (e.target.classList.contains('smart-toc-link')) {
        e.preventDefault();
        const index = parseInt(e.target.dataset.index);
        this.scrollToHeading(index);
      }
    });
    
    // 收合/展開按鈕
    const toggleBtn = this.container.querySelector('.smart-toc-toggle');
    toggleBtn.addEventListener('click', () => this.toggleCollapse());
    
    // 拖曳功能
    const dragBtn = this.container.querySelector('.smart-toc-drag');
    this.setupDragFunctionality(dragBtn);
  }
  
  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    this.container.classList.toggle('smart-toc-collapsed', this.isCollapsed);
    
    const toggleIcon = this.container.querySelector('.smart-toc-toggle-icon');
    toggleIcon.textContent = this.isCollapsed ? '+' : '−';
  }
  
  setupDragFunctionality(dragHandle) {
    let startX, startY, startPosX, startPosY;
    
    dragHandle.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPosX = this.position.x;
      startPosY = this.position.y;
      
      this.container.classList.add('smart-toc-dragging');
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      e.preventDefault();
    });
    
    const handleMouseMove = (e) => {
      if (!this.isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newX = Math.max(0, Math.min(window.innerWidth - this.container.offsetWidth, startPosX + deltaX));
      const newY = Math.max(0, Math.min(window.innerHeight - this.container.offsetHeight, startPosY + deltaY));
      
      this.setPosition({ x: newX, y: newY });
    };
    
    const handleMouseUp = () => {
      this.isDragging = false;
      this.container.classList.remove('smart-toc-dragging');
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // 儲存位置
      this.savePosition();
    };
  }
  
  scrollToHeading(index) {
    if (index < 0 || index >= this.headings.length) return;
    
    const heading = this.headings[index];
    const element = heading.element;
    
    // 平滑滾動到目標
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    
    // 更新高亮
    this.updateActiveItem(index);
  }
  
  updateActiveItem(index) {
    // 移除舊的高亮
    this.container.querySelectorAll('.smart-toc-link').forEach(link => {
      link.classList.remove('smart-toc-active');
    });
    
    // 添加新的高亮
    if (index >= 0 && index < this.headings.length) {
      const activeLink = this.container.querySelector(`[data-index="${index}"]`);
      if (activeLink) {
        activeLink.classList.add('smart-toc-active');
        this.currentActiveIndex = index;
      }
    }
  }
  
  // ===== 滾動監聽 =====
  setupScrollListener() {
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.updateActiveItemByScroll();
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
  }
  
  updateActiveItemByScroll() {
    const scrollTop = window.pageYOffset;
    const viewportHeight = window.innerHeight;
    const threshold = viewportHeight * 0.3; // 30% of viewport
    
    let activeIndex = 0;
    
    for (let i = this.headings.length - 1; i >= 0; i--) {
      const heading = this.headings[i];
      const rect = heading.element.getBoundingClientRect();
      const absoluteTop = scrollTop + rect.top;
      
      if (absoluteTop <= scrollTop + threshold) {
        activeIndex = i;
        break;
      }
    }
    
    if (activeIndex !== this.currentActiveIndex) {
      this.updateActiveItem(activeIndex);
    }
  }
  
  // ===== 動態內容監聽 =====
  setupObservers() {
    // 監聽 DOM 變更
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          // 檢查是否有新增或刪除的標題
          const addedNodes = Array.from(mutation.addedNodes);
          const removedNodes = Array.from(mutation.removedNodes);
          
          const hasHeadingChanges = [...addedNodes, ...removedNodes].some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              return this.config.supportedHeadings.includes(node.tagName) ||
                     node.querySelector && node.querySelector(this.config.supportedHeadings.map(h => h.toLowerCase()).join(','));
            }
            return false;
          });
          
          if (hasHeadingChanges) {
            shouldUpdate = true;
          }
        }
      });
      
      if (shouldUpdate) {
        this.debounce(() => {
          console.log('檢測到內容變更，重新建立目錄');
          this.buildTOC();
        });
      }
    });
    
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // 監聽視窗大小變化
    this.resizeObserver = new ResizeObserver(() => {
      this.debounce(() => {
        this.positionContainer();
      });
    });
    
    this.resizeObserver.observe(document.body);
  }
  
  // ===== SPA 路由監聽 =====
  setupSPAListeners() {
    let currentURL = window.location.href;
    
    // 監聽 popstate（瀏覽器按鈕）
    window.addEventListener('popstate', () => {
      this.handleRouteChange();
    });
    
    // 劫持 history API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.handleRouteChange();
    };
    
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.handleRouteChange();
    };
    
    // 定期檢查 URL 變化（備用方案）
    setInterval(() => {
      if (window.location.href !== currentURL) {
        currentURL = window.location.href;
        this.handleRouteChange();
      }
    }, 1000);
  }
  
  handleRouteChange() {
    console.log('檢測到路由變化，重新分析頁面');
    
    // 延遲一點時間讓新內容載入
    setTimeout(() => {
      this.buildTOC();
    }, 300);
  }
  
  // ===== 工具函數 =====
  createDebounce() {
    let timeoutId = null;
    return (func, delay = this.config.updateDelay) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(func, delay);
    };
  }
  
  removeTOC() {
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.tocList = null;
    }
  }
  
  // ===== 設定管理 =====
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['smartTocSettings']);
      if (result.smartTocSettings) {
        Object.assign(this.config, result.smartTocSettings);
      }
    } catch (error) {
      console.log('無法載入設定，使用預設值');
    }
  }
  
  async savePosition() {
    try {
      await chrome.storage.sync.set({
        smartTocPosition: this.position
      });
    } catch (error) {
      console.log('無法儲存位置');
    }
  }
  
  // ===== 清理 =====
  destroy() {
    this.removeTOC();
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}

// ===== 啟動 =====
let smartTOC = null;

// 避免重複初始化
if (!window.smartTOCInitialized) {
  window.smartTOCInitialized = true;
  smartTOC = new SmartTOC();
}

// 頁面卸載時清理
window.addEventListener('beforeunload', () => {
  if (smartTOC) {
    smartTOC.destroy();
  }
});