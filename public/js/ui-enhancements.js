/**
 * UI Enhancement Module for AEMS
 * Provides advanced loading states, progress indicators, and user feedback
 */

class UIEnhancements {
  constructor() {
    this.activeOperations = new Map();
    this.toasts = [];
    this.progressBars = new Map();
    this.init();
  }

  init() {
    // Create toast container if it doesn't exist
    if (!document.getElementById('toast-container')) {
      const container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 400px;
      `;
      document.body.appendChild(container);
    }

    // Create global loading overlay
    if (!document.getElementById('global-loading')) {
      const overlay = document.createElement('div');
      overlay.id = 'global-loading';
      overlay.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9999;
        justify-content: center;
        align-items: center;
      `;
      overlay.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 8px; text-align: center;">
          <div class="spinner" style="width: 50px; height: 50px; margin: 0 auto 20px;"></div>
          <h3 style="margin: 0 0 10px;">Processing...</h3>
          <p id="loading-message" style="margin: 0; color: #666;">Please wait</p>
          <div id="loading-progress" style="margin-top: 20px; display: none;">
            <div style="background: #e0e0e0; height: 4px; border-radius: 2px; overflow: hidden;">
              <div id="loading-progress-bar" style="background: hsl(var(--primary)); height: 100%; width: 0%; transition: width 0.3s;"></div>
            </div>
            <p id="loading-progress-text" style="margin-top: 10px; font-size: 14px; color: #666;">0%</p>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    // Add CSS for animations
    if (!document.getElementById('ui-enhancement-styles')) {
      const style = document.createElement('style');
      style.id = 'ui-enhancement-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        
        .toast-enter { animation: slideIn 0.3s ease-out; }
        .toast-exit { animation: slideOut 0.3s ease-out; }
        
        .skeleton-loader {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
        }
        
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        .fade-in {
          animation: fadeIn 0.3s ease-in;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .shake {
          animation: shake 0.5s;
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        .success-pulse {
          animation: successPulse 0.5s;
        }
        
        @keyframes successPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); background-color: #4caf5010; }
          100% { transform: scale(1); }
        }
        
        .loading-dots::after {
          content: '';
          animation: dots 1.5s steps(4, end) infinite;
        }
        
        @keyframes dots {
          0%, 20% { content: ''; }
          40% { content: '.'; }
          60% { content: '..'; }
          80%, 100% { content: '...'; }
        }
        
        .progress-bar-animated {
          position: relative;
          overflow: hidden;
        }
        
        .progress-bar-animated::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.3),
            transparent
          );
          animation: progress-shine 1.5s infinite;
        }
        
        @keyframes progress-shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Show a toast notification
   */
  showToast(message, type = 'info', duration = 5000, options = {}) {
    const id = Date.now().toString();
    const toast = document.createElement('div');
    toast.id = `toast-${id}`;
    toast.className = 'toast-enter';
    
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
      loading: '↻'
    };
    
    const colors = {
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800',
      info: '#2196f3',
      loading: '#9c27b0'
    };
    
    toast.style.cssText = `
      display: flex;
      align-items: center;
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-left: 4px solid ${colors[type]};
      min-width: 300px;
    `;
    
    const iconHtml = type === 'loading' 
      ? '<div class="spinner" style="width: 20px; height: 20px; margin-right: 12px;"></div>'
      : `<span style="font-size: 20px; margin-right: 12px; color: ${colors[type]};">${icons[type]}</span>`;
    
    toast.innerHTML = `
      ${iconHtml}
      <div style="flex: 1;">
        <div style="font-weight: 500; margin-bottom: 4px;">${options.title || type.charAt(0).toUpperCase() + type.slice(1)}</div>
        <div style="font-size: 14px; color: #666;">${message}</div>
        ${options.progress ? `
          <div style="margin-top: 8px; background: #e0e0e0; height: 3px; border-radius: 2px; overflow: hidden;">
            <div class="toast-progress" style="background: ${colors[type]}; height: 100%; width: 0%; transition: width 0.3s;"></div>
          </div>
        ` : ''}
      </div>
      ${options.closable !== false ? `
        <button onclick="uiEnhancements.removeToast('${id}')" style="
          background: none;
          border: none;
          font-size: 20px;
          color: #999;
          cursor: pointer;
          padding: 0;
          margin-left: 12px;
        ">×</button>
      ` : ''}
    `;
    
    document.getElementById('toast-container').appendChild(toast);
    this.toasts.push({ id, element: toast });
    
    // Auto remove if not loading type
    if (type !== 'loading' && duration > 0) {
      setTimeout(() => this.removeToast(id), duration);
    }
    
