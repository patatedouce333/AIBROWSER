// Humanized input simulation to avoid bot detection
export class HumanizedInput {
  static async humanClick(selectorOrElement: string | HTMLElement): Promise<void> {
    const element = typeof selectorOrElement === 'string'
      ? document.querySelector(selectorOrElement) as HTMLElement
      : selectorOrElement;

    if (!element) {
      throw new Error(`Element not found: ${selectorOrElement}`);
    }

    const rect = element.getBoundingClientRect();

    // Random position within element (not exactly center)
    const x = rect.x + rect.width * (0.3 + Math.random() * 0.4);
    const y = rect.y + rect.height * (0.3 + Math.random() * 0.4);

    // Scroll into view smoothly
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.randomDelay(100, 300);

    // Simulate realistic mouse movement with pointer events
    element.dispatchEvent(new PointerEvent('pointerover', {
      clientX: x, clientY: y, bubbles: true
    }));
    await this.randomDelay(30, 80);

    element.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: x, clientY: y, bubbles: true, button: 0
    }));
    await this.randomDelay(50, 150); // Human press duration

    element.dispatchEvent(new PointerEvent('pointerup', {
      clientX: x, clientY: y, bubbles: true, button: 0
    }));

    element.dispatchEvent(new MouseEvent('click', {
      clientX: x, clientY: y, bubbles: true, button: 0
    }));
  }

  static async humanType(selector: string, text: string): Promise<void> {
    const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    if (!element) {
      throw new Error(`Input element not found: ${selector}`);
    }

    element.focus();
    await this.randomDelay(100, 200);

    // Clear existing content (Ctrl+A, Delete simulation)
    element.select();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await this.randomDelay(30, 60);
    element.value = '';
    element.dispatchEvent(new InputEvent('input', {
      data: '', inputType: 'deleteContentBackward', bubbles: true
    }));
    await this.randomDelay(50, 100);

    // Type each character with human-like timing
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Variable delay between characters (40-80 WPM average)
      const baseDelay = 50;
      const variation = this.gaussianRandom() * 30;
      await this.randomDelay(
        Math.max(20, baseDelay + variation - 15),
        baseDelay + variation + 25
      );

      // Occasional typos (disabled by default for reliability)
      /*
      if (Math.random() < 0.01 && i < text.length - 1) {
        const wrongChar = this.nearbyKey(char);
        await this.typeChar(element, wrongChar);
        await this.randomDelay(100, 300); // "realization" pause
        await this.deleteChar(element);
        await this.randomDelay(50, 100);
      }
      */

      await this.typeChar(element, char);

      // Longer pause after spaces and punctuation
      if (char === ' ' || '.!?,;:'.includes(char)) {
        await this.randomDelay(80, 200);
      }
    }

    // Pause before blur (human thinking time)
    await this.randomDelay(200, 500);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private static async typeChar(element: HTMLInputElement | HTMLTextAreaElement, char: string): Promise<void> {
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: char, bubbles: true, cancelable: true
    }));

    element.value += char;
    element.dispatchEvent(new InputEvent('input', {
      data: char, inputType: 'insertText', bubbles: true
    }));

    element.dispatchEvent(new KeyboardEvent('keyup', {
      key: char, bubbles: true
    }));
  }

  private static async deleteChar(element: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace', bubbles: true, cancelable: true
    }));

    element.value = element.value.slice(0, -1);
    element.dispatchEvent(new InputEvent('input', {
      data: '', inputType: 'deleteContentBackward', bubbles: true
    }));

    element.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Backspace', bubbles: true
    }));
  }

  private static randomDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min);
    return new Promise(r => setTimeout(r, delay));
  }

  private static gaussianRandom(): number {
    // Box-Muller transform for Gaussian distribution
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private static nearbyKey(char: string): string {
    // Simple keyboard adjacency (could be more sophisticated)
    const keyboard: { [key: string]: string } = {
      'a': 'sqw', 's': 'awdexz', 'd': 'serfcx', 'f': 'drtgbv',
      'q': 'was', 'w': 'qase', 'e': 'wsdfr', 'r': 'edfgt',
      // Add more as needed
    };
    const nearby = keyboard[char.toLowerCase()] || char;
    return nearby[Math.floor(Math.random() * nearby.length)];
  }
}