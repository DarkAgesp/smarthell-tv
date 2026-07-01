// SmartShell Display - Main Application

class SmartShellDisplay {
    constructor() {
        this.hosts = [];
        this.settings = this.loadSettings();
        this.refreshTimer = null;
        this.draggingCard = null;
        this.dragOffset = { x: 0, y: 0 };
    }

    // Load settings from localStorage
    loadSettings() {
        const saved = localStorage.getItem('smartshell_settings');
        return saved ? JSON.parse(saved) : {
            refreshInterval: 30,
            backgroundType: 'gradient',
            backgroundImage: '',
            backgroundColor: '#1a1a2e',
            clubName: 'GAME CLUB'
        };
    }

    // Save settings
    saveSettings(settings) {
        localStorage.setItem('smartshell_settings', JSON.stringify(settings));
        this.settings = { ...this.settings, ...settings };
    }

    // Initialize application
    async init() {
        // Apply settings
        this.applySettings();
        
        // Initialize drag and drop
        if (typeof dragDropManager !== 'undefined') {
            dragDropManager.init();
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Update time
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
        
        // Load saved login if exists
        const savedLogin = localStorage.getItem('smartshell_last_login');
        if (savedLogin) {
            const loginInput = document.getElementById('api-login');
            if (loginInput) loginInput.value = savedLogin;
        }
        
        // Fetch data
        await this.fetchData();
        
        // Start auto-refresh
        this.startAutoRefresh();
        
        // Check URL params for auto-TV mode
        if (window.location.search.includes('tv=1')) {
            this.toggleTVMode();
            this.toggleFullscreen();
        }
        
        // Show settings panel if requested
        if (window.location.search.includes('panel=login')) {
            setTimeout(() => this.toggleSettings(), 500);
        }
    }

    // Apply settings to UI
    applySettings() {
        const { backgroundType, backgroundImage, backgroundColor, clubName } = this.settings;
        
        const clubNameEl = document.querySelector('.club-name');
        if (clubNameEl) clubNameEl.textContent = clubName || 'GAME CLUB';
        
        const bgTypeEl = document.getElementById('bg-type');
        if (bgTypeEl) {
            bgTypeEl.value = backgroundType;
            this.toggleBgSettings(backgroundType);
        }
        
        const bgImageEl = document.getElementById('bg-image-url');
        if (bgImageEl && backgroundImage) bgImageEl.value = backgroundImage;
        
        const bgColorEl = document.getElementById('bg-color');
        if (bgColorEl && backgroundColor) bgColorEl.value = backgroundColor;
        
        this.applyBackground();
    }

    // Toggle background settings visibility
    toggleBgSettings(type) {
        const imageSetting = document.getElementById('bg-image-setting');
        const colorSetting = document.getElementById('bg-color-setting');
        if (imageSetting) imageSetting.style.display = type === 'image' ? 'flex' : 'none';
        if (colorSetting) colorSetting.style.display = type === 'solid' ? 'flex' : 'none';
    }

    // Apply background
    applyBackground() {
        const layer = document.getElementById('wallpaper-layer');
        if (!layer) return;
        
        const { backgroundType, backgroundImage, backgroundColor } = this.settings;
        
        switch (backgroundType) {
            case 'image':
                layer.style.background = `url(${backgroundImage})`;
                layer.style.backgroundSize = 'cover';
                layer.style.backgroundPosition = 'center';
                break;
            case 'solid':
                layer.style.background = backgroundColor;
                layer.style.backgroundSize = '';
                break;
            default:
                layer.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)';
                layer.style.backgroundSize = '';
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Login button
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.handleLogin());
        }
        
        // Background type change
        const bgType = document.getElementById('bg-type');
        if (bgType) {
            bgType.addEventListener('change', (e) => {
                this.toggleBgSettings(e.target.value);
            });
        }
        
