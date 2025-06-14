// content.js

// --- Configuration ---
const MAX_SUMMARY_WORDS = 10; // Max words for the summary in the nav bar
const OBSERVER_DEBOUNCE_TIME = 1000; // Milliseconds to wait after DOM changes before updating nav

// --- State ---
let navBar;
let searchInput;
let allNavItems = []; // Store all nav items for filtering
let searchTimeout;
let lastProcessedQueryId = -1;
let lastProcessedResponseId = -1;
let observerTimeout;
let currentProvider; // Current AI provider instance
let sessionQueries = []; // Persistent storage for queries in current session

// --- Session Management ---

/**
 * Gets a unique session key based on the current page URL and provider
 * @returns {string} Session storage key
 */
function getSessionKey() {
    const url = window.location.href;
    const providerName = currentProvider ? currentProvider.name : 'unknown';
    return `ai-navigator-session-${providerName}-${btoa(url).slice(0, 20)}`;
}

/**
 * Loads persisted queries from session storage
 * @returns {Array} Array of stored query objects
 */
function loadSessionQueries() {
    try {
        const sessionKey = getSessionKey();
        const stored = sessionStorage.getItem(sessionKey);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.warn('AI Navigator: Error loading session queries:', error);
        return [];
    }
}

/**
 * Saves current queries to session storage
 */
function saveSessionQueries() {
    try {
        const sessionKey = getSessionKey();
        sessionStorage.setItem(sessionKey, JSON.stringify(sessionQueries));
    } catch (error) {
        console.warn('AI Navigator: Error saving session queries:', error);
    }
}

/**
 * Adds a new query to the session if it doesn't already exist
 * @param {Object} queryData - Query data object {id, text, element, index}
 */
function addQueryToSession(queryData) {
    // Check if query already exists (by ID or text)
    const existingIndex = sessionQueries.findIndex(q => 
        q.id === queryData.id || q.text === queryData.text
    );
    
    if (existingIndex === -1) {
        sessionQueries.push(queryData);
        saveSessionQueries();
        return true; // New query added
    }
    return false; // Query already existed
}

/**
 * Rebuilds navigation from session data and current DOM elements
 */
function rebuildNavigationFromSession() {
    if (!navBar) return;

    // Clear existing nav items
    const existingNavItems = navBar.querySelectorAll('.nav-item');
    existingNavItems.forEach(item => item.remove());
    allNavItems = [];

    // Rebuild from session data
    sessionQueries.forEach((queryData, index) => {
        // Try to find the element in the current DOM
        let targetElement = null;
        
        // First try to find by stored element reference (if still in DOM)
        if (queryData.elementId) {
            targetElement = document.getElementById(queryData.elementId);
        }
        
        // If not found, try to find by content matching
        if (!targetElement) {
            const selectors = currentProvider.getSelectors();
            const queryElements = document.querySelectorAll(selectors.queries);
            
            for (const element of queryElements) {
                try {
                    const elementText = currentProvider.extractTextContent(element);
                    if (elementText && elementText.trim() === queryData.text.trim()) {
                        targetElement = element;
                        break;
                    }
                } catch (error) {
                    // Continue searching
                }
            }
        }
        
        // Create a placeholder element if original not found (for virtual scrolling)
        if (!targetElement) {
            targetElement = createPlaceholderElement(queryData);
        }
        
        const summary = generateSummary(queryData.text);
        addNavItem(`<strong>${index + 1}.</strong> ${summary}`, 'query', targetElement, `session-query-${index}`);
    });
}

/**
 * Creates a placeholder element for queries not currently in DOM (virtual scrolling)
 * @param {Object} queryData - Query data object
 * @returns {HTMLElement} Placeholder element
 */
function createPlaceholderElement(queryData) {
    const placeholder = document.createElement('div');
    placeholder.className = 'ai-nav-placeholder';
    placeholder.dataset.queryText = queryData.text;
    placeholder.dataset.queryId = queryData.id;
    placeholder.style.display = 'none'; // Hidden placeholder
    document.body.appendChild(placeholder);
    
    // Add click handler to scroll to query (for AI Studio virtual scrolling)
    placeholder.addEventListener('click', () => {
        // For AI Studio, we might need to trigger scrolling to make the element visible
        console.log(`AI Navigator: Attempting to navigate to: ${queryData.text.substring(0, 50)}...`);
        // This could be enhanced with provider-specific navigation logic
    });
    
    return placeholder;
}

