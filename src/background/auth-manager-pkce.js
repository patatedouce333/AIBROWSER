"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManagerPKCE = void 0;
var token_store_1 = require("./token-store");
var OAUTH_CONFIG = {
    clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // TODO: Replace with actual client ID from GCP Console
    redirectUri: chrome.runtime.getURL(''), // Extension URL as redirect
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
};
var AuthManagerPKCE = /** @class */ (function () {
    function AuthManagerPKCE() {
    }
    AuthManagerPKCE.login = function () {
        return __awaiter(this, void 0, void 0, function () {
            var codeVerifier, codeChallenge, state, authUrl, responseUrl, url, code, returnedState, error, tokens, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        codeVerifier = this.generateCodeVerifier();
                        return [4 /*yield*/, this.generateCodeChallenge(codeVerifier)];
                    case 1:
                        codeChallenge = _a.sent();
                        // Store verifier for token exchange
                        this.codeVerifier = codeVerifier;
                        state = crypto.randomUUID();
                        authUrl = new URL(OAUTH_CONFIG.authEndpoint);
                        authUrl.searchParams.set('client_id', OAUTH_CONFIG.clientId);
                        authUrl.searchParams.set('redirect_uri', OAUTH_CONFIG.redirectUri);
                        authUrl.searchParams.set('response_type', 'code');
                        authUrl.searchParams.set('scope', OAUTH_CONFIG.scope);
                        authUrl.searchParams.set('state', state);
                        authUrl.searchParams.set('access_type', 'offline');
                        authUrl.searchParams.set('prompt', 'consent');
                        authUrl.searchParams.set('code_challenge', codeChallenge);
                        authUrl.searchParams.set('code_challenge_method', 'S256');
                        return [4 /*yield*/, chrome.identity.launchWebAuthFlow({
                                url: authUrl.toString(),
                                interactive: true,
                            })];
                    case 2:
                        responseUrl = _a.sent();
                        if (!responseUrl) {
                            throw new Error('OAuth flow cancelled');
                        }
                        url = new URL(responseUrl);
                        code = url.searchParams.get('code');
                        returnedState = url.searchParams.get('state');
                        if (returnedState !== state) {
                            throw new Error('State mismatch - possible CSRF attack');
                        }
                        if (!code) {
                            error = url.searchParams.get('error');
                            throw new Error("OAuth error: ".concat(error));
                        }
                        return [4 /*yield*/, this.exchangeCodeForTokens(code)];
                    case 3:
                        tokens = _a.sent();
                        // Store tokens securely
                        return [4 /*yield*/, token_store_1.TokenStore.save(tokens)];
                    case 4:
                        // Store tokens securely
                        _a.sent();
                        return [2 /*return*/, tokens.accessToken];
                    case 5:
                        error_1 = _a.sent();
                        console.error('Authentication failed:', error_1);
                        throw error_1;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    AuthManagerPKCE.refreshToken = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tokens, response, newTokens, updatedTokens, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 7]);
                        return [4 /*yield*/, token_store_1.TokenStore.get()];
                    case 1:
                        tokens = _a.sent();
                        if (!(tokens === null || tokens === void 0 ? void 0 : tokens.refreshToken)) {
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, fetch(OAUTH_CONFIG.tokenEndpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: new URLSearchParams({
                                    refresh_token: tokens.refreshToken,
                                    client_id: OAUTH_CONFIG.clientId,
                                    grant_type: 'refresh_token',
                                }),
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Token refresh failed: ".concat(response.status));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        newTokens = _a.sent();
                        updatedTokens = {
                            accessToken: newTokens.access_token,
                            refreshToken: tokens.refreshToken, // Keep the same refresh token
                            expiresAt: Date.now() + (newTokens.expires_in * 1000),
                            scope: newTokens.scope,
                        };
                        return [4 /*yield*/, token_store_1.TokenStore.save(updatedTokens)];
                    case 4:
                        _a.sent();
                        return [2 /*return*/, updatedTokens.accessToken];
                    case 5:
                        error_2 = _a.sent();
                        console.error('Token refresh failed:', error_2);
                        // Clear invalid tokens
                        return [4 /*yield*/, token_store_1.TokenStore.clear()];
                    case 6:
                        // Clear invalid tokens
                        _a.sent();
                        return [2 /*return*/, null];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    AuthManagerPKCE.getValidToken = function () {
        return __awaiter(this, void 0, void 0, function () {
            var token;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, token_store_1.TokenStore.getValidToken()];
                    case 1:
                        token = _a.sent();
                        if (!!token) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.refreshToken()];
                    case 2:
                        // Try to refresh token
                        token = _a.sent();
                        if (!!token) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.login()];
                    case 3:
                        // Need full authentication
                        token = _a.sent();
                        _a.label = 4;
                    case 4: return [2 /*return*/, token];
                }
            });
        });
    };
    AuthManagerPKCE.getStoredTokens = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, token_store_1.TokenStore.get()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    AuthManagerPKCE.logout = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, token_store_1.TokenStore.clear()];
                    case 1:
                        _a.sent();
                        this.codeVerifier = null;
                        return [2 /*return*/];
                }
            });
        });
    };
    AuthManagerPKCE.exchangeCodeForTokens = function (code) {
        return __awaiter(this, void 0, void 0, function () {
            var response, tokens;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.codeVerifier) {
                            throw new Error('Code verifier not found');
                        }
                        return [4 /*yield*/, fetch(OAUTH_CONFIG.tokenEndpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: new URLSearchParams({
                                    code: code,
                                    client_id: OAUTH_CONFIG.clientId,
                                    redirect_uri: OAUTH_CONFIG.redirectUri,
                                    grant_type: 'authorization_code',
                                    code_verifier: this.codeVerifier,
                                }),
                            })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Token exchange failed: ".concat(response.status));
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        tokens = _a.sent();
                        return [2 /*return*/, {
                                accessToken: tokens.access_token,
                                refreshToken: tokens.refresh_token,
                                expiresAt: Date.now() + (tokens.expires_in * 1000),
                                scope: tokens.scope,
                            }];
                }
            });
        });
    };
    // Generate cryptographically secure random string
    AuthManagerPKCE.generateCodeVerifier = function () {
        var array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64urlEncode(array);
    };
    // Generate SHA256 code challenge
    AuthManagerPKCE.generateCodeChallenge = function (verifier) {
        return __awaiter(this, void 0, void 0, function () {
            var encoder, data, digest;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        encoder = new TextEncoder();
                        data = encoder.encode(verifier);
                        return [4 /*yield*/, crypto.subtle.digest('SHA-256', data)];
                    case 1:
                        digest = _a.sent();
                        return [2 /*return*/, this.base64urlEncode(new Uint8Array(digest))];
                }
            });
        });
    };
    // Base64URL encoding
    AuthManagerPKCE.base64urlEncode = function (buffer) {
        var str = '';
        for (var i = 0; i < buffer.length; i++) {
            str += String.fromCharCode(buffer[i]);
        }
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    };
    AuthManagerPKCE.codeVerifier = null;
    return AuthManagerPKCE;
}());
exports.AuthManagerPKCE = AuthManagerPKCE;
