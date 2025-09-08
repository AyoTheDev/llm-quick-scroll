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
let isLoading = false; // Loading state for data refresh
let currentUrl = window.location.href; // Track current URL for change detection
let currentNavigationIndex = -1; // Track currently highlighted nav item for keyboard navigation
let keyboardNavigationActive = false; // Track if keyboard navigation is active

// --- Focus Mode State ---
let focusModeEnabled = true; // Master toggle for focus mode
let sidebarCollapsedByFocus = false; // Track if sidebar was auto-collapsed by focus
let sidebarWasCollapsedManually = false; // Track manual collapse state before focus
let focusBlurTimeout = null; // Timeout for handling blur events with delay
let attachedInputElements = new Set(); // Track attached input listeners

// --- Loading State Management ---

/**
 * Shows loading indicator in the navigation bar
 */
function showLoadingState() {
    if (!navBar || isLoading) return;
    
    isLoading = true;
    
    // Clear existing nav items
    const existingNavItems = navBar.querySelectorAll('.nav-item');
    existingNavItems.forEach(item => item.remove());
    allNavItems = [];
    resetNavigationIndex(); // Reset keyboard navigation when clearing items
    
    // Create loading indicator
    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'nav-loading-container';
    loadingContainer.innerHTML = `
        <div class="nav-loading-spinner"></div>
        <div class="nav-loading-text">Loading questions...</div>
    `;
    
    navBar.appendChild(loadingContainer);
}

/**
 * Hides loading indicator and restores normal navigation
 */
function hideLoadingState() {
    if (!navBar || !isLoading) return;
    
    const loadingContainer = navBar.querySelector('.nav-loading-container');
    if (loadingContainer) {
        loadingContainer.remove();
    }
    
    isLoading = false;
}

/**
 * Handles focus mode toggle button click
 */
function handleFocusModeToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const focusModeBtn = document.getElementById('ai-nav-focus-mode-btn');
    if (!focusModeBtn) return;
    
    // Toggle focus mode
    toggleFocusMode(!focusModeEnabled);
    
    // Update button visual state
    if (focusModeEnabled) {
        focusModeBtn.classList.add('active');
        focusModeBtn.title = 'Focus Mode: ON - Sidebar auto-hides when typing';
    } else {
        focusModeBtn.classList.remove('active');
        focusModeBtn.title = 'Focus Mode: OFF - Click to enable auto-hide when typing';
    }
    
    console.log(`AI Navigator: Focus mode ${focusModeEnabled ? 'enabled' : 'disabled'} by user`);
}

/**
 * Handles refresh button click with loading state and error handling
 */
function handleRefreshClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const refreshBtn = document.getElementById('ai-nav-refresh-btn');
    if (!refreshBtn) return;
    
    // Clear search bar if it has content
    if (searchInput && searchInput.value.trim()) {
        clearSearch();
        console.log('AI Navigator: Search cleared during refresh');
    }
    
    // Disable button and show loading state
    refreshBtn.disabled = true;
    refreshBtn.classList.add('loading');
    
    console.log('AI Navigator: Refresh button clicked, starting data refresh...');
    
    try {
        refreshData();
        
        // Re-enable button after refresh completes
        setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('loading');
            console.log('AI Navigator: Refresh button re-enabled');
        }, 600); // Slightly longer than refreshData delay to ensure completion
        
    } catch (error) {
        console.error('AI Navigator: Error during refresh:', error);
        
        // Re-enable button even if refresh fails
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('loading');
        
        // Could show error feedback here in the future
        console.warn('AI Navigator: Refresh operation failed, button re-enabled');
    }
}

/**
 * Refreshes all data - clears session and reprocesses page
 */
function refreshData() {
    console.log('AI Navigator: Refreshing data...');
    
    showLoadingState();
    
    // Clear session data
    sessionQueries = [];
    
    // Reset focus mode state
    resetFocusModeState();
    
    // Process with a small delay to show loading state
    setTimeout(() => {
        try {
            processChatElements();
            hideLoadingState();
            // Reattach focus mode listeners after refresh
            setupFocusMode();
            console.log('AI Navigator: Data refresh completed');
        } catch (error) {
            hideLoadingState();
            console.error('AI Navigator: Error during data refresh:', error);
            throw error; // Re-throw to be caught by handleRefreshClick
        }
    }, 500);
}

// --- Page Change Detection ---

/**
 * Detects URL changes and refreshes data accordingly
 */
