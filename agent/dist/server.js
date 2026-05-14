"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const agent_1 = require("./agent");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = parseInt(process.env.PORT || '3000');
const API_KEY = process.env.INCEPTION_API_KEY || '';
if (!API_KEY) {
    console.error('Warning: INCEPTION_API_KEY not set — requests will fail');
}
// POST /run — execute a task
app.post('/run', async (req, res) => {
    const { task, url, apiKey } = req.body;
    if (!task || !url) {
        return res.status(400).json({ error: 'task and url are required' });
    }
    const key = apiKey || API_KEY;
    if (!key) {
        return res.status(401).json({ error: 'Inception API key required (apiKey in body or INCEPTION_API_KEY env)' });
    }
    try {
        const result = await (0, agent_1.runTask)(task, url, { apiKey: key, keepAlive: true });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET /health
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', model: 'mercury-2' });
});
const server = app.listen(PORT, () => {
    console.log(`Cometeor Agent HTTP API running on http://localhost:${PORT}`);
    console.log(`  POST /run  { task, url }   — execute a task`);
    console.log(`  GET  /health               — status check`);
});
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await (0, agent_1.shutdown)();
    server.close();
    process.exit(0);
});
