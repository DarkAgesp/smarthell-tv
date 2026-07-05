const CLUB_NAME = 'Кибер Арена';
const SETTINGS_KEY = 'smartshell-display-settings';
const DEFAULT_DISPLAY_GROUPS = [
  { id: 8821, key: 'standart-b', title: 'Общий зал', order: 1 },
  { id: 8818, key: 'vip', title: 'VIP', order: 2 }
];
const PALETTE_PRESETS = {
  ice: {
    accentColor: '#64d7ff',
    surfaceColor: '#091a3a',
    textColor: '#f4fbff'
  },
  ember: {
    accentColor: '#ff7d60',
    surfaceColor: '#2c1232',
    textColor: '#fff7f1'
  },
  lime: {
    accentColor: '#91ff57',
    surfaceColor: '#071d31',
    textColor: '#f4fff1'
  },
  sunset: {
    accentColor: '#ffb14a',
    surfaceColor: '#28183d',
    textColor: '#fff8e8'
  },
  custom: null
};

function normalizeDisplayGroup(group, index) {
  const ids = Array.isArray(group.ids)
    ? group.ids.map((value) => Number(value)).filter(Number.isFinite)
    : [];
  const singleId = Number(group.id);

  if (Number.isFinite(singleId)) {
    ids.unshift(singleId);
  }

  return {
    key: group.key || `group-${index + 1}`,
    title: group.title || group.name || `Group ${index + 1}`,
    order: typeof group.order === 'number' ? group.order : index + 1,
    ids: [...new Set(ids)]
  };
}

class SmartShellDisplay {
  constructor() {
    this.hosts = [];
    this.displayGroups = DEFAULT_DISPLAY_GROUPS.map((group, index) => normalizeDisplayGroup(group, index));
    this.refreshTimer = null;
    this.clockTimer = null;
    this.isTVMode = false;
    this.settings = this.loadSettings();

    this.elements = {
      clubName: document.getElementById('clubName'),
      currentTime: document.getElementById('currentTime'),
      currentDate: document.getElementById('currentDate'),
      apiStatus: document.getElementById('apiStatus'),
      zonesContainer: document.getElementById('zonesContainer'),
      settingsToggle: document.getElementById('settingsToggle'),
      settingsPanel: document.getElementById('settingsPanel'),
      settingsBackdrop: document.getElementById('settingsBackdrop'),
      closeSettings: document.getElementById('closeSettings'),
      companyId: document.getElementById('companyId'),
      phone: document.getElementById('phone'),
      password: document.getElementById('password'),
      refreshInterval: document.getElementById('refreshInterval'),
      backgroundType: document.getElementById('backgroundType'),
      backgroundColor: document.getElementById('backgroundColor'),
      backgroundImage: document.getElementById('backgroundImage'),
      backgroundColorGroup: document.getElementById('backgroundColorGroup'),
      backgroundImageGroup: document.getElementById('backgroundImageGroup'),
      palettePreset: document.getElementById('palettePreset'),
      accentColor: document.getElementById('accentColor'),
      surfaceColor: document.getElementById('surfaceColor'),
      textColor: document.getElementById('textColor'),
      cardScale: document.getElementById('cardScale'),
      cardOpacity: document.getElementById('cardOpacity'),
      loginBtn: document.getElementById('loginBtn'),
      saveSettings: document.getElementById('saveSettings')
    };
  }

  async init() {
    this.applySettings();
    this.loadSavedCredentials();
    this.setupEventListeners();
    this.startClock();

    const params = new URLSearchParams(window.location.search);
    if (params.get('tv') === '1') {
      this.isTVMode = true;
      document.body.classList.add('tv-mode');
      if (params.get('fullscreen') === '1') {
        this.requestFullscreen();
      }
    }

    await this.fetchData();
    this.startAutoRefresh();
  }

