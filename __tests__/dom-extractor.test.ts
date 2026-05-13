// Unit tests for Cometeor extension
import { DomExtractor } from '../src/content/dom-extractor';
import { PageSnapshot } from '../src/shared/messages';

// Mock DOM elements
const mockDocument = {
  body: {
    scrollHeight: 1000,
    textContent: 'This is a test page content',
  },
  title: 'Test Page',
  querySelectorAll: jest.fn(),
  getBoundingClientRect: jest.fn(),
} as any;

const mockWindow = {
  innerWidth: 1200,
  innerHeight: 800,
  scrollY: 100,
  location: { href: 'https://example.com' },
} as any;

describe('DomExtractor', () => {
  beforeEach(() => {
    // Setup global mocks
    global.document = mockDocument;
    global.window = mockWindow;

    // Reset mocks
    jest.clearAllMocks();
  });

  test('extractSnapshot returns correct structure', async () => {
    mockDocument.querySelectorAll.mockReturnValue([]);

    const snapshot = await DomExtractor.extractSnapshot();

    expect(snapshot).toEqual({
      url: 'https://example.com',
      title: 'Test Page',
      viewport: {
        width: 1200,
        height: 800,
        scrollY: 100,
        totalHeight: 1000,
      },
      content: {
        text: 'This is a test page content',
        title: 'Test Page',
        url: 'https://example.com',
      },
      interactive: [],
    });
  });

  test('extractInteractiveElements finds form elements', () => {
    const mockElement = {
      tagName: 'INPUT',
      getBoundingClientRect: () => ({ x: 10, y: 20, width: 100, height: 30 }),
      getAttribute: (attr: string) => attr === 'type' ? 'text' : null,
      textContent: '',
    };

    mockDocument.querySelectorAll.mockReturnValue([mockElement]);

    const elements = (DomExtractor as any).extractInteractiveElements();

    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({
      tag: 'input',
      type: 'text',
      role: 'input-text',
    });
  });

  test('extractTextContent handles paragraphs', () => {
    const mockParagraphs = [
      { textContent: 'Short text' },
      { textContent: 'This is a longer paragraph with enough content to be included in the extraction.' },
      { textContent: 'Another paragraph' },
    ];

    mockDocument.querySelectorAll.mockReturnValue(mockParagraphs);

    const text = (DomExtractor as any).extractTextContent();

    expect(text).toContain('This is a longer paragraph');
    expect(text).toContain('Another paragraph');
    expect(text).not.toContain('Short text'); // Too short
  });
});