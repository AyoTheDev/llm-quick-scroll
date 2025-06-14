// providers.js - Provider abstraction system for different AI services

/**
 * Base provider interface that all AI service providers must implement
 */
class AIProvider {
    constructor(config) {
        this.config = config;
        this.name = config.name;
        this.domains = config.domains;
    }

    /**
     * Get selectors for finding chat elements
     * @returns {Object} Object containing selectors for queries, responses, containers, etc.
     */
    getSelectors() {
        throw new Error('getSelectors must be implemented by provider');
    }

    /**
     * Get configuration for layout adjustments
     * @returns {Object} Layout configuration
     */
    getLayoutConfig() {
        throw new Error('getLayoutConfig must be implemented by provider');
    }

    /**
     * Extract text content from a chat element
     * @param {HTMLElement} element - The chat element
     * @returns {string} The extracted text content
     */
    extractTextContent(element) {
        throw new Error('extractTextContent must be implemented by provider');
    }

    /**
     * Determine if current URL matches this provider
     * @returns {boolean} True if current page matches this provider
     */
    matches() {
        const currentUrl = window.location.href;
        return this.domains.some(domain => currentUrl.includes(domain));
    }

    /**
     * Get provider-specific chat container selector
     * @returns {string} Selector for the main chat container
     */
    getChatContainerSelector() {
        return this.getSelectors().chatContainer || 'body';
    }

    /**
     * Get provider-specific navigation bar title
     * @returns {string} Title for the navigation bar
     */
    getNavTitle() {
        return this.config.navTitle || `${this.name} Navigation`;
    }
}

/**
 * Gemini provider implementation
 */
class GeminiProvider extends AIProvider {
    constructor() {
        super({
            name: 'Gemini',
            navTitle: 'Chat Navigation',
            domains: ['gemini.google.com'],
        });
    }

    getSelectors() {
        return {
            queries: 'span.user-query-bubble-with-background',
            queryText: 'div.query-text',
            responses: 'div.response-content', // Update as needed
            responseText: 'div.response-text', // Update as needed
            chatContainer: 'body',
            mainContent: [
                'main',
                '[role="main"]',
                '.main-content',
                'body > div:first-child > div:nth-child(2)'
            ]
        };
    }

    getLayoutConfig() {
        return {
            navBarWidth: 250,
            gap: 10,
            topOffset: 60
        };
    }

    extractTextContent(element) {
        const textContainer = element.querySelector(this.getSelectors().queryText);
        return textContainer ? textContainer.innerText : element.innerText;
    }
}

/**
 * ChatGPT provider implementation
 */
class ChatGPTProvider extends AIProvider {
    constructor() {
        super({
            name: 'ChatGPT',
            navTitle: 'Chat Navigation',
            domains: ['chatgpt.com'],
        });
    }

    getSelectors() {
        return {
            queries: '[data-message-author-role="user"]',
            queryText: '.whitespace-pre-wrap',
            responses: '[data-message-author-role="assistant"]',
            responseText: '.markdown.prose',
            chatContainer: 'main',
            mainContent: [
                'main',
                '[role="main"]',
                '.flex-1'
            ]
        };
    }

    getLayoutConfig() {
        return {
            navBarWidth: 250,
            gap: 10,
            topOffset: 0
        };
    }

    extractTextContent(element) {
        // For user messages, text is in .whitespace-pre-wrap
        const userTextContainer = element.querySelector('.whitespace-pre-wrap');
        if (userTextContainer) {
            return userTextContainer.innerText;
        }
        
        // For assistant messages, text is in .markdown.prose
        const assistantTextContainer = element.querySelector('.markdown.prose');
        if (assistantTextContainer) {
            return assistantTextContainer.innerText;
        }
        
        // Fallback to element text
        return element.innerText;
    }
}

/**
 * Claude provider implementation
 */
class ClaudeProvider extends AIProvider {
    constructor() {
        super({
            name: 'Claude',
            navTitle: 'Chat Navigation',
            domains: ['claude.ai'],
        });
    }

    getSelectors() {
        return {
            queries: '[data-testid="user-message"]',
            queryText: '.whitespace-pre-wrap',
            responses: '[data-is-streaming="false"]',
            responseText: '.grid-cols-1.grid',
            chatContainer: '.flex-1.flex.flex-col',
            mainContent: [
                'main',
                '.flex-1',
                '.max-w-3xl'
            ]
        };
    }

    getLayoutConfig() {
        return {
            navBarWidth: 250,
            gap: 10,
            topOffset: 0
        };
    }