        // Save settings button
        const saveBtn = document.getElementById('save-settings');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.handleSaveSettings());
        }
        
        // Close settings button
        const closeBtn = document.getElementById('close-settings');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggleSettings());
        }
        
        // Settings toggle
        const settingsToggle = document.getElementById('settings-toggle');
        if (settingsToggle) {
            settingsToggle.addEventListener('click', () => this.toggleSettings());
        }
    }

    // Handle login
    async handleLogin() {
        const loginInput = document.getElementById('api-login');
        const passwordInput = document.getElementById('api-password');
        const clubIdInput = document.getElementById('api-company-id');
        const statusEl = document.getElementById('login-status');
        
        if (!loginInput || !passwordInput) return;
        
        const phone = loginInput.value.trim();
        const password = passwordInput.value;
        const clubId = clubIdInput?.value || '4381';
        
        if (statusEl) statusEl.textContent = 'Вход...';
        
        try {
            const result = await smartshellAPI.login(phone, password, parseInt(clubId));
            
            if (result && result.access_token) {
                localStorage.setItem('smartshell_last_login', phone);
                if (statusEl) {
                    statusEl.textContent = '✓ Успешно!';
                    statusEl.style.color = '#22c55e';
                }
                
                // Refresh data
                setTimeout(() => {
                    this.fetchData();
                    this.toggleSettings();
                }, 1000);
            }
        } catch (error) {
            console.error('Login error:', error);
            if (statusEl) {
                statusEl.textContent = 'Ошибка: ' + (error.message || 'Неизвестная ошибка');
                statusEl.style.color = '#ef4444';
            }
        }
    }

    // Handle save settings
    handleSaveSettings() {
        const bgType = document.getElementById('bg-type');
        const bgImageUrl = document.getElementById('bg-image-url');
        const bgColor = document.getElementById('bg-color');
        const refreshInterval = document.getElementById('refresh-interval');
        
        const settings = {
            backgroundType: bgType?.value || 'gradient',
            backgroundImage: bgImageUrl?.value || '',
            backgroundColor: bgColor?.value || '#1a1a2e',
            refreshInterval: (refreshInterval?.value || 30) * 1000
        };
        
        this.saveSettings(settings);
        this.applySettings();
        this.startAutoRefresh();
        this.showNotification('Настройки сохранены!');
    }

    // Show notification
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#22c55e' : '#ef4444'};
            color: white;
            border-radius: 10px;
            font-weight: 600;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Update time display
    updateTime() {
        const now = new Date();
        const timeOptions = { hour: '2-digit', minute: '2-digit' };
        const timeStr = now.toLocaleTimeString('ru-RU', timeOptions);
        
        const timeEl = document.getElementById('current-time');
        if (timeEl) timeEl.textContent = timeStr;
    }

    // Fetch data from API
    async fetchData() {
        const statusEl = document.querySelector('.connection-status');
        const statusText = statusEl?.querySelector('.status-text');
        
        try {
            if (statusText) statusText.textContent = 'Загрузка...';
            
            // Check if we have a token
            if (!smartshellAPI.hasToken()) {
                this.loadDemoData();
                if (statusEl) {
                    statusEl.classList.remove('error');
                    statusEl.classList.add('connected');
                }
                if (statusText) statusText.textContent = 'Демо-режим';
                return;
            }
            
            // Fetch hosts overview
            const hosts = await smartshellAPI.getHostsOverview();
            
            // Transform API data to our format
            // Determine zone name based on group_id
            const zoneMap = {
                8817: 'PS-1',
                8818: 'VIP',
                8819: 'PS-2',
                8820: 'PS-3',
                8821: 'PC Зал'
            };
            
            this.hosts = hosts.map(host => {
                let status = 'free';
                
                if (host.in_service) {
                    status = 'maintenance';
                } else if (host.client_sessions && host.client_sessions.length > 0) {
                    status = 'busy';
                } else if (host.bookings && host.bookings.length > 0) {
                    status = 'booked';
                }
                
                // Determine type and zone
                let type = 'pc';
                let zoneName = zoneMap[host.group_id] || 'PC Зал';
                
                if (host.group_id === 8817 || host.group_id === 8819 || host.group_id === 8820) {
                    type = 'console';
                    zoneName = zoneMap[host.group_id] || 'PS-X';
                } else if (host.group_id === 8818) {
                    type = 'vip';
                }
                
                return {
                    id: host.id,
                    alias: host.alias || `PC-${host.id}`,
                    group_id: host.group_id,
                    zoneName: zoneName,
                    type: type,
                    status: status,
                    online: host.online
                };
            });
            
            // Update connection status
            if (statusEl) {
                statusEl.classList.remove('error');
                statusEl.classList.add('connected');
            }
            if (statusText) statusText.textContent = 'Подключено';
            
            // Render zones and cards
            this.renderZones();
            
        } catch (error) {
            console.error('Fetch error:', error);
            if (statusEl) {
                statusEl.classList.add('error');
                statusEl.classList.remove('connected');
            }
            if (statusText) statusText.textContent = 'Ошибка';
            
            this.loadDemoData();
        }
    }

    // Load demo data
    loadDemoData() {
        this.hosts = [
            // PS consoles (1 each)
            { id: 1, alias: 'PS-1', group_id: 8817, zoneName: 'PS-1', status: 'busy', type: 'console' },
            { id: 2, alias: 'PS-2', group_id: 8819, zoneName: 'PS-2', status: 'free', type: 'console' },
            { id: 3, alias: 'PS-3', group_id: 8820, zoneName: 'PS-3', status: 'free', type: 'console' },
            // PC Hall (12 PCs)
            { id: 10, alias: 'PC-1', group_id: 8821, zoneName: 'PC Зал', status: 'busy', type: 'pc' },
            { id: 11, alias: 'PC-2', group_id: 8821, zoneName: 'PC Зал', status: 'free', type: 'pc' },
            { id: 12, alias: 'PC-3', group_id: 8821, zoneName: 'PC Зал', status: 'busy', type: 'pc' },
            { id: 13, alias: 'PC-4', group_id: 8821, zoneName: 'PC Зал', status: 'free', type: 'pc' },
            { id: 14, alias: 'PC-5', group_id: 8821, zoneName: 'PC Зал', status: 'free', type: 'pc' },
            { id: 15, alias: 'PC-6', group_id: 8821, zoneName: 'PC Зал', status: 'busy', type: 'pc' },
            { id: 16, alias: 'PC-7', group_id: 8821, zoneName: 'PC Зал', status: 'free', type: 'pc' },
            { id: 17, alias: 'PC-8', group_id: 8821, zoneName: 'PC Зал', status: 'booked', type: 'pc' },
            { id: 18, alias: 'PC-9', group_id: 8821, zoneName: 'PC Зал', status: 'free', type: 'pc' },
            { id: 19, alias: 'PC-10', group_id: 8821, zoneName: 'PC Зал', status: 'free', type: 'pc' },
            { id: 20, alias: 'PC-11', group_id: 8821, zoneName: 'PC Зал', status: 'free', type: 'pc' },
            { id: 21, alias: 'PC-12', group_id: 8821, zoneName: 'PC Зал', status: 'busy', type: 'pc' },
            // VIP
            { id: 101, alias: 'VIP-1', group_id: 8818, zoneName: 'VIP', status: 'busy', type: 'vip' },
            { id: 102, alias: 'VIP-2', group_id: 8818, zoneName: 'VIP', status: 'free', type: 'vip' }
        ];
        
        this.renderZones();
    }

    // Render zones
    renderZones() {
        const container = document.getElementById('zones-container');
        if (!container) {
            console.error('zones-container not found');
            return;
        }
        
        // Group hosts by zone name
        const groups = {};
        this.hosts.forEach(h => {
            if (!groups[h.zoneName]) groups[h.zoneName] = [];
            groups[h.zoneName].push(h);
        });
        
        container.innerHTML = '';
        
        const zoneConfigs = {
            'PS-1': { icon: '🎮', color: '#e74c3c' },
            'PS-2': { icon: '🎮', color: '#3498db' },
            'PS-3': { icon: '🎮', color: '#9b59b6' },
            'PC Зал': { icon: '🖥️', color: '#2ecc71' },
            'VIP': { icon: '👑', color: '#f1c40f' }
        };
        
        Object.entries(groups).forEach(([zoneName, hosts]) => {
            const config = zoneConfigs[zoneName] || { icon: '🎮', color: '#666' };
            
            const freeCount = hosts.filter(h => h.status === 'free').length;
            const busyCount = hosts.filter(h => h.status === 'busy').length;
            const bookedCount = hosts.filter(h => h.status === 'booked').length;
            
            const zone = document.createElement('div');
            zone.className = `zone ${config.color === '#f1c40f' ? 'zone-vip' : ''}`;
            zone.innerHTML = `
                <div class="zone-header">
                    <span class="zone-icon">${config.icon}</span>
                    <h2 class="zone-name" style="color: ${config.color}">${zoneName}</h2>
                    <div class="zone-stats">
                        <span class="stat stat-free">○ ${freeCount} св.</span>
                        <span class="stat stat-busy">● ${busyCount} зан.</span>
                        ${bookedCount > 0 ? `<span class="stat stat-booked">📅 ${bookedCount} бронь</span>` : ''}
                    </div>
                </div>
                <div class="zone-grid drag-zone" data-zone-grid>
                    ${hosts.map(h => this.renderPCCard(h, config.color)).join('')}
                </div>
            `;
            container.appendChild(zone);
        });
        
        // Initialize drag for all cards
        this.initCardDrag();
    }

    // Initialize drag for cards
    initCardDrag() {
        const cards = document.querySelectorAll('.pc-card');
        const zones = document.querySelectorAll('.drag-zone');
        
        cards.forEach(card => {
            card.addEventListener('mousedown', (e) => this.startDrag(card, e));
            card.addEventListener('touchstart', (e) => this.startDrag(card, e), { passive: false });
        });
        
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.endDrag());
        document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
        document.addEventListener('touchend', () => this.endDrag());
    }

    startDrag(card, e) {
        if (e.target.closest('.settings-panel')) return;
        
        this.draggingCard = card;
        this.dragOffset = { x: e.clientX - card.offsetLeft, y: e.clientY - card.offsetTop };
        card.classList.add('dragging');
    }

    onDrag(e) {
        if (!this.draggingCard) return;
        e.preventDefault();
        
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        
        this.draggingCard.style.position = 'absolute';
        this.draggingCard.style.left = (x - this.dragOffset.x) + 'px';
        this.draggingCard.style.top = (y - this.dragOffset.y) + 'px';
        this.draggingCard.style.zIndex = '1000';
        this.draggingCard.style.opacity = '0.8';
    }

    endDrag() {
        if (!this.draggingCard) return;
        
        this.draggingCard.style.position = '';
        this.draggingCard.style.left = '';
        this.draggingCard.style.top = '';
        this.draggingCard.style.zIndex = '';
        this.draggingCard.style.opacity = '';
        this.draggingCard.classList.remove('dragging');
        
        this.draggingCard = null;
    }

    // Render PC card
    renderPCCard(host, zoneColor = '#666') {
        const statusClass = host.status;
        const statusText = host.status === 'busy' ? 'Занят' : host.status === 'booked' ? 'Бронь' : 'Свободен';
        const cardIcon = host.type === 'console' ? '🎮' : host.type === 'vip' ? '👑' : '🖥️';
        const isConsole = host.type === 'console';
        
        if (isConsole) {
            // Small square for consoles
            return `
                <div class="pc-card pc-console ${statusClass}" data-pc-id="${host.id}">
                    <div class="console-icon">${cardIcon}</div>
                    <div class="console-name">${host.alias}</div>
                    <div class="console-status ${statusClass}"></div>
                </div>
            `;
        }
        
        return `
            <div class="pc-card ${statusClass}" data-pc-id="${host.id}">
                <div class="pc-icon">${cardIcon}</div>
                <div class="pc-name">${host.alias}</div>
                <div class="pc-status ${statusClass}">
                    <span class="status-dot"></span>
                    <span class="status-label">${statusText}</span>
                </div>
            </div>
        `;
    }

    // Toggle settings panel
    toggleSettings() {
        var panel = document.getElementById('settings-panel');
        var backdrop = document.getElementById('settings-backdrop');
        
        if (!panel) {
            console.log('Panel not found!');
            return;
        }
        
        if (panel.style.display !== 'block') {
            panel.style.display = 'block';
            backdrop.style.display = 'block';
        } else {
            panel.style.display = 'none';
            backdrop.style.display = 'none';
        }
    }

    // Toggle TV mode
    toggleTVMode() {
        this.isTVMode = !this.isTVMode;
        document.body.classList.toggle('tv-mode', this.isTVMode);
        
        const settingsToggle = document.getElementById('settings-toggle');
        if (settingsToggle) {
            settingsToggle.style.display = this.isTVMode ? 'none' : 'block';
        }
    }

    // Toggle fullscreen
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
    
    // Direct toggle for debugging
    directToggle() {
        var panel = document.getElementById('settings-panel');
        var backdrop = document.getElementById('settings-backdrop');
        if (panel) {
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
            backdrop.style.display = panel.style.display;
            console.log('Panel now:', panel.style.display);
        }
    }

    // Start auto-refresh
    startAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        const interval = this.settings.refreshInterval || 30000;
        this.refreshTimer = setInterval(() => this.fetchData(), interval);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.smartshellDisplay = new SmartShellDisplay();
    window.smartshellDisplay.init();
});

// Global function for settings toggle
window.toggleSettingsPanel = function() {
    if (window.smartshellDisplay) {
        window.smartshellDisplay.toggleSettings();
    }
};

// Add animation styles dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);