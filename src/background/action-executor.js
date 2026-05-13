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
exports.ActionExecutor = void 0;
var ActionExecutor = /** @class */ (function () {
    function ActionExecutor() {
    }
    ActionExecutor.executePlan = function (plan, tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var results, _i, _a, action, result, error_1;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log("Executing plan with ".concat(plan.actions.length, " actions"));
                        results = [];
                        _i = 0, _a = plan.actions;
                        _c.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 7];
                        action = _a[_i];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 5, , 6]);
                        console.log("Executing action: ".concat(action.type, " - ").concat(action.description));
                        return [4 /*yield*/, this.executeAction(action, tabId)];
                    case 3:
                        result = _c.sent();
                        results.push({ action: action, success: true, result: result });
                        // Small delay between actions for stability
                        return [4 /*yield*/, this.sleep(500)];
                    case 4:
                        // Small delay between actions for stability
                        _c.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        error_1 = _c.sent();
                        console.error("Action failed: ".concat(action.type), error_1);
                        results.push({ action: action, success: false, error: error_1.message });
                        // Continue with next action unless it's critical
                        if (action.type === 'click' && ((_b = action.description) === null || _b === void 0 ? void 0 : _b.includes('submit'))) {
                            // For critical actions, might want to stop
                            throw error_1;
                        }
                        return [3 /*break*/, 6];
                    case 6:
                        _i++;
                        return [3 /*break*/, 1];
                    case 7: return [2 /*return*/, { results: results, completed: true }];
                }
            });
        });
    };
    ActionExecutor.executeAction = function (action, tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (action.type) {
                    case 'click':
                        return [2 /*return*/, this.executeClick(action, tabId)];
                    case 'type':
                        return [2 /*return*/, this.executeType(action, tabId)];
                    case 'select':
                        return [2 /*return*/, this.executeSelect(action, tabId)];
                    case 'scroll':
                        return [2 /*return*/, this.executeScroll(action, tabId)];
                    case 'wait':
                        return [2 /*return*/, this.executeWait(action)];
                    case 'press_key':
                        return [2 /*return*/, this.executePressKey(action, tabId)];
                    default:
                        throw new Error("Unknown action type: ".concat(action.type));
                }
                return [2 /*return*/];
            });
        });
    };
    ActionExecutor.executeClick = function (action, tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'EXECUTE_ACTION',
                            action: {
                                type: 'click',
                                selector: action.selector,
                                x: action.x,
                                y: action.y,
                            }
                        }, function (response) {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            }
                            else if (response === null || response === void 0 ? void 0 : response.success) {
                                resolve();
                            }
                            else {
                                reject(new Error((response === null || response === void 0 ? void 0 : response.error) || 'Click failed'));
                            }
                        });
                    })];
            });
        });
    };
    ActionExecutor.executeType = function (action, tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!action.value) {
                    throw new Error('Type action requires value');
                }
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'EXECUTE_ACTION',
                            action: {
                                type: 'type',
                                selector: action.selector,
                                value: action.value,
                            }
                        }, function (response) {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            }
                            else if (response === null || response === void 0 ? void 0 : response.success) {
                                resolve();
                            }
                            else {
                                reject(new Error((response === null || response === void 0 ? void 0 : response.error) || 'Type failed'));
                            }
                        });
                    })];
            });
        });
    };
    ActionExecutor.executeSelect = function (action, tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'EXECUTE_ACTION',
                            action: {
                                type: 'select',
                                selector: action.selector,
                                value: action.value,
                            }
                        }, function (response) {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            }
                            else if (response === null || response === void 0 ? void 0 : response.success) {
                                resolve();
                            }
                            else {
                                reject(new Error((response === null || response === void 0 ? void 0 : response.error) || 'Select failed'));
                            }
                        });
                    })];
            });
        });
    };
    ActionExecutor.executeScroll = function (action, tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'EXECUTE_ACTION',
                            action: {
                                type: 'scroll',
                                selector: action.selector,
                                x: action.x,
                                y: action.y,
                            }
                        }, function (response) {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            }
                            else if (response === null || response === void 0 ? void 0 : response.success) {
                                resolve();
                            }
                            else {
                                reject(new Error((response === null || response === void 0 ? void 0 : response.error) || 'Scroll failed'));
                            }
                        });
                    })];
            });
        });
    };
    ActionExecutor.executeWait = function (action) {
        return __awaiter(this, void 0, void 0, function () {
            var duration;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        duration = action.duration || 1000;
                        return [4 /*yield*/, this.sleep(duration)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ActionExecutor.executePressKey = function (action, tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'EXECUTE_ACTION',
                            action: {
                                type: 'press_key',
                                key: action.key,
                            }
                        }, function (response) {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            }
                            else if (response === null || response === void 0 ? void 0 : response.success) {
                                resolve();
                            }
                            else {
                                reject(new Error((response === null || response === void 0 ? void 0 : response.error) || 'Press key failed'));
                            }
                        });
                    })];
            });
        });
    };
    ActionExecutor.sleep = function (ms) {
        return new Promise(function (r) { return setTimeout(r, ms); });
    };
    return ActionExecutor;
}());
exports.ActionExecutor = ActionExecutor;
