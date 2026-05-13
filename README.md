# Cometeor - AI-Powered Chrome Extension

Cometeor is an intelligent web automation assistant that uses Google Vertex AI (Gemini) to understand and execute complex web tasks through natural language instructions.

## Features

- **AI-Powered Task Planning**: Uses Gemini 2.0 Flash to analyze web pages and create execution plans
- **Humanized Input Simulation**: Mimics realistic human typing and clicking patterns to avoid detection
- **Real-time DOM Monitoring**: Tracks page changes and SPA navigation automatically
- **OAuth2 Authentication**: Secure authentication with Google Cloud Platform
- **Chrome Extension MV3**: Built with modern Chrome extension architecture
- **TypeScript**: Fully typed codebase for reliability and maintainability

## Architecture

### Core Components

1. **Background Service Worker** (`src/background/`)
   - `index.ts`: Main service worker orchestrating all components
   - `vertex-client.ts`: Google Vertex AI integration with streaming support
   - `auth-manager-pkce.ts`: OAuth2 PKCE authentication flow
   - `task-manager.ts`: Task lifecycle management and AI planning
   - `action-executor.ts`: Web action execution engine
   - `context-manager.ts`: DOM context compression for AI models
   - `tab-manager.ts`: Chrome tab management utilities
   - `request-queue.ts`: Rate limiting and retry logic for API calls
   - `token-store.ts`: Secure token storage using chrome.storage.session
   - `offscreen-manager.ts`: Long-running task management
   - `keep-alive.ts`: Service worker lifecycle management

2. **Content Scripts** (`src/content/`)
   - `index.ts`: Message handling and action execution
   - `dom-extractor.ts`: Intelligent DOM analysis and element extraction
   - `mutation-watcher.ts`: SPA navigation and DOM change detection
   - `humanized-input.ts`: Realistic user input simulation

3. **Sidebar UI** (`src/sidebar/`)
   - `index.ts`: Task creation and monitoring interface
   - `sidebar.html`: User interface layout

4. **Options Page** (`src/options/`)
   - `index.ts`: Configuration management interface
   - `options.html`: Settings UI

5. **Shared Types** (`src/shared/`)
   - `messages.ts`: TypeScript interfaces for inter-component communication

## Installation & Setup

### Prerequisites

1. **Google Cloud Project**: Create a GCP project with Vertex AI API enabled
2. **OAuth2 Credentials**: Set up OAuth2 client ID for Chrome extension
3. **Chrome Extension**: Load unpacked extension in developer mode

### Configuration

1. Open extension options page
2. Enter your GCP Project ID
3. Enter your OAuth2 Client ID
4. Configure AI parameters (temperature, max tokens)
5. Test connection to verify setup

### OAuth2 Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable Vertex AI API
4. Create OAuth2 credentials for Chrome extension
5. Add authorized redirect URI: `https://[extension-id].chromiumapp.org/`
6. Copy client ID to extension settings

## Usage

1. **Open Sidebar**: Click the extension icon to open the task interface
2. **Describe Task**: Enter natural language description of what you want to do
3. **Execute**: Cometeor will analyze the page and execute the task automatically
4. **Monitor**: Watch progress in real-time through the sidebar interface

### Example Tasks

- "Search for 'TypeScript tutorial' and open the first result"
- "Fill out this contact form with my information"
- "Navigate to the checkout page and apply discount code SAVE10"
- "Find and bookmark all articles about AI on this page"

## Development

### Building

```bash
npm install
npm run build
```

### Development Mode

```bash
npm run dev  # Watch mode with source maps
```

### Type Checking

```bash
npm run typecheck
```

### Testing

```bash
npm test
```

### Project Structure

```
src/
├── background/          # Service worker components
├── content/            # Content script components
├── sidebar/            # Popup/sidebar UI
├── options/            # Options page UI
├── shared/             # Shared types and utilities
└── offscreen/          # Offscreen document
```

## Security Considerations

- **Token Storage**: Authentication tokens stored securely in chrome.storage.session
- **Content Security**: All external requests validated and rate-limited
- **Input Sanitization**: User inputs validated and sanitized
- **Permission Model**: Minimal required Chrome permissions
- **Humanized Input**: Realistic interaction patterns to avoid bot detection

## API Rate Limits

- Vertex AI: 55 requests/minute (with automatic queuing and retries)
- Automatic backoff and retry logic for failed requests
- Request deduplication to optimize API usage

## Browser Compatibility

- Chrome 88+ (MV3 support required)
- Chromium-based browsers (Edge, Opera, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with proper TypeScript types
4. Add tests for new functionality
5. Ensure build passes and types check
6. Submit pull request

## License

MIT License - see LICENSE file for details

## Troubleshooting

### Common Issues

1. **Authentication Fails**: Check OAuth2 client ID and redirect URI
2. **API Errors**: Verify GCP project setup and Vertex AI API enablement
3. **Content Script Not Loading**: Check manifest.json permissions
4. **Tasks Not Executing**: Ensure page is fully loaded before starting tasks

### Debug Mode

Enable verbose logging in Chrome DevTools console for detailed operation logs.

## Changelog

### v1.0.0
- Initial release with full AI-powered web automation
- Vertex AI integration with Gemini 2.0 Flash
- Humanized input simulation
- Real-time DOM monitoring
- OAuth2 authentication
- Chrome Extension MV3 architecture