/**
 * Smart TOC Popup 腳本
 * 管理設定界面的互動邏輯
 */

class SmartTOCPopup {
  constructor() {
    this.settings = {};
    this.currentTab = null;
    this.isLoading = false;
    
    this.init();
  }
  
  async init() {
    try {
      // 獲取當前標籤頁
      await this.getCurrentTab();
      
      // 載入設定
      await this.loadSettings();
      
      // 初始化 UI
      this.initializeUI();
      
      // 設置事件監聽器
      this.setupEventListeners();
      
      // 更新頁面狀態
      await this.updatePageStatus();
      
    } catch (error) {
      console.error('Popup 初始化失敗:', error);
      this.showNotification('載入失敗，請重新開啟', 'error');
    }
  }
  
  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
  }
  
  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      this.settings = response || {};
    } catch (error) {
      console.error('無法載入設定:', error);
      this.settings = {};
    }
  }
  
  initializeUI() {
    // 更新版本號
    const versionElement = document.querySelector('.version-badge');
    if (versionElement) {
      versionElement.textContent = `v${chrome.runtime.getManifest().version}`;
    }
    
    // 設置表單值
    this.updateFormValues();
  }
  
  updateFormValues() {
    // 啟用開關
    const enableToggle = document.getElementById('enable-toggle');
    enableToggle.checked = this.settings.enabled !== false;
    
    // 最少標題數量
    const minHeadings = document.getElementById('min-headings');
    minHeadings.value = this.settings.minHeadings || 3;
    
    // 最少文字長度
    const minTextLength = document.getElementById('min-text-length');
    minTextLength.value = this.settings.minTextLength || 1000;
    
    // 主題選擇
    const themeSelect = document.getElementById('theme-select');
    themeSelect.value = this.settings.theme || 'auto';
    
    // 位置選擇
    const positionSelect = document.getElementById('position-select');
    positionSelect.value = this.settings.position || 'smart';
  }
  
  setupEventListeners() {
    // 啟用開關
    document.getElementById('enable-toggle').addEventListener('change', (e) => {
      this.updateSetting('enabled', e.target.checked);
    });
    
    // 重新生成按鈕
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.refreshTOC();
    });
    
    // 設定變更
    document.getElementById('min-headings').addEventListener('change', (e) => {
      this.updateSetting('minHeadings', parseInt(e.target.value));
    });
    
    document.getElementById('min-text-length').addEventListener('change', (e) => {
      this.updateSetting('minTextLength', parseInt(e.target.value));
    });
    
    document.getElementById('theme-select').addEventListener('change', (e) => {
      this.updateSetting('theme', e.target.value);
    });
    
    document.getElementById('position-select').addEventListener('change', (e) => {
      this.updateSetting('position', e.target.value);
    });
    
    // 底部按鈕
    document.getElementById('reset-btn').addEventListener('click', () => {
      this.resetSettings();
    });
    
    document.getElementById('save-btn').addEventListener('click', () => {
      this.saveSettings();
    });
    
    // 說明連結
    document.getElementById('help-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.openHelp();
    });
    
    document.getElementById('feedback-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.openFeedback();
    });
    
    // 通知關閉
    document.querySelector('.notification-close').addEventListener('click', () => {
      this.hideNotification();
    });
  }
  
  async updatePageStatus() {
    try {
      // 更新當前 URL
      const urlElement = document.getElementById('current-url');
      if (this.currentTab && this.currentTab.url) {
        const url = new URL(this.currentTab.url);
        urlElement.textContent = url.hostname;
        urlElement.title = this.currentTab.url;
      } else {
        urlElement.textContent = '無法識別';
      }
      
      // 檢查 TOC 狀態
      await this.checkTOCStatus();
      
    } catch (error) {
      console.error('更新頁面狀態失敗:', error);
    }
  }
  
  async checkTOCStatus() {
    const statusElement = document.getElementById('toc-status');
    const indicator = document.createElement('span');
    indicator.className = 'status-indicator loading';
    
    try {
      if (!this.currentTab || !this.currentTab.url || 
          this.currentTab.url.startsWith('chrome://') ||
          this.currentTab.url.startsWith('chrome-extension://')) {
        statusElement.innerHTML = '';
        indicator.className = 'status-indicator inactive';
        statusElement.appendChild(indicator);
        statusElement.appendChild(document.createTextNode('不支援此頁面'));
        return;
      }
      
      // 嘗試與 content script 通訊
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'GET_TOC_STATUS'
      });
      
      statusElement.innerHTML = '';
      
      if (response && response.active) {
        indicator.className = 'status-indicator active';
        statusElement.appendChild(indicator);
        statusElement.appendChild(document.createTextNode('已啟用'));
        
        // 更新統計
        this.updateStats(response.stats);
      } else {
        indicator.className = 'status-indicator inactive';
        statusElement.appendChild(indicator);
        statusElement.appendChild(document.createTextNode('未啟用'));
        
        if (response && response.reason) {
          statusElement.title = response.reason;
        }
      }
      
    } catch (error) {
      statusElement.innerHTML = '';
      indicator.className = 'status-indicator inactive';
      statusElement.appendChild(indicator);
      statusElement.appendChild(document.createTextNode('未載入'));
      console.log('無法與 content script 通訊:', error);
    }
  }
  
  updateStats(stats) {
    const headingsCount = document.getElementById('headings-count');
    const textLength = document.getElementById('text-length');
    
    if (stats) {
      headingsCount.textContent = stats.headingsCount || '-';
      
      const length = stats.textLength || 0;
      if (length > 1000) {
        textLength.textContent = `${(length / 1000).toFixed(1)}k`;
      } else {
        textLength.textContent = length.toString();
      }
    } else {
      headingsCount.textContent = '-';
      textLength.textContent = '-';
    }
  }
  
  async updateSetting(key, value) {
    this.settings[key] = value;
    
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { [key]: value }
      });
      
      // 立即更新相關的 content script
      if (this.currentTab && this.currentTab.id) {
        chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'SETTINGS_UPDATED',
          settings: this.settings
        }).catch(() => {
          // 忽略錯誤
        });
      }
      
    } catch (error) {
      console.error('更新設定失敗:', error);
      this.showNotification('設定更新失敗', 'error');
    }
  }
  
  async refreshTOC() {
    if (!this.currentTab || !this.currentTab.id) {
      this.showNotification('無法重新生成目錄', 'error');
      return;
    }
    
    this.showLoading('重新生成中...');
    
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'REFRESH_TOC'
      });
      
      // 等待一下再更新狀態
      setTimeout(() => {
        this.checkTOCStatus();
        this.hideLoading();
        this.showNotification('目錄已重新生成', 'success');
      }, 500);
      
    } catch (error) {
      this.hideLoading();
      this.showNotification('重新生成失敗', 'error');
      console.error('重新生成 TOC 失敗:', error);
    }
  }
  
  async resetSettings() {
    if (!confirm('確定要重置所有設定嗎？')) {
      return;
    }
    
    this.showLoading('重置中...');
    
    try {
      const defaultSettings = {
        enabled: true,
        minHeadings: 3,
        minTextLength: 1000,
        theme: 'auto',
        position: 'smart'
      };
      
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: defaultSettings
      });
      
      this.settings = { ...this.settings, ...defaultSettings };
      this.updateFormValues();
      
      this.hideLoading();
      this.showNotification('設定已重置', 'success');
      
    } catch (error) {
      this.hideLoading();
      this.showNotification('重置失敗', 'error');
      console.error('重置設定失敗:', error);
    }
  }
  
  async saveSettings() {
    this.showLoading('儲存中...');
    
    try {
      // 收集表單數據
      const formSettings = {
        enabled: document.getElementById('enable-toggle').checked,
        minHeadings: parseInt(document.getElementById('min-headings').value),
        minTextLength: parseInt(document.getElementById('min-text-length').value),
        theme: document.getElementById('theme-select').value,
        position: document.getElementById('position-select').value
      };
      
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: formSettings
      });
      
      this.settings = { ...this.settings, ...formSettings };
      
      this.hideLoading();
      this.showNotification('設定已儲存', 'success');
      
    } catch (error) {
      this.hideLoading();
      this.showNotification('儲存失敗', 'error');
      console.error('儲存設定失敗:', error);
    }
  }
  
  openHelp() {
    chrome.tabs.create({
      url: 'https://github.com/your-username/smart-toc/blob/main/README.md'
    });
  }
  
  openFeedback() {
    chrome.tabs.create({
      url: 'https://github.com/your-username/smart-toc/issues'
    });
  }
  
  showLoading(text = '處理中...') {
    this.isLoading = true;
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.querySelector('.loading-text');
    
    loadingText.textContent = text;
    overlay.classList.add('show');
  }
  
  hideLoading() {
    this.isLoading = false;
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.remove('show');
  }
  
  showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const text = notification.querySelector('.notification-text');
    
    text.textContent = message;
    notification.className = `notification ${type} show`;
    
    // 自動隱藏
    setTimeout(() => {
      this.hideNotification();
    }, 3000);
  }
  
  hideNotification() {
    const notification = document.getElementById('notification');
    notification.classList.remove('show');
  }
}

// 當 DOM 載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
  new SmartTOCPopup();
});