function handleUrlChange() {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
        console.log(`AI Navigator: URL changed from ${currentUrl} to ${newUrl}`);
        currentUrl = newUrl;
        
        // Check if we're still on a supported provider page
        const providerFactory = new ProviderFactory();
        const newProvider = providerFactory.getCurrentProvider();
        
        if (newProvider && newProvider.name === currentProvider?.name) {
            // Same provider, different page - refresh data
            refreshData();
        } else if (newProvider) {
            // Different provider - reinitialize
            console.log(`AI Navigator: Provider changed to ${newProvider.name}, reinitializing...`);
            currentProvider = newProvider;
            refreshData();
        } else {
            // No longer on supported page - could hide navbar
            console.log('AI Navigator: No longer on supported page');
        }
    }
}

/**
 * Sets up page change detection
 */
function setupPageChangeDetection() {
    // Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', handleUrlChange);
    
    // Listen for pushstate/replacestate (programmatic navigation)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
        originalPushState.apply(history, arguments);
        setTimeout(handleUrlChange, 100); // Small delay to let page update
    };
    
    history.replaceState = function() {
        originalReplaceState.apply(history, arguments);
        setTimeout(handleUrlChange, 100);
    };
    
    // Listen for visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Tab became visible - check for URL changes and refresh
            setTimeout(() => {
                handleUrlChange();
                // Also refresh data in case content changed while tab was hidden
                if (currentProvider) {
                    refreshData();
                }
            }, 500);
        }
    });
    
    console.log('AI Navigator: Page change detection setup complete');
}

// --- Session Management ---

/**
 * Loads persisted queries (in-memory only, resets on page reload)
 * @returns {Array} Array of stored query objects
 */
function loadSessionQueries() {
    // Return empty array - fresh start on each page load
    return [];
}

/**
 * Saves current queries (in-memory only, no persistence)
 */
