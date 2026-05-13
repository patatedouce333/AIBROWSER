// DOM extraction for AI context
import { PageSnapshot, InteractiveElement } from '../shared/messages';

export class DomExtractor {
  static async extractSnapshot(): Promise<PageSnapshot> {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollY: window.scrollY,
      totalHeight: document.body.scrollHeight,
    };

    const content = {
      text: this.extractTextContent(),
      title: document.title,
      url: window.location.href,
    };

    const interactive = this.extractInteractiveElements();

    return {
      url: window.location.href,
      title: document.title,
      viewport,
      content,
      interactive,
    };
  }

  private static extractTextContent(): string {
    // Extract main content text
    const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, div[role="main"], main, article');
    const texts: string[] = [];

    for (let i = 0; i < elements.length; i++) {
      const text = elements[i].textContent?.trim();
      if (text && text.length > 20) { // Skip very short texts
        texts.push(text);
      }
    }

    return texts.join('\n\n').slice(0, 10000); // Limit size
  }

  private static extractInteractiveElements(): InteractiveElement[] {
    const selectors = [
      'button',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[onclick]',
      '[role="combobox"]',
      '[role="listbox"]',
      'form',
    ];

    const elements: InteractiveElement[] = [];
    const seen = new Set<Element>();

    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      for (let i = 0; i < found.length; i++) {
        const element = found[i];
        if (seen.has(element)) continue;
        seen.add(element);

        const interactive = this.elementToInteractive(element);
        if (interactive) {
          elements.push(interactive);
        }
      }
    }

    return elements;
  }

  private static elementToInteractive(element: Element): InteractiveElement | null {
    const rect = element.getBoundingClientRect();

    // Skip invisible elements
    if (rect.width === 0 || rect.height === 0) return null;

    const tag = element.tagName.toLowerCase();
    const inputElement = element as HTMLInputElement;
    const anchorElement = element as HTMLAnchorElement;
    const buttonElement = element as HTMLButtonElement;
    const selectElement = element as HTMLSelectElement;

    let role = element.getAttribute('role') || '';
    let name = '';
    let value = '';
    let type = '';
    let href = '';

    // Determine role and extract properties
    if (tag === 'input') {
      type = inputElement.type || 'text';
      role = `input-${type}`;
      name = inputElement.placeholder || inputElement.name || inputElement.id || '';
      value = inputElement.value || '';
    } else if (tag === 'button') {
      role = 'button';
      name = buttonElement.textContent?.trim() || buttonElement.value || '';
    } else if (tag === 'select') {
      role = 'select';
      name = selectElement.name || selectElement.id || '';
      value = selectElement.value || '';
    } else if (tag === 'textarea') {
      role = 'textarea';
      name = (element as HTMLTextAreaElement).placeholder || '';
      value = (element as HTMLTextAreaElement).value || '';
    } else if (tag === 'a') {
      role = 'link';
      name = anchorElement.textContent?.trim() || anchorElement.title || '';
      href = anchorElement.href || '';
    } else if (role) {
      name = element.textContent?.trim() || element.getAttribute('aria-label') || '';
    } else {
      // Generic element
      role = tag;
      name = element.textContent?.trim() || element.getAttribute('aria-label') || '';
    }

    // Skip elements without meaningful names
    if (!name.trim()) return null;

    return {
      id: this.generateUniqueId(element),
      role,
      tag,
      type,
      name: name.slice(0, 100), // Limit length
      value: value.slice(0, 50), // Limit length
      href: href ? new URL(href, window.location.href).pathname.slice(0, 100) : undefined,
      disabled: (element as any).disabled || false,
      bbox: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  private static generateUniqueId(element: Element): string {
    // Generate a stable unique identifier
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      } else if ((current as any).className) {
        selector += `.${(current as any).className.split(' ').join('.')}`;
      }

      // Add nth-child if needed
      const siblings = Array.from(current.parentElement?.children || []);
      const index = siblings.indexOf(current as Element);
      if (siblings.length > 1) {
        selector += `:nth-child(${index + 1})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }
}