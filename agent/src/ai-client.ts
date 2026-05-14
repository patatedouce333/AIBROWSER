const INCEPTION_API_URL = 'https://api.inceptionlabs.ai/v1/chat/completions';

export async function callMercury(
  systemPrompt: string,
  userMessage: string,
  options: { apiKey: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const response = await fetch(INCEPTION_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
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
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Inception API error ${response.status}: ${error}`);
  }

  const data = await response.json() as any;
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Inception API');
  return text;
}
