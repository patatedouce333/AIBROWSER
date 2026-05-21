"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callMercury = callMercury;
const INCEPTION_API_URL = 'https://api.inceptionlabs.ai/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
async function callMercury(systemPrompt, userMessage, options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fetchWithTimeout(systemPrompt, userMessage, options, timeoutMs);
        }
        catch (err) {
            lastError = err;
            // Don't retry on auth errors
            if (err.message?.includes('401') || err.message?.includes('403')) {
                throw new Error(`Inception API authentication failed. Check your API key. (${err.message})`);
            }
            // Retry on rate limit or server errors
            if (attempt < MAX_RETRIES && (err.message?.includes('429') || err.message?.includes('503') || err.message?.includes('timeout'))) {
                const backoff = 1000 * Math.pow(2, attempt - 1);
                console.warn(`[ai-client] Attempt ${attempt} failed (${err.message}), retrying in ${backoff}ms...`);
                await sleep(backoff);
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}
async function fetchWithTimeout(systemPrompt, userMessage, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(INCEPTION_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${options.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'cometeor-agent/1.0',
            },
            body: JSON.stringify({
                model: 'mercury-2',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                temperature: options.temperature ?? 0.1,
                max_tokens: options.maxTokens ?? 4096,
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const errText = (await response.text().catch(() => '')).slice(0, 300);
            throw new Error(`Inception API ${response.status}: ${errText}`);
        }
        let data;
        try {
            data = await response.json();
        }
        catch {
            throw new Error('Inception API returned invalid JSON');
        }
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.length === 0) {
            throw new Error('Inception API returned empty content');
        }
        return content;
    }
    catch (err) {
        if (err.name === 'AbortError')
            throw new Error(`Inception API timeout after ${timeoutMs}ms`);
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