function saveSessionQueries() {
    // No-op - we don't persist to storage to avoid stale data
    // Data is kept in memory only during the current page session
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
 * Validates session queries against current DOM and removes inactive ones
 * @returns {Array} Array of validated and active query objects
 */
function validateSessionQueries() {
    if (!currentProvider) return sessionQueries;

    const selectors = currentProvider.getSelectors();
    const currentDOMQueries = document.querySelectorAll(selectors.queries);
    const validQueries = [];
    let removedCount = 0;

    console.log(`AI Navigator: Validating ${sessionQueries.length} stored queries against ${currentDOMQueries.length} DOM queries`);

    sessionQueries.forEach((queryData, index) => {
        let isValid = false;
        let targetElement = null;

        // First try to find by stored element ID
        if (queryData.elementId) {
            targetElement = document.getElementById(queryData.elementId);
            if (targetElement) {
                // Verify the element still contains the expected text
                try {
                    const currentText = currentProvider.extractTextContent(targetElement);
                    if (currentText && currentText.trim() === queryData.text.trim()) {
                        isValid = true;
                    }
                } catch (error) {
                    // Element exists but can't extract text - might be broken
                    console.warn(`AI Navigator: Could not extract text from stored element ${queryData.elementId}`);
                }
            }
        }

        // If not found by ID, try to find by content matching
        if (!isValid) {
            for (const element of currentDOMQueries) {
                try {
                    const elementText = currentProvider.extractTextContent(element);
                    if (elementText && elementText.trim() === queryData.text.trim()) {
                        targetElement = element;
                        // Update the element ID reference if it changed
                        if (element.id && element.id !== queryData.elementId) {
                            queryData.elementId = element.id;
                        }
                        isValid = true;
                        break;
                    }
                } catch (error) {
                    // Continue searching
                }
            }
        }

        if (isValid) {
            validQueries.push(queryData);
        } else {
            removedCount++;
            console.log(`AI Navigator: Removed inactive query: ${queryData.text.substring(0, 50)}...`);
        }
    });

    if (removedCount > 0) {
        console.log(`AI Navigator: Validation complete - removed ${removedCount} inactive queries, ${validQueries.length} remain active`);
        // Update session queries with only valid ones
        sessionQueries = validQueries;
        // Re-index the valid queries
        sessionQueries.forEach((query, index) => {
            query.index = index;
        });
    } else {
        console.log(`AI Navigator: Validation complete - all ${validQueries.length} queries are still active`);
    }

    return validQueries;
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

    // Validate queries first to remove any broken/inactive ones
    const validQueries = validateSessionQueries();

    // Rebuild from validated session data
    validQueries.forEach((queryData, index) => {
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
                        // Update element ID if it changed
                        if (element.id && element.id !== queryData.elementId) {
                            queryData.elementId = element.id;
                        }
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
        console.warn('AI Navigator: This question may not be currently visible due to virtual scrolling');
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
    navBar.classList.add('collapsed'); // Start with sidebar collapsed by default
    navBar.style.top = `${layoutConfig.topOffset}px`;
    navBar.style.height = `calc(100vh - ${layoutConfig.topOffset}px)`;
    
    // Create header with provider-specific title and control buttons
    const header = document.createElement('h3');
    header.innerHTML = `<div class="header-buttons">
        <button id="ai-nav-focus-mode-btn" title="Toggle Focus Mode (Auto-hide sidebar when typing)" aria-label="Toggle Focus Mode" class="${focusModeEnabled ? 'active' : ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        </button>
        <button id="ai-nav-refresh-btn" title="Refresh Chat Navigation" aria-label="Refresh Chat Navigation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="m20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
            </svg>
        </button>
    </div>${currentProvider.getNavTitle()} <span id="ai-nav-collapse-btn" title="Collapse Navigation">&raquo;</span>`;
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
    document.body.classList.add('ai-nav-collapsed'); // Start with body class for collapsed state
    
    // Initialize search functionality
    searchInput.addEventListener('input', handleSearch);
    searchClear.addEventListener('click', clearSearch);

    const expandBtn = document.createElement('button');
    expandBtn.id = 'ai-nav-expand-btn';
    expandBtn.title = 'Expand Navigation';
    expandBtn.innerHTML = '&laquo;';
    document.body.appendChild(expandBtn);

    const collapseBtn = document.getElementById('ai-nav-collapse-btn');
    const refreshBtn = document.getElementById('ai-nav-refresh-btn');
    const focusModeBtn = document.getElementById('ai-nav-focus-mode-btn');

    if (navBar && collapseBtn && expandBtn) {
        collapseBtn.addEventListener('click', toggleNav);
        expandBtn.addEventListener('click', toggleNav);
    } else {
        console.error('AI Navigator: Could not find all necessary elements for collapse/expand functionality.');
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefreshClick);
    } else {
        console.error('AI Navigator: Could not find refresh button element.');
    }

    if (focusModeBtn) {
        focusModeBtn.addEventListener('click', handleFocusModeToggle);
    } else {
        console.error('AI Navigator: Could not find focus mode button element.');
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
    
    const wasCollapsed = navBar.classList.contains('collapsed');
    
    // If expanding and sidebar was auto-collapsed by focus, clear focus mode state
    if (wasCollapsed && sidebarCollapsedByFocus) {
        sidebarCollapsedByFocus = false;
        console.log('AI Navigator: Manual expand - clearing focus mode auto-collapse state');
    }
    
    navBar.classList.toggle('collapsed');
    document.body.classList.toggle('ai-nav-collapsed');
    adjustMainContentLayout(); // Re-adjust margin after toggling
}

/**
 * Adjusts the main content area to make space for the sidebar.
 * @param {number} retryCount - Number of times to retry finding the element
 */
function adjustMainContentLayout(retryCount = 0) {
    if (!currentProvider) return;
    
    const layoutConfig = currentProvider.getLayoutConfig();
    const mainContentMargin = layoutConfig.navBarWidth + layoutConfig.gap + 'px';

    // Use provider-specific main content selectors
    const mainContentSelectors = currentProvider.getSelectors().mainContent;

    let mainContentArea = null;
    for (const selector of mainContentSelectors) {
        mainContentArea = document.querySelector(selector);
        if (mainContentArea) {
            console.log(`AI Navigator: Found main content area using selector: ${selector}`, mainContentArea);
            break;
        }
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
        // Retry mechanism for when DOM isn't fully loaded yet
        if (retryCount < 3) {
            console.log(`AI Navigator: Main content area not found for ${currentProvider.name}, retrying in 1 second... (attempt ${retryCount + 1}/3)`);
            setTimeout(() => {
                adjustMainContentLayout(retryCount + 1);
            }, 1000);
        } else {
            // Final attempt - try some common fallback selectors
            const fallbackSelectors = [
                'body > div:first-child',
                '[role="main"]',
                'main',
                '.main-content',
                '.content',
                '#app',
                '#root'
            ];
            
            for (const selector of fallbackSelectors) {
                mainContentArea = document.querySelector(selector);
                if (mainContentArea) {
                    console.log(`AI Navigator: Found fallback content area using: ${selector}`, mainContentArea);
                    if (navBar && !navBar.classList.contains('collapsed')) {
                        mainContentArea.style.marginRight = mainContentMargin;
                        console.log('AI Navigator: Applied margin-right to fallback content area');
                    }
                    return;
                }
            }
            
            console.warn(`AI Navigator: Could not identify ${currentProvider.name} main content area to adjust layout after 3 attempts. Sidebar will still work but layout may not be optimal.`);
        }
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

    // Rebuild navigation from complete session data (includes validation)
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
            
            // Reattach focus mode listeners in case new input fields were added
            reattachInputListeners();
        }, OBSERVER_DEBOUNCE_TIME);
    });

    observer.observe(chatContainer, { childList: true, subtree: true });
    console.log(`AI Navigator: MutationObserver started for ${currentProvider.name}.`);
    
    // Add input event listeners for immediate question detection
    setupInputListeners();
}

