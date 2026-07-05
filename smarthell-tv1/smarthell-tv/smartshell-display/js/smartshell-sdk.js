(function attachSmartShellSDK(globalScope) {
  "use strict";

  function key(name, fields) {
    return { key: name, fields: Array.isArray(fields) ? fields : [] };
  }

  function formatInput(value) {
    if (value === null) {
      return "null";
    }

    if (Array.isArray(value)) {
      return "[" + value.map(formatInput).join(", ") + "]";
    }

    var valueType = typeof value;

    if (valueType === "string") {
      return JSON.stringify(value);
    }

    if (valueType === "number" || valueType === "boolean") {
      return String(value);
    }

    if (valueType === "object") {
      var entries = Object.entries(value)
        .filter(function filterUndefined(entry) {
          return entry[1] !== undefined;
        })
        .map(function mapEntry(entry) {
          return entry[0] + ": " + formatInput(entry[1]);
        });

      return "{ " + entries.join(", ") + " }";
    }

    return "null";
  }

  function formatFields(fields, indent) {
    return fields
      .map(function formatField(field) {
        if (typeof field === "string") {
          return indent + field + "\n";
        }

        return (
          indent +
          field.key +
          " {\n" +
          formatFields(field.fields || [], indent + "  ") +
          indent +
          "}\n"
        );
      })
      .join("");
  }

  function buildRequest(type, name, fields, input, paginator) {
    var args = {};

    if (input && typeof input === "object") {
      Object.assign(args, input);
    }

    if (paginator && typeof paginator === "object") {
      Object.assign(args, paginator);
    }

    var argPairs = Object.entries(args).map(function mapArg(entry) {
      return entry[0] + ": " + formatInput(entry[1]);
    });

    var argBlock = argPairs.length ? "(" + argPairs.join(", ") + ")" : "";
    var fieldBlock = Array.isArray(fields) && fields.length
      ? " {\n" + formatFields(fields, "      ") + "    }"
      : "";

    return type + " SmartShellSdkRequest {\n    " + name + argBlock + fieldBlock + "\n}";
  }

  function isExpired(expiresAt) {
    if (!expiresAt) {
      return true;
    }

    return expiresAt * 1000 <= Date.now();
  }

  function extractMessage(errors) {
    if (!Array.isArray(errors) || !errors.length) {
      return "SmartShell API request failed";
    }

    var firstError = errors[0] || {};
    return firstError.message || "SmartShell API request failed";
  }

  function createApi(shell) {
    return {
      hostsOverview: function hostsOverview() {
        return shell.request("query", "hostsOverview", [
          "id",
          "group_id",
          "position",
          "alias",
          "in_service",
          "online",
          "locked",
          key("client_sessions", [
            "id",
            "started_at",
            "finished_at",
            "time_left",
          ]),
          key("bookings", [
            "id",
            "hosts",
            "from",
            "to",
            "startsIn",
            "group",
            "byClient",
          ]),
        ]);
      },

      getBookings: function getBookings(input, paginator) {
        return shell.request(
          "query",
          "getBookings",
          [
            key("data", [
              "id",
              "hosts",
              "from",
              "to",
              "startsIn",
              "group",
              "byClient",
            ]),
          ],
          { input: input || {} },
          paginator || { page: 1 }
        );
      },

      myClub: function myClub(input) {
        return shell.request("query", "myClub", [
          "id",
          "name",
          "address",
          "city",
          "club_phone",
          "host_count",
          "available_host_count",
          "logo_url",
        ], input || {});
      },
    };
  }

  function Shell(options) {
    var safeOptions = options || {};

    this.host = safeOptions.host || "billing";
    this.middlewares = Array.isArray(safeOptions.use)
      ? safeOptions.use.slice()
      : safeOptions.use
        ? [safeOptions.use]
        : [];
    this.errorHandler = typeof safeOptions.catch === "function"
      ? safeOptions.catch
      : null;
    this.credentials = safeOptions.credentials || null;
    this.anonymous = safeOptions.anonymous === true || !this.credentials;
    this._clubs = [];
    this._activeClub = null;
    this.api = createApi(this);
    this._ready = this._init();
  }

  Shell.prototype.ready = function ready() {
    return this._ready;
  };

  Shell.prototype.getClubIds = function getClubIds() {
    return this._clubs.map(function mapClub(club) {
      return club.id;
    });
  };

  Shell.prototype.getActiveClubId = function getActiveClubId() {
    return this._activeClub;
  };

  Shell.prototype.on = function on(id) {
    var numericId = Number(id);

    if (!Number.isFinite(numericId)) {
      return this;
    }

    var hasClub = this._clubs.some(function matchClub(club) {
      return club.id === numericId;
    });

    if (hasClub) {
      this._activeClub = numericId;
    }

    return this;
  };

  Shell.prototype.use = function use(middleware) {
    if (typeof middleware === "function") {
      this.middlewares.push(middleware);
    }

    return this;
  };

  Shell.prototype.catch = function registerCatch(handler) {
    this.errorHandler = typeof handler === "function" ? handler : null;
    return this;
  };

  Shell.prototype._handleErrors = function handleErrors(errors) {
    if (this.errorHandler) {
      this.errorHandler(errors);
      return;
    }

    throw new Error(extractMessage(errors));
  };

  Shell.prototype._init = async function init() {
    if (this.anonymous) {
      return;
    }

    var login = this.credentials && this.credentials.login;
    var password = this.credentials && this.credentials.password;

    if (!login || !password) {
      throw new Error("SmartShell credentials are missing");
    }

    if (this.host === "mobile-auth") {
      var mobileAuth = await this.call(
        "mutation Login { login(input: { login: " +
          formatInput(login) +
          ", password: " +
          formatInput(password) +
          " }) { access_token refresh_token expires_in } }"
      );

      this._clubs = [
        {
          id: 0,
          access_token: mobileAuth.login.access_token,
          refresh_token: mobileAuth.login.refresh_token,
          expires_in: Math.floor(Date.now() / 1000) + mobileAuth.login.expires_in,
        },
      ];
      this._activeClub = 0;
      return;
    }

    var clubsResponse = await this.call(
      "query UserClubs { userClubs(input: { login: " +
        formatInput(login) +
        ", password: " +
        formatInput(password) +
        " }) { id } }"
    );

    var clubs = Array.isArray(clubsResponse.userClubs)
      ? clubsResponse.userClubs
      : [];

    if (!clubs.length) {
      throw new Error("No SmartShell clubs available for these credentials");
    }

    var loadedClubs = [];

    for (var index = 0; index < clubs.length; index += 1) {
      var clubId = Number(clubs[index].id);
      var loginResponse = await this.call(
        "mutation Login { login(input: { login: " +
          formatInput(login) +
          ", password: " +
          formatInput(password) +
          ", company_id: " +
          clubId +
          " }) { access_token refresh_token expires_in } }"
      );

      loadedClubs.push({
        id: clubId,
        access_token: loginResponse.login.access_token,
        refresh_token: loginResponse.login.refresh_token,
        expires_in: Math.floor(Date.now() / 1000) + loginResponse.login.expires_in,
      });
    }

    this._clubs = loadedClubs;
    this._activeClub = loadedClubs[0].id;
  };

  Shell.prototype._refreshActiveClub = async function refreshActiveClub() {
    if (this.anonymous || this._activeClub === null) {
      return;
    }

    var activeClub = this._clubs.find(function findClub(club) {
      return club.id === this._activeClub;
    }, this);

    if (!activeClub || !isExpired(activeClub.expires_in)) {
      return;
    }

    var refreshed = await this.call(
      "mutation Update { updateToken(input: { access_token: " +
        formatInput(activeClub.access_token) +
        ", refresh_token: " +
        formatInput(activeClub.refresh_token) +
        " }) { access_token refresh_token expires_in } }",
      activeClub.access_token
    );

    activeClub.access_token = refreshed.updateToken.access_token;
    activeClub.refresh_token = refreshed.updateToken.refresh_token;
    activeClub.expires_in = Math.floor(Date.now() / 1000) + refreshed.updateToken.expires_in;
  };

  Shell.prototype.call = async function call(query, tokenOverride) {
    var endpoint = "https://" + this.host + ".smartshell.gg/api/graphql";
    var headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    var activeClub = this._clubs.find(function findClub(club) {
      return club.id === this._activeClub;
    }, this);

    var accessToken = tokenOverride || (activeClub && activeClub.access_token);

    if (!this.anonymous && accessToken) {
      headers.Authorization = "Bearer " + accessToken;
    }

    var response = await fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ query: query }),
    });

    var payload = await response.json();

    if (!response.ok || payload.errors) {
      this._handleErrors(payload.errors || [
        { message: "SmartShell API request failed with status " + response.status },
      ]);
      return null;
    }

    return payload.data;
  };

  Shell.prototype.request = async function request(type, name, fields, input, paginator) {
    if (this.anonymous) {
      throw new Error("Anonymous SmartShell shell cannot execute authenticated requests");
    }

    await this.ready();
    await this._refreshActiveClub();

    var query = buildRequest(type, name, fields, input, paginator);
    var responseData = await this.call(query);

    if (!responseData || !(name in responseData)) {
      return null;
    }

    var result = responseData[name];

    for (var index = 0; index < this.middlewares.length; index += 1) {
      result = this.middlewares[index](result, {
        type: type,
        name: name,
        input: input,
        paginator: paginator,
      });
    }

    return result;
  };

  globalScope.SmartShellSDK = {
    Shell: Shell,
    key: key,
  };
})(window);
