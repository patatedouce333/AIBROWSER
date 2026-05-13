"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = void 0;
var ContextManager = /** @class */ (function () {
    function ContextManager() {
    }
    ContextManager.compressForPlanning = function (task, snapshot, history) {
        // Filter and prioritize interactive elements
        var relevantElements = this.filterRelevantElements(task, snapshot.interactive);
        // Compress page content
        var relevantContent = this.extractRelevantContent(task, snapshot.content.text);
        // Build compressed context
        var elementsText = relevantElements
            .map(function (el) { return "[".concat(el.id, "] ").concat(el.role, " \"").concat(el.name, "\" ").concat(el.value ? "val=\"".concat(el.value, "\"") : '', " ").concat(el.href ? "\u2192".concat(el.href) : '').concat(el.disabled ? ' [disabled]' : ''); })
            .join('\n');
        return "TASK: ".concat(task, "\n\nPAGE: ").concat(snapshot.content.url, "\nTITLE: ").concat(snapshot.content.title, "\nVIEWPORT: ").concat(snapshot.viewport.width, "x").concat(snapshot.viewport.height, "\n\nELEMENTS (").concat(relevantElements.length, "):\n").concat(elementsText, "\n\nCONTENT:\n").concat(relevantContent);
    };
    ContextManager.filterRelevantElements = function (task, elements) {
        var taskWords = task.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 2; });
        var scored = elements.map(function (el) {
            var _a, _b;
            var score = 0;
            // In viewport bonus
            if (el.bbox.y >= 0 && el.bbox.y < 800)
                score += 3;
            // Name/label matches task
            var nameLower = el.name.toLowerCase();
            for (var _i = 0, taskWords_1 = taskWords; _i < taskWords_1.length; _i++) {
                var word = taskWords_1[_i];
                if (nameLower.includes(word))
                    score += 5;
            }
            // Important element types
            if (el.role === 'input-text' || el.role === 'input-search')
                score += 4;
            if (el.role === 'button')
                score += 2;
            if (el.tag === 'input' && el.type === 'submit')
                score += 4;
            // Penalties
            if (el.disabled)
                score -= 10;
            if (((_a = el.href) === null || _a === void 0 ? void 0 : _a.includes('facebook.com')) || ((_b = el.href) === null || _b === void 0 ? void 0 : _b.includes('twitter.com')))
                score -= 5;
            if (el.name.toLowerCase().includes('cookie'))
                score -= 3;
            return { el: el, score: score };
        });
        // Return top 80 elements by relevance
        return scored
            .sort(function (a, b) { return b.score - a.score; })
            .slice(0, 80)
            .map(function (s) { return s.el; });
    };
    ContextManager.extractRelevantContent = function (task, text) {
        if (text.length < 2000)
            return text;
        var taskWords = task.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 3; });
        var paragraphs = text.split(/\n\n|\n/).filter(function (p) { return p.trim().length > 20; });
        // Score paragraphs by relevance
        var scored = paragraphs.map(function (p) {
            var score = 0;
            var pLower = p.toLowerCase();
            for (var _i = 0, taskWords_2 = taskWords; _i < taskWords_2.length; _i++) {
                var word = taskWords_2[_i];
                if (pLower.includes(word))
                    score++;
            }
            return { text: p, score: score };
        });
        // Take most relevant paragraphs
        var relevant = scored
            .filter(function (s) { return s.score > 0; })
            .slice(0, 10);
        if (relevant.length === 0) {
            return text.slice(0, 2000);
        }
        return relevant.map(function (r) { return r.text; }).join('\n\n').slice(0, 2000);
    };
    // Token limits (approximate)
    ContextManager.MODEL_LIMIT = 100000; // Conservative limit
    ContextManager.BUDGET = {
        systemPrompt: 800,
        history: 4000,
        interactiveElements: 3000,
        pageContent: 2000,
        task: 200,
    };
    return ContextManager;
}());
exports.ContextManager = ContextManager;