// --- Core Functions ---

/**
 * Creates and injects the navigation bar into the page.
 */
function createNavBar() {
    if (document.getElementById('ai-nav-bar')) {
        return; // Nav bar already exists
    }

    if (!currentProvider) {
        console.error('AI Navigator: No provider found for current page');
        return;
    }

    const layoutConfig = currentProvider.getLayoutConfig();
    navBar = document.createElement('div');
    navBar.id = 'ai-nav-bar';
    navBar.style.top = `${layoutConfig.topOffset}px`;
    navBar.style.height = `calc(100vh - ${layoutConfig.topOffset}px)`;
    
    // Create header with provider-specific title
    const header = document.createElement('h3');
    header.innerHTML = `${currentProvider.getNavTitle()} <span id="ai-nav-collapse-btn" title="Collapse Navigation">&raquo;</span>`;
    navBar.appendChild(header);
    
    // Create search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    
    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'search-input';
    searchInput.placeholder = 'Search questions...';
    
    const searchClear = document.createElement('div');
    searchClear.className = 'search-clear';
    searchClear.innerHTML = '&times;';
    searchClear.style.display = 'none';
    
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(searchClear);
    navBar.appendChild(searchContainer);
    
    document.body.appendChild(navBar);
    
    // Initialize search functionality
    searchInput.addEventListener('input', handleSearch);
    searchClear.addEventListener('click', clearSearch);

    const expandBtn = document.createElement('button');
    expandBtn.id = 'ai-nav-expand-btn';
    expandBtn.title = 'Expand Navigation';
    expandBtn.innerHTML = '&laquo;';
    document.body.appendChild(expandBtn);

    const collapseBtn = document.getElementById('ai-nav-collapse-btn');

    if (navBar && collapseBtn && expandBtn) {
        collapseBtn.addEventListener('click', toggleNav);
        expandBtn.addEventListener('click', toggleNav);
    } else {
        console.error('AI Navigator: Could not find all necessary elements for collapse/expand functionality.');
    }
    adjustMainContentLayout(); // Adjust layout after adding nav bar
}

/**
 * Generates a concise summary from text.
 * @param {string} text - The text to summarize.
 * @returns {string} A short summary.
 */
/**
 * Adjusts the main content area to make space for the sidebar.
 */
/**
 * Toggles the collapsed/expanded state of the navigation bar.
 */
function toggleNav() {
    if (!navBar) return;
    navBar.classList.toggle('collapsed');
    document.body.classList.toggle('ai-nav-collapsed');
    adjustMainContentLayout(); // Re-adjust margin after toggling
}

/**
 * Adjusts the main content area to make space for the sidebar.
 */
function adjustMainContentLayout() {
    if (!currentProvider) return;
    
    const layoutConfig = currentProvider.getLayoutConfig();
    const mainContentMargin = layoutConfig.navBarWidth + layoutConfig.gap + 'px';

    // Use provider-specific main content selectors
    const mainContentSelectors = currentProvider.getSelectors().mainContent;

    let mainContentArea = null;
    for (const selector of mainContentSelectors) {
        mainContentArea = document.querySelector(selector);
        if (mainContentArea) break;
    }

    if (mainContentArea) {
        if (navBar && navBar.classList.contains('collapsed')) {
            mainContentArea.style.marginRight = '0px';
            console.log('AI Navigator: Navbar collapsed, removed margin-right from main content area.');
        } else {
            mainContentArea.style.marginRight = mainContentMargin;
            console.log('AI Navigator: Applied margin-right to main content area:', mainContentArea);
        }
    } else {
        // As a fallback, if a specific main content area isn't found,
        // we might need to adjust the body or a primary wrapper.
        // For now, let's log that it wasn't found.
        console.warn(`AI Navigator: Could not identify ${currentProvider.name} main content area to adjust layout.`);
    }
}