  loadSettings() {
    const storedSettings = localStorage.getItem(SETTINGS_KEY);
    const defaults = {
      refreshInterval: 30000,
      backgroundType: 'gradient',
      backgroundColor: '#08111f',
      backgroundImage: '',
      palettePreset: 'ice',
      accentColor: PALETTE_PRESETS.ice.accentColor,
      surfaceColor: PALETTE_PRESETS.ice.surfaceColor,
      textColor: PALETTE_PRESETS.ice.textColor,
      cardScale: 1,
      cardOpacity: 58
    };

    if (!storedSettings) {
      return defaults;
    }

    try {
      return this.normalizeSettings({
        ...defaults,
        ...JSON.parse(storedSettings)
      });
    } catch (error) {
      console.error('Ошибка чтения настроек:', error);
      return defaults;
    }
  }

  normalizeSettings(settings) {
    const refreshInterval = Number(settings.refreshInterval);
    const normalizedRefresh = Number.isFinite(refreshInterval)
      ? (refreshInterval < 1000 ? refreshInterval * 1000 : refreshInterval)
      : 30000;
    const palettePreset = PALETTE_PRESETS[settings.palettePreset] ? settings.palettePreset : 'ice';
    const preset = PALETTE_PRESETS[palettePreset] || {};
    const cardScale = Number(settings.cardScale);
    const cardOpacity = Number(settings.cardOpacity);

    return {
      refreshInterval: Math.min(Math.max(normalizedRefresh, 10000), 300000),
      backgroundType: settings.backgroundType || 'gradient',
      backgroundColor: this.normalizeHexColor(settings.backgroundColor, '#08111f'),
      backgroundImage: settings.backgroundImage || '',
      palettePreset,
      accentColor: this.normalizeHexColor(settings.accentColor, preset.accentColor || '#64d7ff'),
      surfaceColor: this.normalizeHexColor(settings.surfaceColor, preset.surfaceColor || '#091a3a'),
      textColor: this.normalizeHexColor(settings.textColor, preset.textColor || '#f4fbff'),
      cardScale: Number.isFinite(cardScale) ? Math.min(Math.max(cardScale, 0.85), 1.35) : 1,
      cardOpacity: Number.isFinite(cardOpacity) ? Math.min(Math.max(cardOpacity, 35), 80) : 58
    };
  }

