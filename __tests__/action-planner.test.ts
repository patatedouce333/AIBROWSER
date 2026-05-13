// Tests for ActionPlanner
import { ActionPlanner } from '../src/background/action-planner';
import { VertexClient } from '../src/background/vertex-client';

// Mock VertexClient
jest.mock('../src/background/vertex-client');

describe('ActionPlanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('generatePlan calls VertexClient with correct prompt', async () => {
    const mockResponse = `[
      {
        "type": "click",
        "selector": "#submit-button",
        "description": "Click the submit button"
      },
      {
        "type": "type",
        "selector": "input[name='query']",
        "value": "search term",
        "description": "Enter search query"
      }
    ]`;

    (VertexClient.generateContent as jest.Mock).mockResolvedValue(mockResponse);

    const snapshot = {
      url: 'https://example.com',
      title: 'Example',
      viewport: { width: 1200, height: 800, scrollY: 0, totalHeight: 1000 },
      content: { text: 'Example content', title: 'Example', url: 'https://example.com' },
      interactive: [],
    };

    const plan = await ActionPlanner.generatePlan('Search for something', snapshot);

    expect(VertexClient.generateContent).toHaveBeenCalledWith(
      expect.stringContaining('TASK: Search for something'),
      expect.objectContaining({ temperature: 0.1 })
    );

    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0]).toMatchObject({
      type: 'click',
      selector: '#submit-button',
      description: 'Click the submit button',
    });
  });

  test('parsePlanResponse handles malformed JSON gracefully', async () => {
    (VertexClient.generateContent as jest.Mock).mockResolvedValue('Invalid response');

    const snapshot = {
      url: 'https://example.com',
      title: 'Example',
      viewport: { width: 1200, height: 800, scrollY: 0, totalHeight: 1000 },
      content: { text: 'Example content', title: 'Example', url: 'https://example.com' },
      interactive: [],
    };

    const plan = await ActionPlanner.generatePlan('Test task', snapshot);

    // Should return fallback plan
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].type).toBe('wait');
    expect(plan.confidence).toBe(0.1);
  });
});