/**
 * Smart TOC - 背景服務腳本
 * 管理擴充套件的全域設定和狀態
 */

class SmartTOCBackground {
  constructor() {
    this.init();
  }
  
  init() {
    // 監聽擴充套件安裝/更新
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });
    
    // 監聽來自 content script 的訊息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 保持訊息通道開啟
    });
    
    // 監聽標籤頁更新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });
    
    console.log('Smart TOC 背景服務已啟動');
  }
  
  async handleInstallation(details) {
    try {
      if (details.reason === 'install') {
        // 首次安裝
        await this.initializeDefaultSettings();
        console.log('Smart TOC 首次安裝完成');
      } else if (details.reason === 'update') {
        // 更新
        await this.handleUpdate(details.previousVersion);
        console.log(`Smart TOC 已更新至 ${chrome.runtime.getManifest().version}`);
      }
    } catch (error) {
      console.error('安裝處理失敗:', error);
    }
  }
  
  async initializeDefaultSettings() {
    const defaultSettings = {
      enabled: true,
      minHeadings: 3,
      minTextLength: 1000,
      supportedHeadings: ['H1', 'H2', 'H3', 'H4'],
      autoCollapse: false,
      theme: 'auto', // auto, light, dark
      position: 'smart', // smart, right, left
      excludedSites: [
        'chrome://*',
        'chrome-extension://*',
        'moz-extension://*',
        'about:*',
        'file://*'
      ]
    };
    
    try {
      await chrome.storage.sync.set({
        smartTocSettings: defaultSettings,
        smartTocVersion: chrome.runtime.getManifest().version
      });
    } catch (error) {
      console.error('無法儲存預設設定:', error);
    }
  }
  
  async handleUpdate(previousVersion) {
    try {
      // 獲取現有設定
      const result = await chrome.storage.sync.get(['smartTocSettings']);
      const currentSettings = result.smartTocSettings || {};
      
      // 合併新的預設設定
      const defaultSettings = {
        enabled: true,
        minHeadings: 3,
        minTextLength: 1000,
        supportedHeadings: ['H1', 'H2', 'H3', 'H4'],
        autoCollapse: false,
        theme: 'auto',
        position: 'smart',
        excludedSites: [
          'chrome://*',
          'chrome-extension://*',
          'moz-extension://*',
          'about:*',
          'file://*'
        ]
      };
      
      const updatedSettings = { ...defaultSettings, ...currentSettings };
      
      await chrome.storage.sync.set({
        smartTocSettings: updatedSettings,
        smartTocVersion: chrome.runtime.getManifest().version
      });
      
    } catch (error) {
      console.error('更新處理失敗:', error);
    }
  }
  
  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'GET_SETTINGS':
        this.getSettings().then(sendResponse);
        break;
        
      case 'UPDATE_SETTINGS':
        this.updateSettings(message.settings).then(sendResponse);
        break;
        
      case 'GET_TAB_INFO':
        this.getTabInfo(sender.tab.id).then(sendResponse);
        break;
        
      case 'REPORT_ERROR':
        this.reportError(message.error, sender);
        break;
        
      default:
        console.warn('未知的訊息類型:', message.type);
    }
  }
  
  async getSettings() {
    try {
      const result = await chrome.storage.sync.get(['smartTocSettings']);
      return result.smartTocSettings || {};
    } catch (error) {
      console.error('無法獲取設定:', error);
      return {};
    }
  }
  
  async updateSettings(newSettings) {
    try {
      const currentResult = await chrome.storage.sync.get(['smartTocSettings']);
      const currentSettings = currentResult.smartTocSettings || {};
      
      const updatedSettings = { ...currentSettings, ...newSettings };
      
      await chrome.storage.sync.set({
        smartTocSettings: updatedSettings
      });
      
      // 通知所有標籤頁設定已更新
      this.notifySettingsUpdate(updatedSettings);
      
      return { success: true };
    } catch (error) {
      console.error('無法更新設定:', error);
      return { success: false, error: error.message };
    }
  }
  
  async notifySettingsUpdate(settings) {
    try {
      const tabs = await chrome.tabs.query({});
      
      tabs.forEach(tab => {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: settings
          }).catch(() => {
            // 忽略無法發送訊息的標籤頁（可能還沒載入 content script）
          });
        }
      });
    } catch (error) {
      console.error('無法通知設定更新:', error);
    }
  }
  
  async getTabInfo(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return {
        url: tab.url,
        title: tab.title,
        isActive: tab.active
      };
    } catch (error) {
      console.error('無法獲取標籤頁資訊:', error);
      return null;
    }
  }
  
  reportError(error, sender) {
    console.error('Content Script 錯誤報告:', {
      error: error,
      url: sender.tab?.url,
      timestamp: new Date().toISOString()
    });
    
    // 這裡可以添加錯誤統計或回報機制
  }
  
  handleTabUpdate(tabId, changeInfo, tab) {
    // 當標籤頁完成載入時，可以執行一些初始化邏輯
    if (changeInfo.status === 'complete' && tab.url) {
      this.onTabLoaded(tab);
    }
  }
  
  async onTabLoaded(tab) {
    try {
      // 檢查是否為排除的網站
      const settings = await this.getSettings();
      const excludedSites = settings.excludedSites || [];
      
      const isExcluded = excludedSites.some(pattern => {
        // 簡單的萬用字元匹配
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(tab.url);
      });
      
      if (isExcluded) {
        return;
      }
      
      // 可以在這裡執行額外的初始化邏輯
      
    } catch (error) {
      console.error('標籤頁載入處理失敗:', error);
    }
  }
}

// 啟動背景服務
new SmartTOCBackground();