  normalizeHexColor(color, fallback) {
    if (typeof color !== 'string') {
      return fallback;
    }

    const normalized = color.trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized) ? normalized : fallback;
  }

  getConfiguredDisplayGroups() {
    const configuredGroups = typeof CONFIG !== 'undefined' && Array.isArray(CONFIG.displayGroups)
      ? CONFIG.displayGroups
      : DEFAULT_DISPLAY_GROUPS;

    return configuredGroups.map((group, index) => normalizeDisplayGroup(group, index));
  }

  getPalettePreset(name) {
    return PALETTE_PRESETS[name] || PALETTE_PRESETS.ice;
  }

  loadSavedCredentials() {
    const saved = localStorage.getItem('smartshell-credentials');
    if (!saved) {
      return;
    }

    try {
      const credentials = JSON.parse(saved);
      this.elements.companyId.value = credentials.companyId || '';
      this.elements.phone.value = credentials.phone || '';
      this.elements.password.value = credentials.password || '';
    } catch (error) {
      console.error('Ошибка чтения учетных данных:', error);
    }
  }

  applySettings() {
    this.elements.clubName.textContent = CLUB_NAME;
    this.elements.refreshInterval.value = Math.round(this.settings.refreshInterval / 1000);
    this.elements.backgroundType.value = this.settings.backgroundType;
    this.elements.backgroundColor.value = this.settings.backgroundColor;
    this.elements.palettePreset.value = this.settings.palettePreset;
    this.elements.accentColor.value = this.settings.accentColor;
    this.elements.surfaceColor.value = this.settings.surfaceColor;
    this.elements.textColor.value = this.settings.textColor;
    this.elements.cardScale.value = this.settings.cardScale;
    this.elements.cardOpacity.value = this.settings.cardOpacity;

    this.applyVisualSettings();
    this.toggleBackgroundInputs(this.settings.backgroundType);
    this.applyBackground();
  }

  applyVisualSettings() {
    const root = document.documentElement;
    root.style.setProperty('--accent-color', this.settings.accentColor);
    root.style.setProperty('--accent-rgb', this.hexToRgbString(this.settings.accentColor));
    root.style.setProperty('--surface-color', this.settings.surfaceColor);
    root.style.setProperty('--surface-rgb', this.hexToRgbString(this.settings.surfaceColor));
    root.style.setProperty('--text-primary', this.settings.textColor);
    root.style.setProperty('--text-rgb', this.hexToRgbString(this.settings.textColor));
    root.style.setProperty('--card-opacity', (this.settings.cardOpacity / 100).toFixed(2));
    root.style.setProperty('--card-scale', this.settings.cardScale.toFixed(2));
  }

  applyBackground() {
    const root = document.documentElement;
    root.style.setProperty('--background-color', this.settings.backgroundColor);
    root.style.setProperty('--background-overlay', this.buildBackgroundOverlay(this.settings.backgroundType));

    if (this.settings.backgroundType === 'image' && this.settings.backgroundImage) {
      root.style.setProperty('--background-image', `url("${this.settings.backgroundImage}")`);
      return;
    }

    root.style.setProperty('--background-image', 'none');
  }

  buildBackgroundOverlay(backgroundType) {
    const accentGlow = this.hexToRgba(
      this.settings.accentColor,
      backgroundType === 'image' ? 0.18 : 0.4
    );
    const supportGlow = this.hexToRgba(
      this.mixHexColors(this.settings.accentColor, '#ff7c59', 0.45),
      backgroundType === 'image' ? 0.14 : 0.34
    );
    const deepBase = this.hexToRgba(this.settings.backgroundColor, backgroundType === 'image' ? 0.06 : 0.22);
    const accentBase = this.hexToRgba(this.mixHexColors(this.settings.backgroundColor, this.settings.accentColor, 0.36), 1);
    const shadowBase = this.hexToRgba(this.mixHexColors(this.settings.surfaceColor, '#000000', 0.22), 1);

    if (backgroundType === 'image') {
      return [
        `radial-gradient(circle at 16% 20%, ${accentGlow}, transparent 28%)`,
        `radial-gradient(circle at 82% 14%, ${supportGlow}, transparent 26%)`,
        'linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.04))'
      ].join(', ');
    }

    return [
      `radial-gradient(circle at 16% 20%, ${accentGlow}, transparent 28%)`,
      `radial-gradient(circle at 82% 14%, ${supportGlow}, transparent 26%)`,
      `linear-gradient(135deg, ${deepBase} 0%, ${accentBase} 52%, ${shadowBase} 100%)`
    ].join(', ');
  }

  toggleBackgroundInputs(backgroundType) {
    this.elements.backgroundColorGroup.classList.toggle('hidden', backgroundType === 'image');
    this.elements.backgroundImageGroup.classList.toggle('hidden', backgroundType !== 'image');
  }

  setupEventListeners() {
    this.elements.settingsToggle.addEventListener('click', () => this.toggleSettings(true));
    this.elements.closeSettings.addEventListener('click', () => this.toggleSettings(false));
    this.elements.settingsBackdrop.addEventListener('click', () => this.toggleSettings(false));

    this.elements.backgroundType.addEventListener('change', (event) => {
      this.toggleBackgroundInputs(event.target.value);
    });

    this.elements.palettePreset.addEventListener('change', (event) => {
      const presetName = event.target.value;
      if (presetName === 'custom') {
        return;
      }

      const preset = this.getPalettePreset(presetName);
      this.elements.accentColor.value = preset.accentColor;
      this.elements.surfaceColor.value = preset.surfaceColor;
      this.elements.textColor.value = preset.textColor;
    });

    this.elements.backgroundImage.addEventListener('change', (event) => {
      const [file] = event.target.files || [];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        this.settings.backgroundImage = loadEvent.target.result;
      };
      reader.readAsDataURL(file);
    });

    this.elements.loginBtn.addEventListener('click', () => this.handleLoginSave());
    this.elements.saveSettings.addEventListener('click', () => this.handleSettingsSave());
  }

  toggleSettings(forceState) {
    const shouldOpen = typeof forceState === 'boolean'
      ? forceState
      : !this.elements.settingsPanel.classList.contains('visible');

    this.elements.settingsPanel.classList.toggle('visible', shouldOpen);
    this.elements.settingsBackdrop.classList.toggle('visible', shouldOpen);
  }

  async handleLoginSave() {
    const companyId = this.elements.companyId.value.trim();
    const phone = this.elements.phone.value.trim();
    const password = this.elements.password.value;

    if (!companyId || !phone || !password) {
      this.showNotification('Заполните Company ID, телефон и пароль.');
      return;
    }

    try {
      const result = await smartshellAPI.login(phone, password, Number(companyId));
      if (!result || !result.success) {
        throw new Error('Ошибка авторизации');
      }

      localStorage.setItem('smartshell-credentials', JSON.stringify({ companyId, phone, password }));
      this.showNotification('Данные для входа сохранены.');
      await this.fetchData();
    } catch (error) {
      console.error('Ошибка входа:', error);
      this.showNotification(`Не удалось сохранить вход: ${error.message}`);
    }
  }

  async handleSettingsSave() {
    this.settings = this.normalizeSettings({
      refreshInterval: Number(this.elements.refreshInterval.value) * 1000,
      backgroundType: this.elements.backgroundType.value,
      backgroundColor: this.elements.backgroundColor.value,
      backgroundImage: this.settings.backgroundImage,
      palettePreset: this.elements.palettePreset.value,
      accentColor: this.elements.accentColor.value,
      surfaceColor: this.elements.surfaceColor.value,
      textColor: this.elements.textColor.value,
      cardScale: Number(this.elements.cardScale.value),
      cardOpacity: Number(this.elements.cardOpacity.value)
    });

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    this.applySettings();
    this.startAutoRefresh();
    this.toggleSettings(false);
    this.showNotification('Настройки применены.');
    await this.fetchData();
  }

  startClock() {
    this.updateDateTime();

    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }

    this.clockTimer = setInterval(() => this.updateDateTime(), 1000);
  }

  updateDateTime() {
    const now = new Date();
    this.elements.currentTime.textContent = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);

    this.elements.currentDate.textContent = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(now);
  }

  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      this.fetchData();
    }, this.settings.refreshInterval);
  }

  async fetchData() {
    this.setConnectionState('Подключение...', '');

    try {
      if (!smartshellAPI.hasToken()) {
        this.renderDemoZones();
        this.setConnectionState('Демо режим', 'connected');
        return;
      }

      const rawHosts = await smartshellAPI.getHostsOverview();
      this.displayGroups = this.resolveDisplayGroups(rawHosts);

      const filteredHosts = this.filterDisplayHosts(rawHosts);
      const bookingMap = await this.fetchBookingMap(filteredHosts.map((host) => host.id));

      this.hosts = filteredHosts
        .map((host) => this.transformHost(host, bookingMap.get(host.id) || []))
        .filter(Boolean)
        .sort((first, second) => {
          if (first.zoneOrder !== second.zoneOrder) {
            return first.zoneOrder - second.zoneOrder;
          }

          if (first.number !== second.number) {
            return first.number - second.number;
          }

          return String(first.alias).localeCompare(String(second.alias), 'ru');
        });

      this.renderZones();
      this.setConnectionState(
        `Подключено • обновлено ${new Intl.DateTimeFormat('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        }).format(new Date())}`,
        'connected'
      );
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      this.renderDemoZones(`Нет данных API. ${error.message}`);
      this.setConnectionState('Ошибка подключения', 'error');
    }
  }

  async fetchBookingMap(hostIds) {
    if (!hostIds.length) {
      return new Map();
    }

    try {
      const response = await smartshellAPI.getBookings(hostIds, 'ACTIVE');
      const bookings = response?.getBookings?.data || response?.data || [];

      return bookings.reduce((map, booking) => {
        if (!map.has(booking.host_id)) {
          map.set(booking.host_id, []);
        }

        map.get(booking.host_id).push(booking);
        return map;
      }, new Map());
    } catch (error) {
      console.warn('Не удалось получить бронирования:', error);
      return new Map();
    }
  }

  resolveDisplayGroups(hosts) {
    const configuredGroups = this.getConfiguredDisplayGroups();
    const existingGroupIds = new Set((hosts || []).map((host) => Number(host.group_id)).filter(Number.isFinite));

    const matchedConfiguredGroups = configuredGroups
      .map((group) => {
        const matchedId = group.ids.find((id) => existingGroupIds.has(id));
        return matchedId ? { ...group, id: matchedId, ids: [matchedId] } : null;
      })
      .filter(Boolean);

    if (matchedConfiguredGroups.length === configuredGroups.length) {
      return matchedConfiguredGroups;
    }

    const groupedHosts = this.groupHostsById(hosts);
    const entries = [...groupedHosts.entries()].map(([groupId, groupHosts]) => ({
      groupId,
      hosts: groupHosts,
      vipScore: groupHosts.filter((host) => this.isVipAlias(host.alias)).length,
      consoleScore: groupHosts.filter((host) => this.isConsoleAlias(host.alias)).length
    }));

    const usedIds = new Set(matchedConfiguredGroups.flatMap((group) => group.ids));
    const resolvedByKey = new Map(matchedConfiguredGroups.map((group) => [group.key, group]));

    const vipTemplate = configuredGroups.find((group) => group.key === 'vip') || { key: 'vip', title: 'VIP', order: 2 };
    const standardTemplate = configuredGroups.find((group) => group.key === 'standart-b') || { key: 'standart-b', title: 'Общий зал', order: 1 };

    if (!resolvedByKey.has(vipTemplate.key)) {
      const vipCandidate = entries
        .filter((entry) => !usedIds.has(entry.groupId) && entry.vipScore > 0)
        .sort((left, right) => right.vipScore - left.vipScore || right.hosts.length - left.hosts.length)[0];

      if (vipCandidate) {
        resolvedByKey.set(vipTemplate.key, {
          ...vipTemplate,
          id: vipCandidate.groupId,
          ids: [vipCandidate.groupId]
        });
        usedIds.add(vipCandidate.groupId);
      }
    }

    if (!resolvedByKey.has(standardTemplate.key)) {
      const standardCandidate = entries
        .filter((entry) => !usedIds.has(entry.groupId))
        .sort((left, right) => {
          const leftPenalty = left.consoleScore === left.hosts.length ? 1 : 0;
          const rightPenalty = right.consoleScore === right.hosts.length ? 1 : 0;
          if (leftPenalty !== rightPenalty) {
            return leftPenalty - rightPenalty;
          }
          return right.hosts.length - left.hosts.length;
        })[0];

      if (standardCandidate) {
        resolvedByKey.set(standardTemplate.key, {
          ...standardTemplate,
          id: standardCandidate.groupId,
          ids: [standardCandidate.groupId]
        });
      }
    }

    const resolvedGroups = configuredGroups
      .map((group) => resolvedByKey.get(group.key))
      .filter(Boolean);

    return resolvedGroups.length ? resolvedGroups : configuredGroups;
  }

  groupHostsById(hosts) {
    return (hosts || []).reduce((map, host) => {
      const groupId = Number(host.group_id);
      if (!Number.isFinite(groupId)) {
        return map;
      }

      if (!map.has(groupId)) {
        map.set(groupId, []);
      }

      map.get(groupId).push(host);
      return map;
    }, new Map());
  }

  isVipAlias(alias) {
    return /vip/i.test(String(alias || ''));
  }

  isConsoleAlias(alias) {
    return /^(ps|playstation|xbox)/i.test(String(alias || ''));
  }

  filterDisplayHosts(hosts) {
    const allowedIds = new Set(this.displayGroups.flatMap((group) => group.ids).map((id) => Number(id)));
    return (hosts || []).filter((host) => allowedIds.has(Number(host.group_id)));
  }

  getGroupConfig(groupId) {
    return this.displayGroups.find((group) => group.ids.includes(Number(groupId))) || null;
  }

  getZoneTitle(group) {
    return group.key === 'standart-b' ? 'Общий зал' : group.title;
  }

  transformHost(host, bookings) {
    const group = this.getGroupConfig(host.group_id);
    if (!group) {
      return null;
    }

    const session = Array.isArray(host.client_sessions) ? host.client_sessions[0] : null;
    const resolvedBookings = this.normalizeBookings(this.mergeBookings(bookings, host.bookings));
    const booking = this.pickRelevantBooking(resolvedBookings);
    const status = this.resolveStatus(host, session, booking);
    const statusMeta = this.resolveStatusMeta(status, session, booking);

    return {
      id: host.id,
      alias: host.alias,
      number: this.extractDisplayNumber(host.alias, host.id),
      zoneKey: group.key,
      zoneTitle: this.getZoneTitle(group),
      zoneOrder: group.order,
      status,
      statusLabel: statusMeta.label,
      statusTime: statusMeta.time
    };
  }

  mergeBookings(...sources) {
    const merged = [];
    const seen = new Set();

    for (const source of sources) {
      if (!Array.isArray(source)) {
        continue;
      }

      for (const booking of source) {
        if (!booking) {
          continue;
        }

        const bookingKey = Number.isFinite(Number(booking.id))
          ? `id:${booking.id}`
          : `slot:${booking.from || booking.from_time || ''}:${booking.to || booking.to_time || ''}`;

        if (seen.has(bookingKey)) {
          continue;
        }

        seen.add(bookingKey);
        merged.push(booking);
      }
    }

    return merged;
  }

  normalizeBookings(bookings) {
    if (!Array.isArray(bookings)) {
      return [];
    }

    return bookings.map((booking) => ({
      ...booking,
      from_time: booking.from_time || booking.from || booking.start_time || booking.starts_at || booking.booked_at || null,
      to_time: booking.to_time || booking.to || booking.time_to || booking.end_at || booking.ends_at || null
    }));
  }

  pickRelevantBooking(bookings) {
    if (!Array.isArray(bookings) || !bookings.length) {
      return null;
    }

    return [...bookings].sort((first, second) => {
      const firstDate = this.getBookingSortTime(first);
      const secondDate = this.getBookingSortTime(second);
      return firstDate - secondDate;
    })[0];
  }

  getBookingSortTime(booking) {
    const fromDate = this.parseDateValue(booking?.from_time || booking?.from);
    if (fromDate) {
      return fromDate.getTime();
    }

    const toDate = this.parseDateValue(booking?.to_time || booking?.to);
    if (toDate) {
      return toDate.getTime();
    }

    const startsIn = Number(booking?.startsIn);
    if (Number.isFinite(startsIn)) {
      return Date.now() + (startsIn * 60 * 1000);
    }

    return Number.MAX_SAFE_INTEGER;
  }

  resolveStatus(host, session, booking) {
    if (session || (Array.isArray(host.client_sessions) && host.client_sessions.length > 0)) {
      return 'busy';
    }

    if (booking || (Array.isArray(host.bookings) && host.bookings.length > 0)) {
      return 'booked';
    }

    if (host.in_service) {
      return 'unavailable';
    }

    return 'free';
  }

  resolveStatusMeta(status, session, booking) {
    if (status === 'unavailable') {
      return { label: 'Недоступен', time: '' };
    }

    if (status === 'free') {
      return { label: 'Свободен', time: '' };
    }

    if (status === 'busy') {
      const busyUntil = this.extractTime([session, booking], [
        'to_time',
        'to',
        'time_to',
        'expires_at',
        'end_at',
        'ends_at',
        'finished_at'
      ]);

      return {
        label: busyUntil ? 'Занят до' : 'Занят',
        time: busyUntil || ''
      };
    }

    const bookingFrom = this.extractTime([booking], ['from_time', 'from', 'start_time', 'starts_at', 'booked_at', 'startsIn']);
    const bookingUntil = this.extractTime([booking], ['to_time', 'to', 'time_to', 'end_at', 'ends_at']);

    if (bookingFrom && bookingUntil) {
      return { label: 'Забронирован', time: `${bookingFrom} - ${bookingUntil}` };
    }

    if (bookingFrom) {
      return { label: 'Забронирован с', time: bookingFrom };
    }

    if (bookingUntil) {
      return { label: 'Забронирован до', time: bookingUntil };
    }

    return { label: 'Забронирован', time: '' };
  }

  extractTime(objects, fieldNames) {
    for (const object of objects) {
      if (!object) {
        continue;
      }

      for (const fieldName of fieldNames) {
        const value = object[fieldName];
        if (value === null || value === undefined || value === '') {
          continue;
        }

        if (fieldName === 'startsIn') {
          const startsIn = Number(value);
          if (Number.isFinite(startsIn)) {
            return this.formatTime(new Date(Date.now() + (startsIn * 60 * 1000)));
          }
        }

        const formattedTime = this.formatTimeValue(value);
        if (formattedTime) {
          return formattedTime;
        }
      }
    }

    return '';
  }

  formatTimeValue(value) {
    const parsedDate = this.parseDateValue(value);
    if (parsedDate) {
      return this.formatTime(parsedDate);
    }

    if (typeof value === 'string') {
      const timeMatch = value.match(/\b(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
      }
    }

    return '';
  }

  parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const timestamp = value > 1e12 ? value : value * 1000;
      const parsedNumberDate = new Date(timestamp);
      return Number.isNaN(parsedNumberDate.getTime()) ? null : parsedNumberDate;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return null;
    }

    const directDate = new Date(normalizedValue);
    if (!Number.isNaN(directDate.getTime())) {
      return directDate;
    }

    const isoLikeDate = new Date(normalizedValue.replace(' ', 'T'));
    if (!Number.isNaN(isoLikeDate.getTime())) {
      return isoLikeDate;
    }

    const datetimeMatch = normalizedValue.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
    );
    if (!datetimeMatch) {
      return null;
    }

    const [, year, month, day, hours, minutes, seconds = '00'] = datetimeMatch;
    const fallbackDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds)
    );

    return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
  }

  formatTime(date) {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  extractDisplayNumber(alias, fallbackId) {
    const match = String(alias || '').match(/\d+/);
    return match ? Number(match[0]) : Number(fallbackId);
  }

  renderDemoZones(errorMessage = '') {
    this.displayGroups = DEFAULT_DISPLAY_GROUPS.map((group, index) => normalizeDisplayGroup(group, index));
    this.hosts = [
      { id: 1, alias: 'PC 1', number: 1, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'free', statusLabel: 'Свободен', statusTime: '' },
      { id: 2, alias: 'PC 2', number: 2, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'busy', statusLabel: 'Занят до', statusTime: '22:15' },
      { id: 3, alias: 'PC 3', number: 3, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'booked', statusLabel: 'Забронирован', statusTime: '21:30 - 23:00' },
      { id: 4, alias: 'PC 4', number: 4, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'free', statusLabel: 'Свободен', statusTime: '' },
      { id: 5, alias: 'PC 5', number: 5, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'unavailable', statusLabel: 'Недоступен', statusTime: '' },
      { id: 6, alias: 'PC 6', number: 6, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'busy', statusLabel: 'Занят до', statusTime: '23:05' },
      { id: 7, alias: 'PC 7', number: 7, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'free', statusLabel: 'Свободен', statusTime: '' },
      { id: 8, alias: 'PC 8', number: 8, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'busy', statusLabel: 'Занят до', statusTime: '21:40' },
      { id: 9, alias: 'PC 9', number: 9, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'booked', statusLabel: 'Забронирован', statusTime: '22:10 - 00:10' },
      { id: 10, alias: 'PC 10', number: 10, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'free', statusLabel: 'Свободен', statusTime: '' },
      { id: 11, alias: 'PC 11', number: 11, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'free', statusLabel: 'Свободен', statusTime: '' },
      { id: 12, alias: 'PC 12', number: 12, zoneKey: 'standart-b', zoneTitle: 'Общий зал', zoneOrder: 1, status: 'busy', statusLabel: 'Занят до', statusTime: '00:15' },
      { id: 101, alias: 'VIP 1', number: 1, zoneKey: 'vip', zoneTitle: 'VIP', zoneOrder: 2, status: 'free', statusLabel: 'Свободен', statusTime: '' },
      { id: 102, alias: 'VIP 2', number: 2, zoneKey: 'vip', zoneTitle: 'VIP', zoneOrder: 2, status: 'booked', statusLabel: 'Забронирован', statusTime: '22:00 - 01:00' }
    ];

    this.renderZones(errorMessage);
  }

  renderZones(errorMessage = '') {
    if (errorMessage) {
      this.elements.zonesContainer.innerHTML = `<div class="empty-state">${errorMessage}</div>`;
      return;
    }

    if (!this.hosts.length) {
      this.elements.zonesContainer.innerHTML = '<div class="empty-state">Для выбранных зон хосты не найдены.</div>';
      return;
    }

    const sectionsHtml = [...this.displayGroups]
      .sort((left, right) => left.order - right.order)
      .map((group) => {
        const groupHosts = this.hosts.filter((host) => host.zoneKey === group.key);
        if (!groupHosts.length) {
          return '';
        }

        const cardsHtml = groupHosts.map((host) => this.renderHostCard(host)).join('');

        return `
          <section class="zone-section ${group.key}">
            <div class="zone-heading">
              <h2>${this.getZoneTitle(group)}</h2>
              <p>${groupHosts.length} хостов</p>
            </div>
            <div class="cards-grid">
              ${cardsHtml}
            </div>
          </section>
        `;
      })
      .filter(Boolean)
      .join('');

    this.elements.zonesContainer.innerHTML = sectionsHtml || '<div class="empty-state">Для выбранных зон хосты не найдены.</div>';
  }

  renderHostCard(host) {
    const statusTime = host.statusTime
      ? `<div class="pc-card-time">${host.statusTime}</div>`
      : '<div class="pc-card-time pc-card-time-empty">&nbsp;</div>';

    return `
      <article class="pc-card ${host.status}">
        <div class="pc-card-number">${host.number}</div>
        <div class="pc-card-status">${host.statusLabel}</div>
        ${statusTime}
      </article>
    `;
  }

  setConnectionState(text, stateClass) {
    this.elements.apiStatus.textContent = text;
    this.elements.apiStatus.classList.remove('connected', 'error');

    if (stateClass) {
      this.elements.apiStatus.classList.add(stateClass);
    }
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  async requestFullscreen() {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn('Не удалось включить полноэкранный режим:', error);
    }
  }

  hexToRgbString(hex) {
    const color = this.expandHex(hex).replace('#', '');
    const red = Number.parseInt(color.slice(0, 2), 16);
    const green = Number.parseInt(color.slice(2, 4), 16);
    const blue = Number.parseInt(color.slice(4, 6), 16);
    return `${red}, ${green}, ${blue}`;
  }

  hexToRgba(hex, alpha) {
    return `rgba(${this.hexToRgbString(hex)}, ${alpha})`;
  }

  expandHex(hex) {
    if (hex.length === 4) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }

    return hex;
  }

  mixHexColors(firstHex, secondHex, ratio = 0.5) {
    const first = this.expandHex(firstHex).replace('#', '');
    const second = this.expandHex(secondHex).replace('#', '');
    const clampedRatio = Math.min(Math.max(ratio, 0), 1);

    const mixedChannels = [0, 2, 4].map((start) => {
      const firstChannel = Number.parseInt(first.slice(start, start + 2), 16);
      const secondChannel = Number.parseInt(second.slice(start, start + 2), 16);
      const mixed = Math.round(firstChannel + ((secondChannel - firstChannel) * clampedRatio));
      return mixed.toString(16).padStart(2, '0');
    });

    return `#${mixedChannels.join('')}`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  window.smartShellDisplay = new SmartShellDisplay();
  await window.smartShellDisplay.init();
});
