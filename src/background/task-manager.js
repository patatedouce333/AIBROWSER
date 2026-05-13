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
exports.TaskManager = void 0;
var action_planner_1 = require("./action-planner");
var action_executor_1 = require("./action-executor");
var tab_manager_1 = require("./tab-manager");
var TaskManager = /** @class */ (function () {
    function TaskManager() {
        this.tasks = new Map();
        this.activeTaskId = null;
    }
    TaskManager.prototype.createTask = function (description) {
        return __awaiter(this, void 0, void 0, function () {
            var task;
            return __generator(this, function (_a) {
                task = {
                    id: crypto.randomUUID(),
                    description: description,
                    status: 'pending',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                this.tasks.set(task.id, task);
                console.log("Created task ".concat(task.id, ": ").concat(description));
                // Start processing immediately
                this.processTask(task);
                return [2 /*return*/, task];
            });
        });
    };
    TaskManager.prototype.cancelTask = function (taskId) {
        return __awaiter(this, void 0, void 0, function () {
            var task;
            return __generator(this, function (_a) {
                task = this.tasks.get(taskId);
                if (task) {
                    task.status = 'cancelled';
                    task.updatedAt = Date.now();
                    console.log("Cancelled task ".concat(taskId));
                }
                return [2 /*return*/];
            });
        });
    };
    TaskManager.prototype.getTasks = function () {
        return Array.from(this.tasks.values());
    };
    TaskManager.prototype.processTask = function (task) {
        return __awaiter(this, void 0, void 0, function () {
            var tab, snapshot, plan, result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        task.status = 'running';
                        task.updatedAt = Date.now();
                        console.log("Processing task ".concat(task.id, ": ").concat(task.description));
                        return [4 /*yield*/, tab_manager_1.TabManager.getActiveTab()];
                    case 1:
                        tab = _a.sent();
                        // Ensure content script is ready
                        return [4 /*yield*/, tab_manager_1.TabManager.ensureContentScript(tab.id)];
                    case 2:
                        // Ensure content script is ready
                        _a.sent();
                        return [4 /*yield*/, this.extractPageSnapshot(tab.id)];
                    case 3:
                        snapshot = _a.sent();
                        return [4 /*yield*/, action_planner_1.ActionPlanner.generatePlan(task.description, snapshot)];
                    case 4:
                        plan = _a.sent();
                        task.plan = plan;
                        task.updatedAt = Date.now();
                        console.log("Generated plan for task ".concat(task.id, " with ").concat(plan.actions.length, " actions"));
                        return [4 /*yield*/, action_executor_1.ActionExecutor.executePlan(plan, tab.id)];
                    case 5:
                        result = _a.sent();
                        task.status = 'completed';
                        task.result = result;
                        task.updatedAt = Date.now();
                        console.log("Completed task ".concat(task.id));
                        return [3 /*break*/, 7];
                    case 6:
                        error_1 = _a.sent();
                        console.error("Task ".concat(task.id, " failed:"), error_1);
                        task.status = 'failed';
                        task.error = error_1.message;
                        task.updatedAt = Date.now();
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    TaskManager.prototype.extractPageSnapshot = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var timeout = setTimeout(function () {
                            reject(new Error('DOM extraction timeout'));
                        }, 5000);
                        chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_DOM' }, function (response) {
                            clearTimeout(timeout);
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            }
                            else if (response === null || response === void 0 ? void 0 : response.snapshot) {
                                resolve(response.snapshot);
                            }
                            else {
                                reject(new Error('Invalid DOM extraction response'));
                            }
                        });
                    })];
            });
        });
    };
    TaskManager.prototype.handleDomSnapshot = function (snapshot, tabId) {
        console.log("Received DOM snapshot from tab ".concat(tabId, ": ").concat(snapshot.content.title));
        // Store for context if needed
    };
    TaskManager.prototype.handleMutation = function (url, significant, tabId) {
        if (significant) {
            console.log("Significant mutation detected in tab ".concat(tabId, ": ").concat(url));
            // Could trigger re-planning if task is active
        }
    };
    TaskManager.prototype.handleSpaNavigation = function (url, tabId) {
        console.log("SPA navigation detected in tab ".concat(tabId, ": ").concat(url));
        // Handle SPA navigation for active tasks
    };
    return TaskManager;
}());
exports.TaskManager = TaskManager;
