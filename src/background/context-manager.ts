// Context compression for AI model token limits
import { PageSnapshot, InteractiveElement } from '../shared/messages';

export class ContextManager {
  // Token limits (approximate)
  private static readonly MODEL_LIMIT = 100000; // Conservative limit
  private static readonly BUDGET = {
    systemPrompt: 800,
    history: 4000,
    interactiveElements: 3000,
    pageContent: 2000,
    task: 200,
  };

  static compressForPlanning(
    task: string,
    snapshot: PageSnapshot,
    history: Array<{ role: string; content: string }>
  ): string {
    // Filter and prioritize interactive elements
    const relevantElements = this.filterRelevantElements(task, snapshot.interactive);

    // Compress page content
    const relevantContent = this.extractRelevantContent(task, snapshot.content.text);

    // Build compressed context
    const elementsText = relevantElements
      .map(el => `[${el.id}] ${el.role} "${el.name}" ${el.value ? `val="${el.value}"` : ''} ${el.href ? `→${el.href}` : ''}${el.disabled ? ' [disabled]' : ''}`)
      .join('\n');

    return `TASK: ${task}

PAGE: ${snapshot.content.url}
TITLE: ${snapshot.content.title}
VIEWPORT: ${snapshot.viewport.width}x${snapshot.viewport.height}

ELEMENTS (${relevantElements.length}):
${elementsText}

CONTENT:
${relevantContent}`;
  }

  private static filterRelevantElements(
    task: string,
    elements: InteractiveElement[]
  ): InteractiveElement[] {
    const taskWords = task.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const scored = elements.map(el => {
      let score = 0;

      // In viewport bonus
      if (el.bbox.y >= 0 && el.bbox.y < 800) score += 3;

      // Name/label matches task
      const nameLower = el.name.toLowerCase();
      for (const word of taskWords) {
        if (nameLower.includes(word)) score += 5;
      }

      // Important element types
      if (el.role === 'input-text' || el.role === 'input-search') score += 4;
      if (el.role === 'button') score += 2;
      if (el.tag === 'input' && el.type === 'submit') score += 4;

      // Penalties
      if (el.disabled) score -= 10;
      if (el.href?.includes('facebook.com') || el.href?.includes('twitter.com')) score -= 5;
      if (el.name.toLowerCase().includes('cookie')) score -= 3;

      return { el, score };
    });

    // Return top 80 elements by relevance
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map(s => s.el);
  }

  private static extractRelevantContent(task: string, text: string): string {
    if (text.length < 2000) return text;

    const taskWords = task.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const paragraphs = text.split(/\n\n|\n/).filter(p => p.trim().length > 20);

    // Score paragraphs by relevance
    const scored = paragraphs.map(p => {
      let score = 0;
      const pLower = p.toLowerCase();
      for (const word of taskWords) {
        if (pLower.includes(word)) score++;
      }
      return { text: p, score };
    });

    // Take most relevant paragraphs
    const relevant = scored
      .filter(s => s.score > 0)
      .slice(0, 10);

    if (relevant.length === 0) {
      return text.slice(0, 2000);
    }

    return relevant.map(r => r.text).join('\n\n').slice(0, 2000);
  }
}