/**
 * Generates a concise summary from text.
 * @param {string} text - The text to summarize.
 * @returns {string} A short summary.
 */
function generateSummary(text) {
    if (!text) return 'No content';
    const words = text.trim().split(/\s+/);
    if (words.length > MAX_SUMMARY_WORDS) {
        return words.slice(0, MAX_SUMMARY_WORDS).join(' ') + '...';
    }
    return words.join(' ');
}

/**
 * Adds a navigation item to the bar.
 * @param {string} summary - The text summary for the nav item.
 * @param {string} type - 'query' or 'response'.
 * @param {HTMLElement} targetElement - The element to scroll to.
 * @param {string} elementId - The ID of the target element.
 */
function addNavItem(summary, type, targetElement, elementId) {
    if (!navBar || !targetElement) return;

    // Ensure target element has an ID for scrolling, or assign one
    if (!targetElement.id) {
        targetElement.id = `ai-nav-target-${type}-${elementId.replace(/[^a-zA-Z0-9-_]/g, '')}`;
    }
    const navItemId = `nav-item-for-${targetElement.id}`;

    // Avoid adding duplicate nav items
    if (document.getElementById(navItemId)) {
        return;
    }

    const fullText = targetElement.innerText || '';
    const navItem = document.createElement('div');
    navItem.classList.add('nav-item', type);
    navItem.innerHTML = summary;
    navItem.title = fullText.substring(0, 200) + (fullText.length > 200 ? '...' : ''); // Full text on hover
    navItem.id = navItemId;
    
    // Store full text for searching
    navItem.dataset.fullText = fullText.toLowerCase();
    navItem.dataset.summary = summary.toLowerCase();

    navItem.addEventListener('click', () => {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Optional: Highlight active item (implement with an 'active' class)
        document.querySelectorAll('#ai-nav-bar .nav-item').forEach(item => item.classList.remove('active'));
        navItem.classList.add('active');
    });

    navBar.appendChild(navItem);
    allNavItems.push(navItem); // Store for filtering
}

/**
 * Finds and processes all user queries on the page using the current provider.
 */
function processChatElements() {
    console.log(`AI Navigator: Processing chat elements for ${currentProvider?.name || 'unknown provider'}...`);

    if (!currentProvider) {
        console.error('AI Navigator: No provider available for processing chat elements');
        return;
    }

    const selectors = currentProvider.getSelectors();

    // --- Process User Queries ---
    const queryElements = document.querySelectorAll(selectors.queries);
    let newQueriesFound = false;

    queryElements.forEach((queryElement, index) => {
        try {
            const textContent = currentProvider.extractTextContent(queryElement);
            if (textContent && textContent.trim()) {
                // Create query data object
                const queryId = queryElement.id || `query-${Date.now()}-${index}`;
                const queryData = {
                    id: queryId,
                    text: textContent.trim(),
                    elementId: queryElement.id,
                    timestamp: Date.now(),
                    index: sessionQueries.length
                };

                // Ensure element has an ID for future reference
                if (!queryElement.id) {
                    queryElement.id = queryId;
                    queryData.elementId = queryId;
                }

                // Add to session if it's new
                if (addQueryToSession(queryData)) {
                    newQueriesFound = true;
                    console.log(`AI Navigator: Added new query to session: ${textContent.substring(0, 50)}...`);
                }
            } else {
                console.warn(`AI Navigator: Could not extract text content for query element:`, queryElement);
            }
        } catch (error) {
            console.warn(`AI Navigator: Error processing query element:`, error, queryElement);
        }
    });

    // Rebuild navigation from complete session data
    rebuildNavigationFromSession();

    if (newQueriesFound) {
        console.log(`AI Navigator: Session now contains ${sessionQueries.length} total queries`);
    }

    // Note: Only processing user queries for navigation
    // Assistant responses are not included in the navigation sidebar
}


/**
 * Sets up a MutationObserver to watch for new chat messages.
 */
