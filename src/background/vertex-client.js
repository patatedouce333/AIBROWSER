"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.VertexClient = void 0;
// Vertex AI client with streaming support
var request_queue_1 = require("./request-queue");
var auth_manager_pkce_1 = require("./auth-manager-pkce");
var VertexClient = /** @class */ (function () {
    function VertexClient() {
    }
    VertexClient.configure = function (config) {
        this.config = __assign(__assign({}, this.config), config);
    };
    VertexClient.generateContent = function (prompt_1) {
        return __awaiter(this, arguments, void 0, function (prompt, options) {
            var request;
            var _a, _b;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_c) {
                request = {
                    contents: [{
                            role: 'user',
                            parts: [{ text: prompt }]
                        }],
                    generationConfig: {
                        temperature: (_a = options.temperature) !== null && _a !== void 0 ? _a : 0.7,
                        maxOutputTokens: (_b = options.maxTokens) !== null && _b !== void 0 ? _b : 2048,
                    }
                };
                if (options.stream && options.onChunk) {
                    return [2 /*return*/, this.streamGenerateContent(request, options.onChunk)];
                }
                else {
                    return [2 /*return*/, this.singleGenerateContent(request)];
                }
                return [2 /*return*/];
            });
        });
    };
    VertexClient.singleGenerateContent = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var response, candidate;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, this.makeRequest('generateContent', request)];
                    case 1:
                        response = _d.sent();
                        if (!response.candidates || response.candidates.length === 0) {
                            throw new Error('No response from Vertex AI');
                        }
                        candidate = response.candidates[0];
                        if ((_c = (_b = (_a = candidate.content) === null || _a === void 0 ? void 0 : _a.parts) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text) {
                            return [2 /*return*/, candidate.content.parts[0].text];
                        }
                        throw new Error('Invalid response format from Vertex AI');
                }
            });
        });
    };
    VertexClient.streamGenerateContent = function (request, onChunk) {
        return __awaiter(this, void 0, void 0, function () {
            var fullResponse, streamRequest, response, text, words, _i, words_1, word;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        fullResponse = '';
                        streamRequest = __assign(__assign({}, request), { generationConfig: __assign({}, request.generationConfig) });
                        return [4 /*yield*/, this.makeRequest('streamGenerateContent', streamRequest)];
                    case 1:
                        response = _d.sent();
                        if (!(response.candidates && response.candidates.length > 0)) return [3 /*break*/, 6];
                        text = (_c = (_b = (_a = response.candidates[0].content) === null || _a === void 0 ? void 0 : _a.parts) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text;
                        if (!text) return [3 /*break*/, 6];
                        words = text.split(' ');
                        _i = 0, words_1 = words;
                        _d.label = 2;
                    case 2:
                        if (!(_i < words_1.length)) return [3 /*break*/, 5];
                        word = words_1[_i];
                        onChunk(word + ' ');
                        return [4 /*yield*/, this.sleep(50)];
                    case 3:
                        _d.sent(); // Simulate typing delay
                        _d.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        fullResponse = text;
                        _d.label = 6;
                    case 6: return [2 /*return*/, fullResponse];
                }
            });
        });
    };
    VertexClient.makeRequest = function (endpoint, request) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, this.queue.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
                        var token, url, response, errorText;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, auth_manager_pkce_1.AuthManagerPKCE.getValidToken()];
                                case 1:
                                    token = _a.sent();
                                    if (!token) {
                                        throw new Error('No valid authentication token');
                                    }
                                    url = "https://".concat(this.config.region, "-aiplatform.googleapis.com/v1/projects/").concat(this.config.projectId, "/locations/").concat(this.config.region, "/publishers/google/models/").concat(this.config.model, ":").concat(endpoint);
                                    return [4 /*yield*/, fetch(url, {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': "Bearer ".concat(token),
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify(request),
                                        })];
                                case 2:
                                    response = _a.sent();
                                    if (!!response.ok) return [3 /*break*/, 4];
                                    return [4 /*yield*/, response.text()];
                                case 3:
                                    errorText = _a.sent();
                                    throw new Error("Vertex AI API error ".concat(response.status, ": ").concat(errorText));
                                case 4: return [2 /*return*/, response.json()];
                            }
                        });
                    }); })];
            });
        });
    };
    VertexClient.sleep = function (ms) {
        return new Promise(function (r) { return setTimeout(r, ms); });
    };
    // Test connectivity and authentication
    VertexClient.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        console.log('Testing Vertex AI connection...');
                        return [4 /*yield*/, this.generateContent('Say "Hello World" in exactly 2 words.', {
                                maxTokens: 10,
                                temperature: 0
                            })];
                    case 1:
                        result = _a.sent();
                        console.log('Vertex AI test successful:', result);
                        return [2 /*return*/, result.toLowerCase().includes('hello world')];
                    case 2:
                        error_1 = _a.sent();
                        console.error('Vertex AI connection test failed:', error_1);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // Get current configuration
    VertexClient.getConfig = function () {
        return __assign({}, this.config);
    };
    // Update configuration
    VertexClient.updateConfig = function (config) {
        this.config = __assign(__assign({}, this.config), config);
        console.log('Vertex AI config updated:', this.config);
    };
    VertexClient.config = {
        projectId: 'your-project-id', // TODO: Make configurable
        region: 'us-central1',
        model: 'gemini-2.0-flash-exp', // Latest model
    };
    VertexClient.queue = new request_queue_1.RequestQueue();
    return VertexClient;
}());
exports.VertexClient = VertexClient;
