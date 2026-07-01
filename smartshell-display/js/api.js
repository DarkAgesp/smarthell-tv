// Smartshell API Module
// Handles all GraphQL API communication

class SmartshellAPI {
    constructor() {
        // Using billing.smartshell.gg as per official SDK
        this.endpoint = 'https://billing.smartshell.gg/api/graphql';
        this.token = '';
        this.refreshToken = '';
        this.expiresAt = 0;
        this.connected = false;
        this.clubId = null;
    }

    // Login to Smartshell
    async login(login, password, companyId = null) {
        const mutation = `
            mutation login($input: LoginInput!) {
                login(input: $input) {
                    access_token
                    refresh_token
                    token_type
                    expires_in
                }
            }
        `;

        const variables = {
            input: {
                login: login,
                password: password
            }
        };

        if (companyId) {
            variables.input.company_id = companyId;
        }

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: mutation,
                    variables: variables
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                console.error('Login Errors:', result.errors);
                throw new Error(result.errors[0]?.message || 'Login failed');
            }

            const data = result.data?.login;
            if (data?.access_token) {
                this.token = data.access_token;
                this.refreshToken = data.refresh_token || '';
                this.expiresAt = Date.now() + (data.expires_in * 1000);
                this.connected = true;

                // Save to localStorage
                localStorage.setItem('smartshell_token', this.token);
                localStorage.setItem('smartshell_refresh', this.refreshToken);
                localStorage.setItem('smartshell_expires', this.expiresAt);
                localStorage.setItem('smartshell_login', login);

                return {
                    success: true,
                    token: this.token,
                    expiresIn: data.expires_in
                };
            }

            throw new Error('No access token received');
        } catch (error) {
            console.error('Login Error:', error);
            this.connected = false;
            throw error;
        }
    }

    // Refresh token
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        const mutation = `
            mutation refreshToken($input: RefreshTokenInput!) {
                refreshToken(input: $input) {
                    access_token
                    refresh_token
                    expires_in
                }
            }
        `;

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: mutation,
                    variables: {
                        input: {
                            refresh_token: this.refreshToken
                        }
                    }
                })
            });

            const result = await response.json();
            
            if (result.data?.refreshToken) {
                const data = result.data.refreshToken;
                this.token = data.access_token;
                this.refreshToken = data.refresh_token || this.refreshToken;
                this.expiresAt = Date.now() + (data.expires_in * 1000);

                localStorage.setItem('smartshell_token', this.token);
                localStorage.setItem('smartshell_refresh', this.refreshToken);
                localStorage.setItem('smartshell_expires', this.expiresAt);

                return true;
            }

            return false;
        } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        }
    }

    // Check and refresh token if needed
    async ensureValidToken() {
        if (!this.token) {
            // Try to load from localStorage
            this.token = localStorage.getItem('smartshell_token') || '';
            this.refreshToken = localStorage.getItem('smartshell_refresh') || '';
            this.expiresAt = parseInt(localStorage.getItem('smartshell_expires') || '0');
        }

        // Check if token is expired or about to expire (5 minutes buffer)
        if (this.expiresAt && Date.now() > this.expiresAt - 300000) {
            if (this.refreshToken) {
                const refreshed = await this.refreshAccessToken();
                if (!refreshed) {
                    throw new Error('Token expired and refresh failed');
                }
            } else {
                throw new Error('Token expired');
            }
        }
    }

    // Make GraphQL request
    async query(queryString, variables = {}) {
        await this.ensureValidToken();

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.token ? `Bearer ${this.token}` : ''
                },
                body: JSON.stringify({
                    query: queryString,
                    variables: variables
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                console.error('GraphQL Errors:', result.errors);
                throw new Error(result.errors[0]?.message || 'GraphQL Error');
            }

            return result.data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    // Get hosts with full session info
    async getHostsOverview() {
        const query = `
            query {
                hostsOverview {
                    id
                    group_id
                    alias
                    position
                    in_service
                    online
                    bookings { id }
                    client_sessions { id }
                }
            }
        `;
        
        const data = await this.query(query);
        return data?.hostsOverview || [];
    }

    // Get bookings for specific hosts
    async getBookings(hostIds, status = 'ACTIVE') {
        const query = `
            query getBookings($hostIds: [Int], $status: String) {
                getBookings(hostIds: $hostIds, status: $status) {
                    data {
                        id
                        host_id
                        client_id
                        from_time
                        to_time
                        status
                        client {
                            nickname
                            first_name
                            last_name
                        }
                    }
                }
            }
        `;
        
        return await this.query(query, { hostIds, status });
    }

    // Get clients
    async getClients() {
        const query = `
            query {
                clients {
                    data {
                        id
                        nickname
                        first_name
                        last_name
                        phone
                        deposit
                    }
                }
            }
        `;
        return await this.query(query);
    }

    // Get club info
    async getMyClub() {
        const query = `
            query {
                myClub {
                    id
                    title
                    address
                    phone
                }
            }
        `;
        return await this.query(query);
    }

    // Get services/pricing
    async getServices() {
        const query = `
            query {
                services {
                    id
                    name
                    price
                    unit
                }
            }
        `;
        return await this.query(query);
    }

    // Test connection
    async testConnection() {
        try {
            await this.getMyClub();
            this.connected = true;
            return true;
        } catch (error) {
            this.connected = false;
            return false;
        }
    }

    // Check if token exists
    hasToken() {
        return !!this.token || !!localStorage.getItem('smartshell_token');
    }

    // Logout
    logout() {
        this.token = '';
        this.refreshToken = '';
        this.expiresAt = 0;
        this.connected = false;
        localStorage.removeItem('smartshell_token');
        localStorage.removeItem('smartshell_refresh');
        localStorage.removeItem('smartshell_expires');
    }
}

// Global API instance
const smartshellAPI = new SmartshellAPI();