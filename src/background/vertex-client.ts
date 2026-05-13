// Vertex AI client with streaming support
import { RequestQueue } from './request-queue';
import { AuthManagerPKCE } from './auth-manager-pkce';

export interface VertexAIRequest {
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

export interface VertexAIResponse {
  candidates: Array<{
    content: {
      role: string;
      parts: Array<{
        text: string;
      }>;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
}

interface VertexConfig {
  projectId: string;
  region: string;
  model: string;
}



export class VertexClient {
  private static config: VertexConfig = {
    projectId: 'your-project-id', // TODO: Make configurable
    region: 'us-central1',
    model: 'gemini-2.0-flash-exp', // Latest model
  };

  private static queue = new RequestQueue();

  static configure(config: Partial<VertexConfig>) {
    this.config = { ...this.config, ...config };
  }

  static async generateContent(
    prompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      onChunk?: (chunk: string) => void;
    } = {}
  ): Promise<string> {
    const request: VertexAIRequest = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2048,
      }
    };

    if (options.stream && options.onChunk) {
      return this.streamGenerateContent(request, options.onChunk);
    } else {
      return this.singleGenerateContent(request);
    }
  }

  private static async singleGenerateContent(request: VertexAIRequest): Promise<string> {
    const response = await this.makeRequest<VertexAIResponse>('generateContent', request);

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error('No response from Vertex AI');
    }

    const candidate = response.candidates[0];
    if (candidate.content?.parts?.[0]?.text) {
      return candidate.content.parts[0].text;
    }

    throw new Error('Invalid response format from Vertex AI');
  }

  private static async streamGenerateContent(
    request: VertexAIRequest,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    let fullResponse = '';

    const streamRequest = {
      ...request,
      generationConfig: {
        ...request.generationConfig,
        // Streaming specific config
      }
    };

    // For streaming, we'll simulate streaming by making multiple requests
    // In production, use the actual streaming endpoint
    const response = await this.makeRequest<VertexAIResponse>('streamGenerateContent', streamRequest);

    if (response.candidates && response.candidates.length > 0) {
      const text = response.candidates[0].content?.parts?.[0]?.text;
      if (text) {
        // Simulate streaming by sending chunks
        const words = text.split(' ');
        for (const word of words) {
          onChunk(word + ' ');
          await this.sleep(50); // Simulate typing delay
        }
        fullResponse = text;
      }
    }

    return fullResponse;
  }

  private static async makeRequest<T>(
    endpoint: string,
    request: VertexAIRequest
  ): Promise<T> {
    return this.queue.enqueue(
      async () => {
        const token = await AuthManagerPKCE.getValidToken();
        if (!token) {
          throw new Error('No valid authentication token');
        }

        const url = `https://${this.config.region}-aiplatform.googleapis.com/v1/projects/${this.config.projectId}/locations/${this.config.region}/publishers/google/models/${this.config.model}:${endpoint}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Vertex AI API error ${response.status}: ${errorText}`);
        }

        return response.json();
      },
      { priority: 1, maxRetries: 3 }
    );
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  // Test connectivity and authentication
  static async testConnection(): Promise<boolean> {
    try {
      console.log('Testing Vertex AI connection...');
      const result = await this.generateContent('Say "Hello World" in exactly 2 words.', {
        maxTokens: 10,
        temperature: 0
      });
      console.log('Vertex AI test successful:', result);
      return result.toLowerCase().includes('hello world');
    } catch (error) {
      console.error('Vertex AI connection test failed:', error);
      return false;
    }
  }

  // Get current configuration
  static getConfig() {
    return { ...this.config };
  }

  // Update configuration
  static updateConfig(config: Partial<VertexConfig>) {
    this.config = { ...this.config, ...config };
    console.log('Vertex AI config updated:', this.config);
  }
}