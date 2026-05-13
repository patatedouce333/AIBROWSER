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
exports.RequestQueue = void 0;
var RequestQueue = /** @class */ (function () {
    function RequestQueue(options) {
        if (options === void 0) { options = {}; }
        this.queue = [];
        this.processing = false;
        this.requestsThisMinute = 0;
        this.minuteStart = Date.now();
        this.maxPerMinute = options.maxPerMinute || 55; // Safety margin vs 60 quota
        this.minDelayMs = options.minDelayMs || 1000;
    }
    RequestQueue.prototype.enqueue = function (execute_1) {
        return __awaiter(this, arguments, void 0, function (execute, options) {
            var _this = this;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var _a, _b;
                        var request = {
                            id: crypto.randomUUID(),
                            execute: execute,
                            resolve: resolve,
                            reject: reject,
                            priority: (_a = options.priority) !== null && _a !== void 0 ? _a : 5,
                            retryCount: 0,
                            maxRetries: (_b = options.maxRetries) !== null && _b !== void 0 ? _b : 3,
                            createdAt: Date.now(),
                        };
                        // Insert by priority (lower number = higher priority)
                        var insertIdx = _this.queue.findIndex(function (r) { return r.priority > request.priority; });
                        if (insertIdx === -1) {
                            _this.queue.push(request);
                        }
                        else {
                            _this.queue.splice(insertIdx, 0, request);
                        }
                        _this.processNext();
                    })];
            });
        });
    };
    RequestQueue.prototype.processNext = function () {
        return __awaiter(this, void 0, void 0, function () {
            var request, startTime, result, error_1, backoff;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.processing || this.queue.length === 0)
                            return [2 /*return*/];
                        this.processing = true;
                        _a.label = 1;
                    case 1:
                        if (!(this.queue.length > 0)) return [3 /*break*/, 10];
                        return [4 /*yield*/, this.waitForSlot()];
                    case 2:
                        _a.sent();
                        request = this.queue.shift();
                        startTime = Date.now();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 9]);
                        return [4 /*yield*/, request.execute()];
                    case 4:
                        result = _a.sent();
                        request.resolve(result);
                        console.log("Request ".concat(request.id, " completed in ").concat(Date.now() - startTime, "ms"));
                        return [3 /*break*/, 9];
                    case 5:
                        error_1 = _a.sent();
                        console.error("Request ".concat(request.id, " failed:"), error_1);
                        if (!(this.isRetryable(error_1) && request.retryCount < request.maxRetries)) return [3 /*break*/, 7];
                        request.retryCount++;
                        backoff = Math.min(1000 * Math.pow(2, request.retryCount), 30000 // Max 30s
                        ) + Math.random() * 1000;
                        console.log("Retrying request ".concat(request.id, " in ").concat(backoff, "ms (attempt ").concat(request.retryCount, "/").concat(request.maxRetries, ")"));
                        return [4 /*yield*/, this.sleep(backoff)];
                    case 6:
                        _a.sent();
                        this.queue.unshift(request); // Re-queue at front
                        return [3 /*break*/, 8];
                    case 7:
                        request.reject(error_1);
                        _a.label = 8;
                    case 8: return [3 /*break*/, 9];
                    case 9: return [3 /*break*/, 1];
                    case 10:
                        this.processing = false;
                        return [2 /*return*/];
                }
            });
        });
    };
    RequestQueue.prototype.waitForSlot = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, waitTime;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = Date.now();
                        // Reset counter every minute
                        if (now - this.minuteStart > 60000) {
                            this.requestsThisMinute = 0;
                            this.minuteStart = now;
                        }
                        if (!(this.requestsThisMinute >= this.maxPerMinute)) return [3 /*break*/, 2];
                        waitTime = 60000 - (now - this.minuteStart) + 100;
                        console.log("Rate limit reached, waiting ".concat(waitTime, "ms"));
                        return [4 /*yield*/, this.sleep(waitTime)];
                    case 1:
                        _a.sent();
                        this.requestsThisMinute = 0;
                        this.minuteStart = Date.now();
                        _a.label = 2;
                    case 2: 
                    // Minimum delay between requests
                    return [4 /*yield*/, this.sleep(this.minDelayMs)];
                    case 3:
                        // Minimum delay between requests
                        _a.sent();
                        this.requestsThisMinute++;
                        return [2 /*return*/];
                }
            });
        });
    };
    RequestQueue.prototype.isRetryable = function (error) {
        var message = error.message || '';
        var status = error.status || 0;
        return (status === 429 || // Rate limited
            status === 503 || // Service unavailable
            status === 500 || // Server error
            message.includes('RESOURCE_EXHAUSTED') ||
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('fetch'));
    };
    RequestQueue.prototype.sleep = function (ms) {
        return new Promise(function (r) { return setTimeout(r, ms); });
    };
    // Get queue stats for debugging
    RequestQueue.prototype.getStats = function () {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            requestsThisMinute: this.requestsThisMinute,
            minuteStart: this.minuteStart,
        };
    };
    return RequestQueue;
}());
exports.RequestQueue = RequestQueue;
