const SMARTSHELL_CREDENTIALS_KEY = 'smartshell-credentials';

class SmartshellAPI {
  constructor() {
    this.shell = null;
    this.activeClubId = null;
  }

  hasToken() {
    if (this.shell) {
      return true;
    }

    return Boolean(localStorage.getItem(SMARTSHELL_CREDENTIALS_KEY));
  }

  async login(login, password, companyId = null) {
    const shell = new window.SmartShellSDK.Shell({
      credentials: { login, password },
      host: 'billing'
    });

    await shell.ready();

    const availableClubIds = shell.getClubIds();
    const preferredClubId = Number(companyId);
    const resolvedClubId = Number.isFinite(preferredClubId) && availableClubIds.includes(preferredClubId)
      ? preferredClubId
      : availableClubIds[0];

    if (!resolvedClubId) {
      throw new Error('Для аккаунта не найдено ни одного клуба');
    }

    shell.on(resolvedClubId);

    this.shell = shell;
    this.activeClubId = resolvedClubId;

    return {
      success: true,
      clubId: resolvedClubId,
      clubs: availableClubIds
    };
  }

  async ensureShell() {
    if (this.shell) {
      return this.shell;
    }

    const storedCredentials = localStorage.getItem(SMARTSHELL_CREDENTIALS_KEY);
    if (!storedCredentials) {
      return null;
    }

    let credentials;

    try {
      credentials = JSON.parse(storedCredentials);
    } catch (error) {
      console.error('Ошибка чтения сохранённых учётных данных SmartShell:', error);
      return null;
    }

    if (!credentials?.phone || !credentials?.password) {
      return null;
    }

    await this.login(credentials.phone, credentials.password, Number(credentials.companyId));
    return this.shell;
  }

  async getHostsOverview() {
    const shell = await this.ensureShell();
    if (!shell) {
      throw new Error('SmartShell не авторизован');
    }

    const hosts = await shell.api.hostsOverview();
    return Array.isArray(hosts) ? hosts : [];
  }

  async getBookings(hostIds, status = 'ACTIVE') {
    const shell = await this.ensureShell();
    if (!shell) {
      throw new Error('SmartShell не авторизован');
    }

    const response = await shell.api.getBookings({
      hostIds: hostIds.map((id) => Number(id)).filter(Number.isFinite),
      status
    });

    const bookings = Array.isArray(response?.data) ? response.data : [];
    const normalizedBookings = bookings.flatMap((booking) => {
      const bookingHostIds = Array.isArray(booking.hosts)
        ? booking.hosts.map((id) => Number(id)).filter(Number.isFinite)
        : [];

      return bookingHostIds.map((hostId) => ({
        ...booking,
        host_id: hostId,
        from_time: booking.from || booking.from_time || null,
        to_time: booking.to || booking.to_time || null
      }));
    });

    return { data: normalizedBookings };
  }

  async getMyClub() {
    const shell = await this.ensureShell();
    if (!shell) {
      throw new Error('SmartShell не авторизован');
    }

    const clubId = this.activeClubId || shell.getActiveClubId();
    if (!clubId) {
      throw new Error('Не удалось определить активный клуб');
    }

    return shell.api.myClub({ id: clubId });
  }

  logout() {
    this.shell = null;
    this.activeClubId = null;
  }
}

const smartshellAPI = new SmartshellAPI();
