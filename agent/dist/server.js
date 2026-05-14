"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const agent_1 = require("./agent");
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: '256kb' }));
const PORT = parseInt(process.env.PORT || '3000');
const ENV_API_KEY = process.env.INCEPTION_API_KEY || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const MAX_CONCURRENT = 5;
const REQUEST_TIMEOUT_MS = 125000; // slightly over task timeout so 504 fires first
if (!ENV_API_KEY) {
    console.warn('Warning: INCEPTION_API_KEY not set — clients must supply apiKey in Authorization header');
}
// CORS
if (CORS_ORIGIN) {
    app.use((_req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        next();
    });
    app.options('*', (_req, res) => res.sendStatus(204));
}
function extractBearerToken(req) {
    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer '))
        return header.slice(7).trim();
    return null;
}
// POST /run
app.post('/run', async (req, res) => {
    const { task, url } = req.body;
    if (!task || !url) {
        return res.status(400).json({ error: 'task and url are required' });
    }
    // Auth: prefer Authorization header, fall back to env key
    const apiKey = extractBearerToken(req) || ENV_API_KEY;
    if (!apiKey) {
        return res.status(401).json({ error: 'Inception API key required (Authorization: Bearer <key>)' });
    }
    // Rate limit
    if ((0, agent_1.getActiveCount)() >= MAX_CONCURRENT) {
        return res.status(429).json({ error: 'Too many concurrent requests, try again later' });
    }
    // Per-request timeout
    const timer = setTimeout(() => {
        if (!res.headersSent) {
            res.status(504).json({ error: 'Task timed out (>120s)' });
        }
    }, REQUEST_TIMEOUT_MS);
    try {
        const result = await (0, agent_1.runTask)(task, url, { apiKey, keepAlive: true });
        clearTimeout(timer);
        if (!res.headersSent)
            res.json(result);
    }
    catch (err) {
        clearTimeout(timer);
        if (!res.headersSent)
            res.status(500).json({ error: err.message });
    }
});
// POST /workflow
app.post('/workflow', async (req, res) => {
    const { steps, apiKey: bodyApiKey } = req.body;
    if (!Array.isArray(steps) || steps.length === 0) {
        return res.status(400).json({ error: 'steps must be a non-empty array' });
    }
    for (let i = 0; i < steps.length; i++) {
        if (!steps[i].task) {
            return res.status(400).json({ error: `steps[${i}].task is required` });
        }
    }
    const apiKey = extractBearerToken(req) || bodyApiKey || ENV_API_KEY;
    if (!apiKey) {
        return res.status(401).json({ error: 'Inception API key required (Authorization: Bearer <key>)' });
    }
    if ((0, agent_1.getActiveCount)() >= MAX_CONCURRENT) {
        return res.status(429).json({ error: 'Too many concurrent requests, try again later' });
    }
    const timer = setTimeout(() => {
        if (!res.headersSent) {
            res.status(504).json({ error: 'Workflow timed out (>120s)' });
        }
    }, REQUEST_TIMEOUT_MS);
    try {
        const result = await (0, agent_1.runWorkflowTask)(steps, { apiKey, keepAlive: true });
        clearTimeout(timer);
        if (!res.headersSent)
            res.json(result);
    }
    catch (err) {
        clearTimeout(timer);
        if (!res.headersSent)
            res.status(500).json({ error: err.message });
    }
});
// GET /health
app.get('/health', async (_req, res) => {
    const { ChromeManager } = await Promise.resolve().then(() => __importStar(require('./browser')));
    const chromeAlive = ChromeManager.getInstance().isAlive();
    res.json({
        status: 'ok',
        model: 'mercury-2',
        chrome: chromeAlive ? 'up' : 'not started',
        activeTasks: (0, agent_1.getActiveCount)(),
    });
});
const server = app.listen(PORT, () => {
    console.log(`Cometeor Agent HTTP API running on http://localhost:${PORT}`);
    console.log(`  POST /run      { task, url }         (Authorization: Bearer <key>)`);
    console.log(`  POST /workflow { steps: WorkflowStep[] }`);
    console.log(`  GET  /health`);
});
let shuttingDown = false;
async function gracefulShutdown() {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log('\nShutting down...');
    // Stop accepting new requests
    server.close();
    // Wait for in-flight tasks (up to 10s)
    const deadline = Date.now() + 10000;
    while ((0, agent_1.getActiveCount)() > 0 && Date.now() < deadline) {
        await sleep(200);
    }
    await (0, agent_1.shutdown)();
    process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