    return id;
  }

  /**
   * Update a toast (useful for loading states)
   */
  updateToast(id, message, type = 'info', progress = null) {
    const toast = document.getElementById(`toast-${id}`);
    if (!toast) return;
    
    const messageDiv = toast.querySelector('div > div:last-child');
    if (messageDiv) {
      messageDiv.textContent = message;
    }
    
    if (progress !== null) {
      const progressBar = toast.querySelector('.toast-progress');
      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }
    }
  }

  /**
   * Remove a toast
   */
  removeToast(id) {
    const toast = document.getElementById(`toast-${id}`);
    if (!toast) return;
    
    toast.className = 'toast-exit';
    setTimeout(() => {
      toast.remove();
      this.toasts = this.toasts.filter(t => t.id !== id);
    }, 300);
  }

  /**
   * Show global loading overlay
   */
  showLoading(message = 'Please wait', showProgress = false) {
    const overlay = document.getElementById('global-loading');
    const messageEl = document.getElementById('loading-message');
    const progressEl = document.getElementById('loading-progress');
    
    if (overlay) {
      overlay.style.display = 'flex';
      if (messageEl) messageEl.textContent = message;
      if (progressEl) progressEl.style.display = showProgress ? 'block' : 'none';
    }
  }

  /**
   * Hide global loading overlay
   */
  hideLoading() {
    const overlay = document.getElementById('global-loading');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  /**
   * Update loading progress
   */
  updateLoadingProgress(percent, message = null) {
    const bar = document.getElementById('loading-progress-bar');
    const text = document.getElementById('loading-progress-text');
    const messageEl = document.getElementById('loading-message');
    
    if (bar) bar.style.width = `${percent}%`;
    if (text) text.textContent = `${Math.round(percent)}%`;
    if (message && messageEl) messageEl.textContent = message;
  }

  /**
   * Show skeleton loader for content
   */
  showSkeletonLoader(container, rows = 5) {
    const skeleton = `
      <div class="skeleton-container" style="padding: 20px;">
        ${Array(rows).fill(0).map(() => `
          <div style="margin-bottom: 15px;">
            <div class="skeleton-loader" style="height: 20px; width: 30%; margin-bottom: 8px; border-radius: 4px;"></div>
            <div class="skeleton-loader" style="height: 16px; width: 80%; margin-bottom: 8px; border-radius: 4px;"></div>
            <div class="skeleton-loader" style="height: 16px; width: 60%; border-radius: 4px;"></div>
          </div>
        `).join('')}
      </div>
    `;
    
    if (typeof container === 'string') {
      container = document.getElementById(container);
    }
    
    if (container) {
      container.innerHTML = skeleton;
    }
  }

  /**
   * Create a progress bar
   */
  createProgressBar(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const progressId = `progress-${Date.now()}`;
    const progressHtml = `
      <div id="${progressId}" style="margin: 20px 0;">
        ${options.label ? `<div style="margin-bottom: 8px; font-weight: 500;">${options.label}</div>` : ''}
        <div style="background: #e0e0e0; height: ${options.height || '8px'}; border-radius: 4px; overflow: hidden;">
          <div class="progress-bar progress-bar-animated" style="
            background: ${options.color || 'hsl(var(--primary))'};
            height: 100%;
            width: 0%;
            transition: width 0.3s;
          "></div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 14px; color: #666;">
          <span class="progress-status">${options.status || 'Starting...'}</span>
          <span class="progress-percent">0%</span>
        </div>
      </div>
    `;
    
    container.innerHTML = progressHtml;
    this.progressBars.set(progressId, { container, options });
    
    return progressId;
  }

  /**
   * Update progress bar
   */
  updateProgressBar(progressId, percent, status = null) {
    const progressEl = document.getElementById(progressId);
    if (!progressEl) return;
    
    const bar = progressEl.querySelector('.progress-bar');
    const percentText = progressEl.querySelector('.progress-percent');
    const statusText = progressEl.querySelector('.progress-status');
    
    if (bar) bar.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${Math.round(percent)}%`;
    if (status && statusText) statusText.textContent = status;
    
    // Add success animation when complete
    if (percent >= 100) {
      setTimeout(() => {
        if (bar) bar.classList.add('success-pulse');
      }, 300);
    }
  }

  /**
   * Show confirmation dialog
   */
  async showConfirmation(title, message, options = {}) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10001;
      `;
      
      const type = options.type || 'info';
      const colors = {
        danger: '#f44336',
        warning: '#ff9800',
        info: '#2196f3',
        success: '#4caf50'
      };
      
      modal.innerHTML = `
        <div class="fade-in" style="
          background: white;
          padding: 24px;
          border-radius: 8px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        ">
          <h3 style="margin: 0 0 16px; color: ${colors[type] || '#333'};">
            ${title}
          </h3>
          <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
            ${message}
          </p>
          <div style="display: flex; justify-content: flex-end; gap: 12px;">
            <button id="confirm-cancel" style="
              padding: 8px 16px;
              border: 1px solid #ddd;
              background: white;
              border-radius: 4px;
              cursor: pointer;
            ">
              ${options.cancelText || 'Cancel'}
            </button>
            <button id="confirm-ok" style="
              padding: 8px 16px;
              border: none;
              background: ${colors[type] || colors.info};
              color: white;
              border-radius: 4px;
              cursor: pointer;
            ">
              ${options.confirmText || 'Confirm'}
            </button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const cleanup = () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 300);
      };
      
      document.getElementById('confirm-cancel').onclick = () => {
        cleanup();
        resolve(false);
      };
      
      document.getElementById('confirm-ok').onclick = () => {
        cleanup();
        resolve(true);
      };
    });
  }

  /**
   * Animate element on success
   */
  animateSuccess(element) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    
    if (element) {
      element.classList.add('success-pulse');
      setTimeout(() => {
        element.classList.remove('success-pulse');
      }, 500);
    }
  }

  /**
   * Animate element on error
   */
  animateError(element) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    
    if (element) {
      element.classList.add('shake');
      element.style.borderColor = '#f44336';
      setTimeout(() => {
        element.classList.remove('shake');
        element.style.borderColor = '';
      }, 500);
    }
  }

  /**
   * Show inline loading for buttons
   */
  setButtonLoading(button, loading = true, text = null) {
    if (typeof button === 'string') {
      button = document.getElementById(button);
    }
    
    if (!button) return;
    
    if (loading) {
      button.disabled = true;
      button.dataset.originalText = button.innerHTML;
      button.innerHTML = `
        <span style="display: inline-flex; align-items: center;">
          <span class="spinner" style="width: 16px; height: 16px; margin-right: 8px;"></span>
          ${text || 'Processing...'}
        </span>
      `;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  /**
   * Track operation for loading state
   */
  startOperation(name, description = '') {
    const id = Date.now().toString();
    this.activeOperations.set(id, {
      name,
      description,
      startTime: Date.now()
    });
    
    // Show loading indicator
    if (this.activeOperations.size === 1) {
      document.body.style.cursor = 'wait';
    }
    
    return id;
  }

  /**
   * Complete tracked operation
   */
  completeOperation(id, success = true) {
    const operation = this.activeOperations.get(id);
    if (!operation) return;
    
    const duration = Date.now() - operation.startTime;
    this.activeOperations.delete(id);
    
    // Reset cursor if no active operations
    if (this.activeOperations.size === 0) {
      document.body.style.cursor = '';
    }
    
    // Log performance
    console.log(`Operation "${operation.name}" completed in ${duration}ms`);
    
    return duration;
  }

  /**
   * Create a live counter
   */
  createCounter(element, targetValue, duration = 1000) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    
    if (!element) return;
    
    const startValue = parseInt(element.textContent) || 0;
    const increment = (targetValue - startValue) / (duration / 16);
    let currentValue = startValue;
    
    const interval = setInterval(() => {
      currentValue += increment;
      
      if ((increment > 0 && currentValue >= targetValue) || 
          (increment < 0 && currentValue <= targetValue)) {
        currentValue = targetValue;
        clearInterval(interval);
      }
      
      element.textContent = Math.round(currentValue);
    }, 16);
  }

  /**
   * Show tooltip
   */
  showTooltip(element, message, position = 'top') {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    
    if (!element) return;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip fade-in';
    tooltip.style.cssText = `
      position: absolute;
      background: #333;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
      white-space: nowrap;
    `;
    tooltip.textContent = message;
    
    document.body.appendChild(tooltip);
    
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    const positions = {
      top: {
        left: rect.left + (rect.width - tooltipRect.width) / 2,
        top: rect.top - tooltipRect.height - 8
      },
      bottom: {
        left: rect.left + (rect.width - tooltipRect.width) / 2,
        top: rect.bottom + 8
      },
      left: {
        left: rect.left - tooltipRect.width - 8,
        top: rect.top + (rect.height - tooltipRect.height) / 2
      },
      right: {
        left: rect.right + 8,
        top: rect.top + (rect.height - tooltipRect.height) / 2
      }
    };
    
    const pos = positions[position] || positions.top;
    tooltip.style.left = `${pos.left}px`;
    tooltip.style.top = `${pos.top}px`;
    
    // Auto remove after delay
    setTimeout(() => {
      tooltip.style.opacity = '0';
      setTimeout(() => tooltip.remove(), 300);
    }, 3000);
  }
}

// Create global instance
window.uiEnhancements = new UIEnhancements();
