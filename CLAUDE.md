# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Chat Navigator is a browser extension that adds navigation sidebars to AI chat platforms (Gemini, ChatGPT, Claude, AI Studio). The extension uses a sophisticated Provider Pattern to abstract platform-specific DOM interactions while maintaining a single codebase.

## Architecture

### Core Design Pattern: Provider Pattern
The extension uses a Provider Pattern with Factory for multi-platform support:

- **Base Provider**: `AIProvider` class defines interface (`getSelectors()`, `getLayoutConfig()`, `extractTextContent()`)
- **Concrete Providers**: Platform-specific implementations (GeminiProvider, ChatGPTProvider, ClaudeProvider, AIStudioProvider)
- **Provider Factory**: `ProviderFactory` auto-detects current platform and returns appropriate provider

### File Structure
- `manifest.json` - Extension configuration and content script injection rules
- `providers.js` - Provider pattern implementation (Strategy layer)
- `content.js` - Main application logic (~700 lines, handles UI and event management)
- `styles.css` - Navigation sidebar styling with smooth transitions

### State Management
- **In-memory only**: No persistent storage, state resets on page reload
- **Session-scoped**: `sessionQueries` array stores current chat messages
- **Live validation**: `validateSessionQueries()` removes stale DOM references

## Development Workflow

### Installation for Development
```bash
# Load unpacked extension in Chrome:
# 1. Navigate to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select project directory
```

### Testing Changes
- No build process required - vanilla JavaScript
- Reload extension in chrome://extensions after code changes
- Test across all supported platforms: Gemini, ChatGPT, Claude, AI Studio

## Key Technical Details

### Event Handling Architecture
1. **MutationObserver**: Watches DOM changes with 1000ms debounce
2. **Input Listeners**: Detects form submissions with 200ms delay for immediate updates
3. **Page Navigation**: Handles SPA routing with custom history.pushState wrapper

### Provider Selectors
Each provider defines platform-specific selectors:
- **queries**: User message elements
- **responses**: AI response elements  
- **inputField**: Text input areas
- **submitButton**: Send buttons
- **chatContainer**: Main chat container

### Critical Maintenance Notes
- **Selector Brittleness**: Platform UI changes can break selectors - monitor target sites
- **Provider Extension**: Add new AI platforms by creating new provider class
- **Input Detection**: Recent addition for immediate sidebar updates on message submission

### Session Management
- **Session Scope**: Single page view lifecycle
- **Data Validation**: Continuous verification against live DOM to prevent stale references
- **Memory Management**: Automatic cleanup on page navigation

## Common Issues

### Selectors Breaking
When AI platforms update their UI, selectors in providers.js may need updates. Check browser console for "AI Navigator" logs to diagnose issues.

### New Platform Support
To add a new AI chat platform:
1. Create new provider class extending `AIProvider`
2. Implement required methods with platform-specific selectors
3. Add URL patterns to manifest.json matches array
4. Register provider in ProviderFactory

### Performance Considerations
- Uses debouncing for DOM observation (1000ms) and search (200ms)
- Efficient DOM querying with fallback selectors
- Memory cleanup through session validation