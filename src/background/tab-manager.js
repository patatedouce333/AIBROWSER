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
exports.TabManager = void 0;
// Tab management utilities for content script injection and navigation detection
var TabManager = /** @class */ (function () {
    function TabManager() {
    }
    TabManager.setActiveTab = function (tabId) {
        this.activeTabId = tabId;
    };
    TabManager.handleTabUpdate = function (tabId, url) {
        // Handle tab URL changes for SPA detection
        console.log("Tab ".concat(tabId, " updated to ").concat(url));
    };
    TabManager.ensureContentScript = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var MAX_WAIT, POLL_INTERVAL, start, response, _a, injectError_1;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        MAX_WAIT = 10000;
                        POLL_INTERVAL = 200;
                        start = Date.now();
                        console.log("Ensuring content script ready in tab ".concat(tabId));
                        _c.label = 1;
                    case 1:
                        if (!(Date.now() - start < MAX_WAIT)) return [3 /*break*/, 12];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 10]);
                        return [4 /*yield*/, chrome.tabs.sendMessage(tabId, { type: 'PING' })];
                    case 3:
                        response = _c.sent();
                        if (response === null || response === void 0 ? void 0 : response.pong) {
                            console.log("Content script ready in tab ".concat(tabId));
                            return [2 /*return*/];
                        }
                        return [3 /*break*/, 10];
                    case 4:
                        _a = _c.sent();
                        _c.label = 5;
                    case 5:
                        _c.trys.push([5, 8, , 9]);
                        return [4 /*yield*/, chrome.scripting.executeScript({
                                target: { tabId: tabId },
                                files: ['content.js'],
                            })];
                    case 6:
                        _c.sent();
                        // Give it time to initialize
                        return [4 /*yield*/, this.sleep(100)];
                    case 7:
                        // Give it time to initialize
                        _c.sent();
                        return [3 /*break*/, 1];
                    case 8:
                        injectError_1 = _c.sent();
                        if ((_b = injectError_1.message) === null || _b === void 0 ? void 0 : _b.includes('Cannot access')) {
                            throw new Error("Cannot inject into protected page in tab ".concat(tabId));
                        }
                        return [3 /*break*/, 9];
                    case 9: return [3 /*break*/, 10];
                    case 10: return [4 /*yield*/, this.sleep(POLL_INTERVAL)];
                    case 11:
                        _c.sent();
                        return [3 /*break*/, 1];
                    case 12: throw new Error("Content script not ready in tab ".concat(tabId, " after ").concat(MAX_WAIT, "ms"));
                }
            });
        });
    };
    TabManager.waitForNavigation = function (tabId_1) {
        return __awaiter(this, arguments, void 0, function (tabId, timeoutMs) {
            if (timeoutMs === void 0) { timeoutMs = 15000; }
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var timeout = setTimeout(function () {
                            chrome.tabs.onUpdated.removeListener(listener);
                            reject(new Error('Navigation timeout'));
                        }, timeoutMs);
                        var listener = function (updatedTabId, changeInfo) {
                            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                                clearTimeout(timeout);
                                chrome.tabs.onUpdated.removeListener(listener);
                                // Small delay for scripts to initialize
                                setTimeout(resolve, 300);
                            }
                        };
                        chrome.tabs.onUpdated.addListener(listener);
                    })];
            });
        });
    };
    TabManager.detectNavigation = function (tabId_1, action_1) {
        return __awaiter(this, arguments, void 0, function (tabId, action, timeoutMs) {
            var tabBefore, urlBefore, navigated, newUrl, navigationPromise;
            if (timeoutMs === void 0) { timeoutMs = 3000; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, chrome.tabs.get(tabId)];
                    case 1:
                        tabBefore = _a.sent();
                        urlBefore = tabBefore.url;
                        navigated = false;
                        navigationPromise = new Promise(function (resolve) {
                            var listener = function (updatedTabId, changeInfo, tab) {
                                if (updatedTabId === tabId && changeInfo.url && changeInfo.url !== urlBefore) {
                                    navigated = true;
                                    newUrl = changeInfo.url;
                                    chrome.tabs.onUpdated.removeListener(listener);
                                    resolve();
                                }
                            };
                            chrome.tabs.onUpdated.addListener(listener);
                            // Timeout if no navigation
                            setTimeout(function () {
                                chrome.tabs.onUpdated.removeListener(listener);
                                resolve();
                            }, timeoutMs);
                        });
                        return [4 /*yield*/, action()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, navigationPromise];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, { navigated: navigated, newUrl: newUrl }];
                }
            });
        });
    };
    TabManager.getActiveTab = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tabs;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, chrome.tabs.query({ active: true, currentWindow: true })];
                    case 1:
                        tabs = _a.sent();
                        if (!tabs[0]) {
                            throw new Error('No active tab found');
                        }
                        return [2 /*return*/, tabs[0]];
                }
            });
        });
    };
    TabManager.sleep = function (ms) {
        return new Promise(function (r) { return setTimeout(r, ms); });
    };
    TabManager.activeTabId = null;
    return TabManager;
}());
exports.TabManager = TabManager;