/**
 * Sets up input event listeners for immediate question detection
 */
function setupInputListeners() {
    if (!currentProvider) {
        console.error('AI Navigator: No provider available for setting up input listeners');
        return;
    }

    const selectors = currentProvider.getSelectors();
    console.log(`AI Navigator: Setting up input listeners for ${currentProvider.name}`);

    // Listen for Enter key in input fields
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            const inputField = document.querySelector(selectors.inputField);
            if (inputField && (inputField.contains(e.target) || inputField === e.target)) {
                console.log(`AI Navigator: Enter key detected in input field for ${currentProvider.name}`);
                // Small delay to allow the message to be processed and added to DOM
                setTimeout(() => {
                    processChatElements();
                }, 200);
            }
        }
    });

    // Listen for submit button clicks
    document.addEventListener('click', (e) => {
        const submitButton = document.querySelector(selectors.submitButton);
        if (submitButton && (submitButton.contains(e.target) || submitButton === e.target || 
            e.target.closest(selectors.submitButton))) {
            console.log(`AI Navigator: Submit button clicked for ${currentProvider.name}`);
            // Small delay to allow the message to be processed and added to DOM
            setTimeout(() => {
                processChatElements();
            }, 200);
        }
    });

    // Listen for form submissions as additional fallback
    document.addEventListener('submit', (e) => {
        const inputContainer = document.querySelector(selectors.inputContainer);
        if (inputContainer && inputContainer.contains(e.target)) {
            console.log(`AI Navigator: Form submission detected for ${currentProvider.name}`);
            // Small delay to allow the message to be processed and added to DOM
            setTimeout(() => {
                processChatElements();
            }, 200);
        }
    });

    console.log(`AI Navigator: Input listeners set up for ${currentProvider.name}`);
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
    
    // Reset navigation index when search results change
    resetNavigationIndex();
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

// --- Keyboard Navigation Functions ---

/**
 * Handles arrow key navigation through the sidebar items
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleArrowNavigation(event) {
    // Only handle arrow keys when sidebar is visible and has items
    if (!navBar || navBar.classList.contains('collapsed') || allNavItems.length === 0) {
        return;
    }

    // Only handle arrow keys and Enter/Escape
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
        return;
    }

    // Don't interfere when user is typing in search or input fields
    const activeElement = document.activeElement;
    if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.contentEditable === 'true'
    )) {
        // But allow Escape to clear search if in search field
        if (event.key === 'Escape' && activeElement === searchInput) {
            clearSearch();
            clearNavigationHighlight();
            event.preventDefault();
        }
        return;
    }

    // Get only visible nav items for navigation
    const visibleNavItems = allNavItems.filter(item => 
        item.style.display !== 'none' && item.offsetParent !== null
    );
    
    if (visibleNavItems.length === 0) {
        return;
    }

    event.preventDefault(); // Prevent default browser behavior

    switch (event.key) {
        case 'ArrowDown':
            keyboardNavigationActive = true;
            currentNavigationIndex = (currentNavigationIndex + 1) % visibleNavItems.length;
            updateNavigationHighlight(visibleNavItems);
            break;
            
        case 'ArrowUp':
            keyboardNavigationActive = true;
            currentNavigationIndex = currentNavigationIndex <= 0 ? 
                visibleNavItems.length - 1 : currentNavigationIndex - 1;
            updateNavigationHighlight(visibleNavItems);
            break;
            
        case 'Enter':
            if (keyboardNavigationActive && currentNavigationIndex >= 0) {
                const highlightedItem = visibleNavItems[currentNavigationIndex];
                if (highlightedItem) {
                    highlightedItem.click(); // Trigger the existing click handler
                }
            }
            break;
            
        case 'Escape':
            clearNavigationHighlight();
            break;
    }
}

/**
 * Updates the visual highlight for keyboard navigation
 * @param {Array} visibleNavItems - Array of visible navigation items
 */
