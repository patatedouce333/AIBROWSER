/**
 * ActionValidator: Security validator for XSS, selector injection, and payload validation
 * Prevents execution of malicious selectors, event handlers, and script injections
 *
 * CRITICAL SECURITY: All user-provided selectors, attributes, and payloads must be validated
 * before being used in DOM queries or API calls.
 */

export interface Action {
  type: 'click' | 'type' | 'scroll' | 'wait' | 'submit' | 'delete' | 'navigate';
  selector?: string;
  text?: string;
  payload?: any;
  url?: string;
  delay?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class ActionValidator {
  /**
   * Validate CSS selector to prevent XSS and selector injection
   * Prevents: onclick, onerror, javascript: protocol, script tags, Unicode escapes
   */
  static isValidSelector(selector: string): ValidationResult {
    if (!selector || typeof selector !== 'string') {
      return { valid: false, error: 'Selector must be a non-empty string' };
    }

    // Check for dangerous HTML event attributes
    if (this.containsEventHandler(selector)) {
      return { valid: false, error: 'Selector contains event handler attributes' };
    }

    // Check for script tags
    if (this.containsScriptTag(selector)) {
      return { valid: false, error: 'Selector contains script tag' };
    }

    // Check for javascript: protocol
    if (this.containsJavascriptProtocol(selector)) {
      return { valid: false, error: 'Selector contains javascript: protocol' };
    }

    // Check for data: URIs with executable content
    if (this.containsDangerousDataUri(selector)) {
      return { valid: false, error: 'Selector contains dangerous data URI' };
    }

    // Check for Unicode escape sequences that could bypass filters
    if (this.containsUnicodeEscape(selector)) {
      return { valid: false, error: 'Selector contains Unicode escape sequences' };
    }

    // Check for HTML entities that decode to dangerous content
    if (this.containsDecodableXss(selector)) {
      return { valid: false, error: 'Selector contains HTML entity XSS attempt' };
    }

    // Validate CSS selector syntax - ensure it's a valid selector
    if (!this.isValidCssSelector(selector)) {
      return { valid: false, error: 'Invalid CSS selector syntax' };
    }

    return { valid: true };
  }

  /**
   * Validate an action to ensure safe execution
   */
  static isValidAction(action: Action): ValidationResult {
    if (!action || typeof action !== 'object') {
      return { valid: false, error: 'Action must be a valid object' };
    }

    // Validate action type
    const validTypes = ['click', 'type', 'scroll', 'wait', 'submit', 'delete', 'navigate'];
    if (!validTypes.includes(action.type)) {
      return { valid: false, error: `Invalid action type: ${action.type}` };
    }

    // Validate selector if present
    if (action.selector) {
      const selectorValidation = this.isValidSelector(action.selector);
      if (!selectorValidation.valid) {
        return { valid: false, error: `Selector validation failed: ${selectorValidation.error}` };
      }
    }

    // Validate text content
    if (action.text && typeof action.text !== 'string') {
      return { valid: false, error: 'Text must be a string' };
    }

    // Validate URL for navigation
    if (action.url) {
      const urlValidation = this.isValidUrl(action.url);
      if (!urlValidation.valid) {
        return { valid: false, error: `URL validation failed: ${urlValidation.error}` };
      }
    }

    // Validate delay
    if (action.delay !== undefined) {
      if (typeof action.delay !== 'number' || action.delay < 0 || action.delay > 30000) {
        return { valid: false, error: 'Delay must be a number between 0 and 30000ms' };
      }
    }

    // Critical actions (submit, delete) require selector validation
    if (['submit', 'delete'].includes(action.type) && !action.selector) {
      return { valid: false, error: `${action.type} action requires a selector` };
    }

    return { valid: true };
  }

  /**
   * Validate payload to prevent code injection
   */
  static isValidPayload(payload: any): ValidationResult {
    if (payload === null || payload === undefined) {
      return { valid: true }; // Null/undefined are safe
    }

    // Check if payload is a function (dangerous - functions can't be safely serialized/executed)
    if (typeof payload === 'function') {
      return { valid: false, error: 'Payload cannot contain functions' };
    }

    // For objects, recursively validate
    if (typeof payload === 'object') {
      return this.isValidPayloadObject(payload);
    }

    // Strings are safe unless they contain script-like content
    if (typeof payload === 'string') {
      if (this.containsScriptTag(payload) || this.containsJavascriptProtocol(payload)) {
        return { valid: false, error: 'Payload string contains dangerous content' };
      }
    }

    return { valid: true };
  }

  // ============ PRIVATE HELPER METHODS ============

  /**
   * Check if selector contains event handler attributes
   */
  private static containsEventHandler(selector: string): boolean {
    // Match onclick, onerror, onload, onmouseover, etc.
    const eventHandlerPattern = /\bon\w+\s*=/i;
    if (eventHandlerPattern.test(selector)) {
      return true;
    }

    // Also check for variations with quotes and whitespace
    const quotedPattern = /['"]on\w+['"]/i;
    if (quotedPattern.test(selector)) {
      return true;
    }

    return false;
  }

  /**
   * Check if selector contains script tags
   */
  private static containsScriptTag(selector: string): boolean {
    const scriptPattern = /<\s*script[^>]*>|<\/\s*script\s*>/i;
    return scriptPattern.test(selector);
  }

  /**
   * Check for javascript: protocol
   */
  private static containsJavascriptProtocol(selector: string): boolean {
    const jsProtocolPattern = /javascript\s*:/i;
    return jsProtocolPattern.test(selector);
  }

  /**
   * Check for dangerous data: URIs
   */
  private static containsDangerousDataUri(selector: string): boolean {
    // data:text/html - allows arbitrary HTML/script execution
    if (/data\s*:\s*text\/html/i.test(selector)) {
      return true;
    }

    // data:application/javascript
    if (/data\s*:\s*application\/javascript/i.test(selector)) {
      return true;
    }

    return false;
  }

  /**
   * Check for Unicode escape sequences (\uXXXX, &#xXXXX;, etc.)
   */
  private static containsUnicodeEscape(selector: string): boolean {
    // Literal Unicode escapes like a
    if (/\\u[0-9a-fA-F]{4}/.test(selector)) {
      return true;
    }

    // HTML numeric character references &#xHHHH;
    if (/&#x[0-9a-fA-F]+;/i.test(selector)) {
      return true;
    }

    // HTML numeric character references &#DDD;
    if (/&#\d+;/.test(selector)) {
      return true;
    }

    return false;
  }

  /**
   * Check for HTML entity XSS (e.g., &lt;script&gt;)
   */
  private static containsDecodableXss(selector: string): boolean {
    // Common HTML entities that could decode to dangerous content
    const dangerousPatterns = [
      /&lt;\s*script/i,
      /&gt;\s*&lt;/,
      /&#60;.*script/i,
      /&sol;/i, // Forward slash entity
    ];

    return dangerousPatterns.some(pattern => pattern.test(selector));
  }

  /**
   * Validate CSS selector syntax
   */
  private static isValidCssSelector(selector: string): boolean {
    try {
      // Try to use the selector in document.querySelectorAll
      // This will throw if it's invalid syntax
      document.querySelectorAll(selector);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate URL for navigation
   */
  private static isValidUrl(url: string): ValidationResult {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL must be a non-empty string' };
    }

    // Block javascript: protocol
    if (/^javascript\s*:/i.test(url)) {
      return { valid: false, error: 'javascript: protocol is not allowed' };
    }

    // Block data: URLs for navigation (except safe data URIs)
    if (/^data\s*:/i.test(url)) {
      return { valid: false, error: 'data: URLs are not allowed for navigation' };
    }

    try {
      new URL(url);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Recursively validate payload objects
   */
  private static isValidPayloadObject(payload: any): ValidationResult {
    if (Array.isArray(payload)) {
      for (let i = 0; i < payload.length; i++) {
        const itemValidation = this.isValidPayload(payload[i]);
        if (!itemValidation.valid) {
          return { valid: false, error: `Array item ${i}: ${itemValidation.error}` };
        }
      }
      return { valid: true };
    }

    // Check if it's a plain object
    if (payload.constructor !== Object) {
      return { valid: false, error: `Non-plain objects are not allowed` };
    }

    for (const key in payload) {
      if (payload.hasOwnProperty(key)) {
        const value = payload[key];

        // Keys must be safe strings (no unusual patterns)
        if (!/^[a-zA-Z0-9_$]+$/.test(key)) {
          return { valid: false, error: `Invalid property name: ${key}` };
        }

        // Validate the value recursively
        const valueValidation = this.isValidPayload(value);
        if (!valueValidation.valid) {
          return { valid: false, error: `Property ${key}: ${valueValidation.error}` };
        }
      }
    }

    return { valid: true };
  }
}
