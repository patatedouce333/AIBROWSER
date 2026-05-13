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
// Main service worker entry point
var task_manager_1 = require("./task-manager");
var tab_manager_1 = require("./tab-manager");
var offscreen_manager_1 = require("./offscreen-manager");
var keep_alive_1 = require("./keep-alive");
var auth_manager_pkce_1 = require("./auth-manager-pkce");
var vertex_client_1 = require("./vertex-client");
console.log('Cometeor service worker loaded');
// Initialize managers
var taskManager = new task_manager_1.TaskManager();
var tabManager = new tab_manager_1.TabManager();
var offscreenManager = new offscreen_manager_1.OffscreenManager();
// Service worker lifecycle management
(0, keep_alive_1.startKeepAlive)();
// Message handlers
if (typeof chrome !== 'undefined' && chrome.runtime) {
    // Handle config updates from options page
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (message.type === 'CONFIG_UPDATED') {
            vertex_client_1.VertexClient.updateConfig(message.config);
            sendResponse({ success: true });
            return true;
        }
        if (message.type === 'TEST_CONNECTION') {
            vertex_client_1.VertexClient.testConnection().then(function (success) {
                sendResponse({ success: success });
            }).catch(function (error) {
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }
    });
    // Handle sidebar messages
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        (function () { return __awaiter(void 0, void 0, void 0, function () {
            var response, _a, task, tasks, tokenString, tokensObj, _b, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 13, , 14]);
                        response = void 0;
                        _a = message.type;
                        switch (_a) {
                            case 'START_TASK': return [3 /*break*/, 1];
                            case 'CANCEL_TASK': return [3 /*break*/, 3];
                            case 'GET_TASKS': return [3 /*break*/, 5];
                            case 'GET_AUTH_STATUS': return [3 /*break*/, 6];
                        }
                        return [3 /*break*/, 11];
                    case 1: return [4 /*yield*/, taskManager.createTask(message.description)];
                    case 2:
                        task = _c.sent();
                        response = { type: 'TASK_STARTED', task: task };
                        return [3 /*break*/, 12];
                    case 3: return [4 /*yield*/, taskManager.cancelTask(message.taskId)];
                    case 4:
                        _c.sent();
                        response = { type: 'TASK_CANCELLED', taskId: message.taskId };
                        return [3 /*break*/, 12];
                    case 5:
                        tasks = taskManager.getTasks();
                        response = { type: 'TASKS_LIST', tasks: tasks };
                        return [3 /*break*/, 12];
                    case 6: return [4 /*yield*/, auth_manager_pkce_1.AuthManagerPKCE.getValidToken()];
                    case 7:
                        tokenString = _c.sent();
                        if (!tokenString) return [3 /*break*/, 9];
                        return [4 /*yield*/, auth_manager_pkce_1.AuthManagerPKCE.getStoredTokens()];
                    case 8:
                        _b = _c.sent();
                        return [3 /*break*/, 10];
                    case 9:
                        _b = undefined;
                        _c.label = 10;
                    case 10:
                        tokensObj = _b;
                        response = { type: 'AUTH_STATUS', authenticated: !!tokenString, tokens: tokensObj || undefined };
                        return [3 /*break*/, 12];
                    case 11:
                        response = { type: 'TASK_FAILED', task: null };
                        _c.label = 12;
                    case 12:
                        sendResponse(response);
                        return [3 /*break*/, 14];
                    case 13:
                        error_1 = _c.sent();
                        console.error('Message handling error:', error_1);
                        sendResponse({ type: 'TASK_FAILED', task: { error: error_1.message } });
                        return [3 /*break*/, 14];
                    case 14: return [2 /*return*/];
                }
            });
        }); })();
        return true; // Keep message channel open for async response
    });
    // Handle content script messages
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        var _a;
        if (!((_a = sender.tab) === null || _a === void 0 ? void 0 : _a.id))
            return;
        (function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    switch (message.type) {
                        case 'DOM_SNAPSHOT':
                            taskManager.handleDomSnapshot(message.snapshot, sender.tab.id);
                            sendResponse({ success: true });
                            break;
                        case 'MUTATION_DETECTED':
                            taskManager.handleMutation(message.url, message.significant, sender.tab.id);
                            sendResponse({ success: true });
                            break;
                        case 'SPA_NAVIGATION':
                            taskManager.handleSpaNavigation(message.url, sender.tab.id);
                            sendResponse({ success: true });
                            break;
                        case 'ACTION_RESULT':
                            // Action result is handled by ActionExecutor via promises
                            sendResponse({ success: true });
                            break;
                        default:
                            sendResponse({ error: 'Unknown background message type' });
                    }
                }
                catch (error) {
                    console.error('Content message handling error:', error);
                    sendResponse({ error: error.message });
                }
                return [2 /*return*/];
            });
        }); })();
        return true;
    });
    // Tab management
    chrome.tabs.onActivated.addListener(function (activeInfo) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            tab_manager_1.TabManager.setActiveTab(activeInfo.tabId);
            return [2 /*return*/];
        });
    }); });
    chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (changeInfo.status === 'complete' && tab.url) {
                tab_manager_1.TabManager.handleTabUpdate(tabId, tab.url);
            }
            return [2 /*return*/];
        });
    }); });
    // Extension lifecycle
    chrome.runtime.onInstalled.addListener(function () { return __awaiter(void 0, void 0, void 0, function () {
        var error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Cometeor extension installed');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, vertex_client_1.VertexClient.testConnection()];
                case 2:
                    _a.sent();
                    console.log('Vertex AI connection test successful');
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    console.warn('Vertex AI connection test failed:', error_2);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    chrome.runtime.onSuspend.addListener(function () {
        console.log('Cometeor service worker suspending');
        (0, keep_alive_1.stopKeepAlive)();
    });
}