function updateNavigationHighlight(visibleNavItems) {
    // Clear all previous highlights
    allNavItems.forEach(item => item.classList.remove('nav-item-highlighted'));
    
    // Add highlight to current item
    if (currentNavigationIndex >= 0 && currentNavigationIndex < visibleNavItems.length) {
        const currentItem = visibleNavItems[currentNavigationIndex];
        currentItem.classList.add('nav-item-highlighted');
        
        // Auto-scroll the highlighted item into view within the sidebar
        currentItem.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
        });
    }
}

/**
 * Clears navigation highlight and resets navigation state
 */
function clearNavigationHighlight() {
    allNavItems.forEach(item => item.classList.remove('nav-item-highlighted'));
    currentNavigationIndex = -1;
    keyboardNavigationActive = false;
}

/**
 * Resets navigation index when nav items change (search, refresh, etc.)
 */
function resetNavigationIndex() {
    clearNavigationHighlight();
}

/**
 * Sets up keyboard navigation event listeners
 */
function setupKeyboardNavigation() {
    // Add global keyboard event listener for arrow navigation
    document.addEventListener('keydown', handleArrowNavigation, true);
    console.log('AI Navigator: Keyboard navigation setup complete');
}

// --- Focus Mode Functions ---

/**
 * Finds all input elements based on provider selectors
 * @param {Array|string} inputSelectors - Array of selectors or single selector string
 * @returns {Array} Array of found input elements
 */
function findInputElements(inputSelectors) {
    const elements = [];
    const selectors = Array.isArray(inputSelectors) ? inputSelectors : [inputSelectors];
    
    selectors.forEach(selector => {
        try {
            const foundElements = document.querySelectorAll(selector);
            foundElements.forEach(element => {
                if (!elements.includes(element)) {
                    elements.push(element);
                }
            });
        } catch (error) {
            console.warn(`AI Navigator: Invalid selector "${selector}":`, error);
        }
    });
    
    return elements;
}

/**
 * Handles input field focus event
 * @param {FocusEvent} event - The focus event
 */
function handleInputFocus(event) {
    if (!focusModeEnabled || !navBar) {
        return;
    }
    
    const isCurrentlyCollapsed = navBar.classList.contains('collapsed');
    
    // If already collapsed, don't do anything
    if (isCurrentlyCollapsed) {
        return;
    }
    
    console.log('AI Navigator: Input field focused, activating focus mode');
    
    // Remember current state and collapse for focus
    sidebarWasCollapsedManually = false; // It's expanded, so it wasn't manually collapsed
    collapseSidebarForFocus();
}

/**
 * Handles input field blur event
 * @param {FocusEvent} event - The blur event
 */
function handleInputBlur(event) {
    if (!focusModeEnabled || !sidebarCollapsedByFocus) {
        return;
    }
    
    // Clear any existing timeout
    if (focusBlurTimeout) {
        clearTimeout(focusBlurTimeout);
    }
    
    // Add delay to prevent flickering during rapid focus changes
    focusBlurTimeout = setTimeout(() => {
        // Check if focus moved to another input field
        const activeElement = document.activeElement;
        const inputSelectors = currentProvider?.getSelectors()?.inputField;
        
        if (inputSelectors) {
            const allInputElements = findInputElements(inputSelectors);
            const focusOnInput = allInputElements.some(input => 
                input === activeElement || input.contains(activeElement)
            );
            
            if (!focusOnInput) {
                expandSidebarFromFocus();
                console.log('AI Navigator: Input field blurred, deactivating focus mode');
            }
        }
    }, 300); // 300ms delay to prevent flickering
}

/**
 * Collapses sidebar for focus mode
 */
function collapseSidebarForFocus() {
    if (!navBar || sidebarCollapsedByFocus) return;
    
    sidebarCollapsedByFocus = true;
    navBar.classList.add('collapsed');
    document.body.classList.add('ai-nav-collapsed');
    adjustMainContentLayout();
    
    console.log('AI Navigator: Sidebar auto-collapsed for focus mode');
}