    extractTextContent(element) {
        // For user messages, text is in .whitespace-pre-wrap paragraphs
        const userMessageContainer = element.querySelector('[data-testid="user-message"]');
        if (userMessageContainer) {
            // Get all paragraphs with whitespace-pre-wrap inside user message
            const textParagraphs = userMessageContainer.querySelectorAll('.whitespace-pre-wrap');
            if (textParagraphs.length > 0) {
                return Array.from(textParagraphs).map(p => p.innerText).join(' ');
            }
        }
        
        // For assistant messages, check if element has data-is-streaming attribute
        if (element.hasAttribute('data-is-streaming')) {
            // Look for the content grid container
            const contentContainer = element.querySelector('.grid-cols-1.grid');
            if (contentContainer) {
                return contentContainer.innerText;
            }
        }
        
        // Fallback: look for any .whitespace-pre-wrap in the element
        const anyTextContainer = element.querySelector('.whitespace-pre-wrap');
        if (anyTextContainer) {
            return anyTextContainer.innerText;
        }
        
        // Final fallback to element text
        return element.innerText;
    }
}

/**
 * Google AI Studio provider implementation
 */
class AIStudioProvider extends AIProvider {
    constructor() {
        super({
            name: 'AI Studio',
            navTitle: 'Chat Navigation',
            domains: ['aistudio.google.com'],
        });
    }

    getSelectors() {
        return {
            queries: '[data-turn-role="User"]',
            queryText: 'ms-text-chunk',
            responses: '[data-turn-role="Model"]',
            responseText: 'ms-text-chunk',
            chatContainer: 'ms-chat-turn',
            mainContent: [
                'main',
                '[role="main"]',
                '.ng-star-inserted'
            ]
        };
    }

    getLayoutConfig() {
        return {
            navBarWidth: 250,
            gap: 10,
            topOffset: 60
        };
    }

    extractTextContent(element) {
        // Look for ms-text-chunk elements within the turn
        const textChunks = element.querySelectorAll('ms-text-chunk');
        if (textChunks.length > 0) {
            // Get text from all chunks and combine them
            return Array.from(textChunks).map(chunk => {
                // Look for the actual text content within cmark nodes
                const cmarkNodes = chunk.querySelectorAll('ms-cmark-node span');
                if (cmarkNodes.length > 0) {
                    return Array.from(cmarkNodes).map(node => node.innerText).join(' ');
                }
                return chunk.innerText;
            }).join(' ');
        }
        
        // Fallback: look for any span elements with text content
        const textSpans = element.querySelectorAll('span.ng-star-inserted');
        if (textSpans.length > 0) {
            const textContent = Array.from(textSpans)
                .map(span => span.innerText)
                .filter(text => text && text.trim().length > 0)
                .join(' ');
            if (textContent) {
                return textContent;
            }
        }
        
        // Final fallback to element text
        return element.innerText;
    }
}

/**
 * Provider factory that automatically detects and returns the appropriate provider
 */
class ProviderFactory {
    constructor() {
        this.providers = [
            new GeminiProvider(),
            new ChatGPTProvider(),
            new ClaudeProvider(),
            new AIStudioProvider()
        ];
    }

    /**
     * Get the provider that matches the current page
     * @returns {AIProvider|null} The matching provider or null if none found
     */
    getCurrentProvider() {
        return this.providers.find(provider => provider.matches()) || null;
    }

    /**
     * Get all supported domains for manifest.json
     * @returns {Array<string>} Array of all supported URL patterns
     */
    getAllDomains() {
        const domains = [];
        this.providers.forEach(provider => {
            provider.domains.forEach(domain => {
                if (domain === 'gemini.google.com') {
                    domains.push('https://gemini.google.com/app/*');
                    domains.push('https://gemini.google.com/chat/*');
                } else if (domain === 'chatgpt.com') {
                    domains.push('https://chatgpt.com/c/*');
                    domains.push('https://chatgpt.com/*');
                } else if (domain === 'claude.ai') {
                    domains.push('https://claude.ai/chat/*');
                    domains.push('https://claude.ai/*');
                } else if (domain === 'aistudio.google.com') {
                    domains.push('https://aistudio.google.com/prompts/*');
                    domains.push('https://aistudio.google.com/live/*');
                    domains.push('https://aistudio.google.com/*');
                }
            });
        });
        return domains;
    }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProviderFactory, AIProvider };
} else {
    window.ProviderFactory = ProviderFactory;
    window.AIProvider = AIProvider;
}