function observeChatContainer() {
    if (!currentProvider) {
        console.error('AI Navigator: No provider available for setting up observer');
        return;
    }

    let chatContainer = document.body; // Fallback to body
    const chatContainerSelector = currentProvider.getChatContainerSelector();
    
    if (chatContainerSelector !== 'body') {
        const specificContainer = document.querySelector(chatContainerSelector);
        if (specificContainer) {
            chatContainer = specificContainer;
        }
    }

    // If no specific container found, try to find a scrollable container containing the first query
    if (chatContainer === document.body) {
        const selectors = currentProvider.getSelectors();
        const firstQuery = document.querySelector(selectors.queries);
        if (firstQuery && firstQuery.parentElement) {
            // Attempt to find a more specific scrollable container
            let potentialContainer = firstQuery.parentElement;
            while(potentialContainer && potentialContainer !== document.body) {
                if (potentialContainer.scrollHeight > potentialContainer.clientHeight) { // Check if it's scrollable
                    const styles = window.getComputedStyle(potentialContainer);
                    if (styles.overflowY === 'auto' || styles.overflowY === 'scroll') {
                        chatContainer = potentialContainer;
                        break;
                    }
                }
                potentialContainer = potentialContainer.parentElement;
            }
            if (chatContainer === document.body && firstQuery.parentElement.parentElement) {
                // If no scrollable parent, observe the direct parent of the first query/response block
                chatContainer = firstQuery.parentElement.parentElement || document.body;
            }
        }
    }

    console.log(`AI Navigator: Observing container for ${currentProvider.name}:`, chatContainer);

    const observer = new MutationObserver((mutationsList, observer) => {
        // Debounce the processing to avoid multiple rapid updates
        clearTimeout(observerTimeout);
        observerTimeout = setTimeout(() => {
            console.log(`AI Navigator: DOM changes detected for ${currentProvider.name}, reprocessing chat elements.`);
            processChatElements();
        }, OBSERVER_DEBOUNCE_TIME);
    });

    observer.observe(chatContainer, { childList: true, subtree: true });
    console.log(`AI Navigator: MutationObserver started for ${currentProvider.name}.`);
}

// --- Search Functions ---

/**
 * Handles search input with debouncing for better UX
 */
function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    // Show/hide clear button
    const searchClear = navBar.querySelector('.search-clear');
    if (searchClear) {
        searchClear.style.display = searchTerm ? 'block' : 'none';
    }
    
    // Debounce search for better performance
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        filterNavItems(searchTerm);
    }, 200);
}

/**
 * Filters navigation items based on search term
 * @param {string} searchTerm - The search term to filter by
 */
function filterNavItems(searchTerm) {
    allNavItems.forEach(item => {
        if (!searchTerm) {
            // Show all items when no search term
            item.style.display = 'block';
            return;
        }
        
        // Search in both summary and full text
        const matchesSearch = 
            item.dataset.summary.includes(searchTerm) || 
            item.dataset.fullText.includes(searchTerm);
        
        item.style.display = matchesSearch ? 'block' : 'none';
    });
}

/**
 * Clears the search input and shows all items
 */
function clearSearch() {
    searchInput.value = '';
    const searchClear = navBar.querySelector('.search-clear');
    if (searchClear) {
        searchClear.style.display = 'none';
    }
    filterNavItems(''); // Show all items
}

// --- Initialization ---

// Ensure the script runs after the page is mostly loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    console.log('AI Navigator: Initializing...');
    
    // Initialize provider system
    const providerFactory = new ProviderFactory();
    currentProvider = providerFactory.getCurrentProvider();
    
    if (!currentProvider) {
        console.warn('AI Navigator: No matching provider found for current page:', window.location.href);
        return;
    }
    
    console.log(`AI Navigator: Using provider: ${currentProvider.name}`);
    
    // Load existing session data
    sessionQueries = loadSessionQueries();
    console.log(`AI Navigator: Loaded ${sessionQueries.length} queries from session storage`);
    
    createNavBar();
    
    // Initial processing of any existing elements
    // It might take a moment for the UI to fully render, so a small delay or retry mechanism can be helpful
    setTimeout(() => {
        processChatElements();
        observeChatContainer(); // Start observing for new messages
    }, 2000); // Wait a bit for initial content to load
}

// Optional: Add a way to toggle the nav bar visibility, e.g., via a browser action or a button
// This could use chrome.storage.sync to remember the state.