/**
 * Expands sidebar from focus mode
 */
function expandSidebarFromFocus() {
    if (!navBar || !sidebarCollapsedByFocus) return;
    
    sidebarCollapsedByFocus = false;
    navBar.classList.remove('collapsed');
    document.body.classList.remove('ai-nav-collapsed');
    adjustMainContentLayout();
    
    console.log('AI Navigator: Sidebar auto-expanded from focus mode');
}

/**
 * Attaches focus and blur event listeners to input elements
 * @param {Array} inputElements - Array of input elements to attach listeners to
 */
function attachInputEventListeners(inputElements) {
    inputElements.forEach(element => {
        if (!attachedInputElements.has(element)) {
            element.addEventListener('focus', handleInputFocus, true);
            element.addEventListener('blur', handleInputBlur, true);
            attachedInputElements.add(element);
            console.log('AI Navigator: Attached focus mode listeners to input element:', element.tagName);
        }
    });
}

/**
 * Detaches focus and blur event listeners from all tracked input elements
 */
function detachAllInputEventListeners() {
    attachedInputElements.forEach(element => {
        element.removeEventListener('focus', handleInputFocus, true);
        element.removeEventListener('blur', handleInputBlur, true);
    });
    attachedInputElements.clear();
    console.log('AI Navigator: Detached all focus mode listeners');
}

/**
 * Sets up focus mode by finding and attaching listeners to input fields
 */
function setupFocusMode() {
    if (!currentProvider || !focusModeEnabled) {
        console.log('AI Navigator: Focus mode disabled or no provider available');
        return;
    }
    
    const inputSelectors = currentProvider.getSelectors().inputField;
    if (!inputSelectors) {
        console.warn('AI Navigator: No input field selectors found for', currentProvider.name);
        return;
    }
    
    // Find all input elements
    const inputElements = findInputElements(inputSelectors);
    
    if (inputElements.length === 0) {
        console.warn('AI Navigator: No input elements found for focus mode on', currentProvider.name);
        return;
    }
    
    // Attach event listeners
    attachInputEventListeners(inputElements);
    
    console.log(`AI Navigator: Focus mode setup complete for ${currentProvider.name} with ${inputElements.length} input elements`);
}

/**
 * Reattaches input event listeners (useful after DOM changes)
 */
function reattachInputListeners() {
    if (!focusModeEnabled || !currentProvider) return;
    
    // Detach existing listeners
    detachAllInputEventListeners();
    
    // Reattach to current input elements
    setupFocusMode();
}

/**
 * Toggles focus mode on/off
 * @param {boolean} enabled - Whether to enable focus mode
 */
function toggleFocusMode(enabled) {
    const previousState = focusModeEnabled;
    focusModeEnabled = enabled;
    
    if (enabled && !previousState) {
        // Enabling focus mode
        setupFocusMode();
        console.log('AI Navigator: Focus mode enabled');
    } else if (!enabled && previousState) {
        // Disabling focus mode
        detachAllInputEventListeners();
        
        // Restore sidebar if it was auto-collapsed
        if (sidebarCollapsedByFocus) {
            expandSidebarFromFocus();
        }
        
        console.log('AI Navigator: Focus mode disabled');
    }
}

/**
 * Resets focus mode state (useful for page navigation)
 */
function resetFocusModeState() {
    if (focusBlurTimeout) {
        clearTimeout(focusBlurTimeout);
        focusBlurTimeout = null;
    }
    
    sidebarCollapsedByFocus = false;
    sidebarWasCollapsedManually = false;
    detachAllInputEventListeners();
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
    
    // Initialize fresh session data (resets on each page load)
    sessionQueries = loadSessionQueries();
    console.log(`AI Navigator: Starting fresh session for ${currentProvider.name}`);
    
    createNavBar();
    setupPageChangeDetection(); // Set up listeners for page/tab changes
    setupKeyboardNavigation(); // Set up arrow key navigation
    
    // Initial processing of any existing elements
    // It might take a moment for the UI to fully render, so a small delay or retry mechanism can be helpful
    setTimeout(() => {
        refreshData(); // Use refreshData instead of processChatElements to show loading state
        observeChatContainer(); // Start observing for new messages
        setupFocusMode(); // Set up focus mode after content loads
    }, 2000); // Wait a bit for initial content to load
}

// Optional: Add a way to toggle the nav bar visibility, e.g., via a browser action or a button
// This could use chrome.storage.sync to remember the state.
