// AI-powered action planner for web automation tasks
import { AiClient } from './ai-client';
import { ContextManager } from './context-manager';
import { Plan, PageSnapshot } from '../shared/messages';

export class ActionPlanner {
  static async generatePlan(taskDescription: string, snapshot: PageSnapshot): Promise<Plan> {
    const context = ContextManager.compressForPlanning(taskDescription, snapshot, []);

    const prompt = this.buildPlanningPrompt(taskDescription, context);

    const aiResponse = await AiClient.generateContent(prompt, {
      temperature: 0.1, // Low temperature for deterministic planning
      maxTokens: 2048,
    });

    return this.parsePlanResponse(aiResponse);
  }

  private static buildPlanningPrompt(task: string, context: string): string {
    return `You are an AI assistant that creates step-by-step plans for web automation tasks.

TASK: ${task}

PAGE CONTEXT:
${context}

Create a detailed execution plan with specific actions. Each action should be one of:
- click: Click on an element (specify selector or description)
- type: Type text into an input (specify selector and text)
- select: Select an option from dropdown (specify selector and option)
- scroll: Scroll to element or position
- wait: Wait for element or time
- press_key: Press a keyboard key

Format your response as a JSON array of actions:

[
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
]

Be specific and actionable. Focus on the most direct path to complete the task.`;
  }

  private static parsePlanResponse(response: string): Plan {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON plan found in response');
      }

      const actions = JSON.parse(jsonMatch[0]);

      return {
        id: crypto.randomUUID(),
        actions: actions.map((action: any, index: number) => ({
          ...action,
          // Ensure all required fields
          description: action.description || `Step ${index + 1}`,
        })),
        confidence: 0.8, // Could be calculated based on response quality
        explanation: `Generated plan with ${actions.length} steps`,
      };
    } catch (error) {
      console.error('Failed to parse plan response:', error);
      // Fallback to a basic plan
      return {
        id: crypto.randomUUID(),
        actions: [{
          type: 'wait',
          duration: 1000,
          description: 'Fallback wait action',
        }],
        confidence: 0.1,
        explanation: 'Fallback plan due to parsing error',
      };
    }
  }
}