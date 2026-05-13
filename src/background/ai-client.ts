import { RequestQueue } from './request-queue';

const INCEPTION_API_URL = 'https://api.inceptionlabs.ai/v1/chat/completions';

interface AiConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export class AiClient {
  private static config: AiConfig = {
    apiKey: '',
    model: 'mercury-2',
    maxTokens: 8192,
    temperature: 0.2,
  };

  private static queue = new RequestQueue();

  static async loadConfig(): Promise<void> {
    const stored = await chrome.storage.sync.get(['inception_api_key', 'model', 'maxTokens', 'temperature']);
    if (stored.inception_api_key) this.config.apiKey = stored.inception_api_key;
    if (stored.model) this.config.model = stored.model;
    if (stored.maxTokens) this.config.maxTokens = stored.maxTokens;
    if (stored.temperature !== undefined) this.config.temperature = stored.temperature;
  }

  static async generateContent(
    prompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
      stream?: boolean;
      onChunk?: (chunk: string) => void;
    } = {}
  ): Promise<string> {
    await this.loadConfig();

    if (!this.config.apiKey) {
      throw new Error('Inception API key not configured. Please set it in the extension options.');
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    if (options.stream && options.onChunk) {
      return this.streamContent(messages, options);
    }

    return this.queue.enqueue(async () => {
      const response = await fetch(INCEPTION_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: options.temperature ?? this.config.temperature,
          max_tokens: options.maxTokens ?? this.config.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Inception API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;

      if (!text) throw new Error('Empty response from Inception API');
      return text;
    }, { priority: 1, maxRetries: 3 });
  }

  private static async streamContent(
    messages: Array<{ role: string; content: string }>,
    options: { temperature?: number; maxTokens?: number; onChunk?: (chunk: string) => void }
  ): Promise<string> {
    const response = await fetch(INCEPTION_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Inception API error ${response.status}: ${error}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return fullText;

        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) {
            fullText += chunk;
            options.onChunk?.(chunk);
          }
        } catch {
          // Fragment SSE incomplet
        }
      }
    }

    return fullText;
  }

  static async testConnection(): Promise<boolean> {
    try {
      const result = await this.generateContent('Reply with exactly: OK', {
        maxTokens: 10,
        temperature: 0,
      });
      return result.trim().length > 0;
    } catch (error) {
      console.error('Inception API connection test failed:', error);
      return false;
    }
  }

  static updateConfig(config: Partial<AiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  static getConfig(): AiConfig {
    return { ...this.config };
  }
}
