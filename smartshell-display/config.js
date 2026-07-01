// Smartshell Display Configuration
const CONFIG = {
    // API endpoint
    apiEndpoint: 'https://api.smartshell.gg/graphql',
    accessToken: '', // Your Smartshell access token
    
    // Refresh interval (ms)
    refreshInterval: 30000,
    
    // Zone names
    zones: [
        { id: 'zone-1', name: 'PS-1', icon: '🎮', color: '#e74c3c' },
        { id: 'zone-2', name: 'PS-2', icon: '🎮', color: '#3498db' },
        { id: 'zone-3', name: 'VIP', icon: '⭐', color: '#f1c40f' }
    ],
    
    // Background settings
    background: {
        default: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        active: 'linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #415a77 100%)',
        wallpaper: '' // Custom wallpaper URL
    },
    
    // PC card size
    cardSize: { width: 150, height: 110 }
};