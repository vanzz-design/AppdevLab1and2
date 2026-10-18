/* VRC Labs: shared demo logic for the authentication and authorization pages.
   DEMO ONLY. Real systems never keep users, salts, or signing secrets in browser code.
   In the Vacant Room Checker, Supabase Auth does all of this on the server. */
var AuthCore = (function () {
  "use strict";

  var enc = new TextEncoder();
  var dec = new TextDecoder();

  var SECRET = "vrc-demo-signing-secret";      // the server would keep this private
  var TOKEN_MINUTES = 10;
  var SESSION_KEY = "vrc-demo-token";
  var ROLE_KEY = "vrc-demo-roles";

  // Authentication data: who exists and how to check their password.
  var USERS = [
    { id: 'u-1001', email: 'student@vrc.demo', name: 'Juan Dela Cruz', salt: 'k3Vq9x', hash: '92aac81fd9ed063ca84aae024b3ae6170095e5f8474c539633c6fec62c143d29' },
    { id: 'u-1002', email: 'admin@vrc.demo', name: 'Campus Admin', salt: 'm7Zt2p', hash: 'd3465544b4e9d0f07b038ce3c6e97b9c16db490eff58849d6af28f038cd42a2c' }
  ];

  // Authorization data: what each identity may do. Kept apart from the login record,
  // like the profiles table in our database.
  var DEFAULT_ROLES = { "u-1001": "user", "u-1002": "admin" };

  function available() {
    return !!(window.crypto && window.crypto.subtle);
  }

  function toHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function b64url(bytes) {
    var bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlToBytes(text) {
    var s = text.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function sha256(text) {
    return crypto.subtle.digest("SHA-256", enc.encode(text)).then(toHex);
  }

  function hmacKey(usage) {
    return crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, usage);
  }

  function sign(data) {
    return hmacKey(["sign"]).then(function (key) {
      return crypto.subtle.sign("HMAC", key, enc.encode(data));
    }).then(function (sig) { return b64url(new Uint8Array(sig)); });
  }

  /* ----- Authentication ----- */
  function findUser(email) {
    var wanted = String(email || "").trim().toLowerCase();
    for (var i = 0; i < USERS.length; i++) {
      if (USERS[i].email === wanted) return USERS[i];
    }
    return null;
  }

  // Returns { ok, user, reason }. The reason is for the server log only.
  function authenticate(email, password) {
    var user = findUser(email);
    if (!user) {
      return Promise.resolve({ ok: false, step: 2, reason: "No account exists for that email." });
    }
    return sha256(user.salt + password).then(function (hash) {
      if (hash !== user.hash) {
        return { ok: false, step: 3, user: user, reason: "Password hash does not match the stored hash." };
      }
      return { ok: true, user: user };
    });
  }

  function issueToken(user) {
    var now = Math.floor(Date.now() / 1000);
    var header = { alg: "HS256", typ: "JWT" };
    var payload = { sub: user.id, email: user.email, name: user.name, iat: now, exp: now + TOKEN_MINUTES * 60 };
    var head = b64url(enc.encode(JSON.stringify(header)));
    var body = b64url(enc.encode(JSON.stringify(payload)));
    return sign(head + "." + body).then(function (sig) { return head + "." + body + "." + sig; });
  }

  function splitToken(token) {
    var parts = String(token || "").split(".");
    return parts.length === 3 ? parts : null;
  }

  function decode(token) {
    var parts = splitToken(token);
    if (!parts) return null;
    try {
      return {
        header: JSON.parse(dec.decode(b64urlToBytes(parts[0]))),
        payload: JSON.parse(dec.decode(b64urlToBytes(parts[1]))),
        parts: parts
      };
    } catch (e) {
      return null;
    }
  }

  // Checks signature and expiry. Returns { valid, payload, reason }.
  function verifyToken(token) {
    var decoded = decode(token);
    if (!decoded) return Promise.resolve({ valid: false, reason: "Token is missing or malformed." });
    return sign(decoded.parts[0] + "." + decoded.parts[1]).then(function (expected) {
      if (expected !== decoded.parts[2]) return { valid: false, reason: "Signature does not match." };
      if (decoded.payload.exp * 1000 < Date.now()) return { valid: false, reason: "Session expired." };
      return { valid: true, payload: decoded.payload };
    });
  }

  /* ----- Session (kept in sessionStorage, cleared when the tab closes) ----- */
  function saveSession(token) { sessionStorage.setItem(SESSION_KEY, token); }
  function loadSession() { return sessionStorage.getItem(SESSION_KEY); }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  /* ----- Authorization data ----- */
  function overrides() {
    try { return JSON.parse(sessionStorage.getItem(ROLE_KEY) || "{}"); } catch (e) { return {}; }
  }
  function getRole(sub) {
    var o = overrides();
    return o[sub] || DEFAULT_ROLES[sub] || "user";
  }
  function setRole(sub, role) {
    var o = overrides();
    o[sub] = role;
    sessionStorage.setItem(ROLE_KEY, JSON.stringify(o));
  }

  return {
    available: available,
    users: USERS,
    authenticate: authenticate,
    issueToken: issueToken,
    verifyToken: verifyToken,
    decode: decode,
    saveSession: saveSession,
    loadSession: loadSession,
    clearSession: clearSession,
    getRole: getRole,
    setRole: setRole,
    TOKEN_MINUTES: TOKEN_MINUTES
  };
})();
