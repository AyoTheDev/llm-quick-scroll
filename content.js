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

// --- Core Functions ---

/**
 * Creates and injects the navigation bar into the page.
 */
function createNavBar() {
    if (document.getElementById('gemini-nav-bar')) {
        return; // Nav bar already exists
    }

    navBar = document.createElement('div');
    navBar.id = 'gemini-nav-bar';
    
    // Create header
    const header = document.createElement('h3');
    header.innerHTML = 'Chat Navigation <span id="gemini-nav-collapse-btn" title="Collapse Navigation">&raquo;</span>';
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
    expandBtn.id = 'gemini-nav-expand-btn';
    expandBtn.title = 'Expand Navigation';
    expandBtn.innerHTML = '&laquo;';
    document.body.appendChild(expandBtn);

    const collapseBtn = document.getElementById('gemini-nav-collapse-btn');

    if (navBar && collapseBtn && expandBtn) {
        collapseBtn.addEventListener('click', toggleNav);
        expandBtn.addEventListener('click', toggleNav);
    } else {
        console.error('Gemini Quick Scroll: Could not find all necessary elements for collapse/expand functionality.');
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
    document.body.classList.toggle('gemini-nav-collapsed');
    adjustMainContentLayout(); // Re-adjust margin after toggling
}

/**
 * Adjusts the main content area to make space for the sidebar.
 */
function adjustMainContentLayout() {
    const navBarWidth = 250; // Must match CSS width
    const gap = 10; // Space between content and nav bar
    const mainContentMargin = navBarWidth + gap + 'px';

    // Try to find Gemini's main content area
    // This selector might need adjustment based on Gemini's actual DOM structure
    const mainContentSelectors = [
        'main',
        '[role="main"]',
        '.main-content', // A common class name
        'body > div:first-child > div:nth-child(2)' // A more speculative selector based on common layouts
    ];

    let mainContentArea = null;
    for (const selector of mainContentSelectors) {
        mainContentArea = document.querySelector(selector);
        if (mainContentArea) break;
    }

    if (mainContentArea) {
        if (navBar && navBar.classList.contains('collapsed')) {
            mainContentArea.style.marginRight = '0px';
            console.log('Gemini Quick Scroll: Navbar collapsed, removed margin-right from main content area.');
        } else {
            mainContentArea.style.marginRight = mainContentMargin;
            console.log('Gemini Quick Scroll: Applied margin-right to main content area:', mainContentArea);
        }
    } else {
        // As a fallback, if a specific main content area isn't found,
        // we might need to adjust the body or a primary wrapper.
        // For now, let's log that it wasn't found.
        console.warn('Gemini Quick Scroll: Could not identify Gemini main content area to adjust layout.');
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
        targetElement.id = `gemini-nav-target-${type}-${elementId.replace(/[^a-zA-Z0-9-_]/g, '')}`;
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
        document.querySelectorAll('#gemini-nav-bar .nav-item').forEach(item => item.classList.remove('active'));
        navItem.classList.add('active');
    });

    navBar.appendChild(navItem);
    allNavItems.push(navItem); // Store for filtering
}

/**
 * Finds and processes all user queries on the page.
 */
function processChatElements() {
    console.log('Gemini Navigator: Processing chat elements...');

    if (navBar) {
        const existingNavItems = navBar.querySelectorAll('.nav-item');
        existingNavItems.forEach(item => item.remove());
        allNavItems = []; // Clear the stored items array
    } else {
        console.warn('Gemini Navigator: navBar not found during processChatElements. Cannot clear or add items.');
        return; // Stop if navBar isn't initialized
    }

    // --- Process User Queries ---
    // New selector for user query containers based on updated HTML structure:
    // <span class="user-query-bubble-with-background ..."> ... <div class="query-text ..."> ... </div> ... </span>
    const queryElements = document.querySelectorAll('span.user-query-bubble-with-background');
    queryElements.forEach((queryElement, index) => { // queryElement is the span.user-query-bubble-with-background
        // Generate a unique ID for the navigation link, as original element IDs might be gone or unreliable.
        // This ID is for the nav item in the sidebar, not for the chat element itself.
        const navItemSpecificId = `query-nav-item-${index}`;

        // New selector for the text content within the query bubble.
        // The text is within <div class="query-text ..."><p class="query-text-line ...">text</p></div>
        const queryTextContainer = queryElement.querySelector('div.query-text');
        if (queryTextContainer) {
            const summary = generateSummary(queryTextContainer.innerText);

            // The queryElement (span.user-query-bubble-with-background) is the new scroll target.
            addNavItem(`<strong>${index + 1}.</strong> ${summary}`, 'query', queryElement, navItemSpecificId);
        } else {
            console.warn('Gemini Navigator: Could not find query text container for element:', queryElement);
        }
    });

    // Note: If response elements also changed, their selectors would need a similar update.
    // Currently, this function (based on previous view) only processes queries.
}


/**
 * Sets up a MutationObserver to watch for new chat messages.
 */
function observeChatContainer() {
    // Try to find a specific container for chat messages.
    // This might need adjustment based on Gemini's exact DOM structure.
    // Common parent elements for chat messages could be <conversation-turn>, <chat-history>, etc.
    // For now, let's try to find a common ancestor of query and response elements.
    // A more robust selector would be ideal if a stable chat container ID or class exists.
    // Let's assume the messages are added to a child of 'body' or a main content area.
    // A common parent for `user-query-content` and `response-content` might be a `div` in `body > main > div ...`
    // For Gemini, a `div.chat-container` or similar is often used.
    // Let's try a more generic approach if a specific one isn't obvious or stable.
    // The elements `user-query-content` and `div.response-content` are usually siblings or near siblings
    // within a scrollable chat area.
    let chatContainer = document.body; // Fallback to body
    const firstQuery = document.querySelector('user-query-content');
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


    console.log("Gemini Navigator: Observing container:", chatContainer);

    const observer = new MutationObserver((mutationsList, observer) => {
        // Debounce the processing to avoid multiple rapid updates
        clearTimeout(observerTimeout);
        observerTimeout = setTimeout(() => {
            console.log("Gemini Navigator: DOM changes detected, reprocessing chat elements.");
            processChatElements();
        }, OBSERVER_DEBOUNCE_TIME);
    });

    observer.observe(chatContainer, { childList: true, subtree: true });
    console.log('Gemini Navigator: MutationObserver started.');
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
    console.log('Gemini Navigator: Initializing...');
    createNavBar();
    // Initial processing of any existing elements
    // It might take a moment for Gemini's UI to fully render, so a small delay or retry mechanism can be helpful
    setTimeout(() => {
        processChatElements();
        observeChatContainer(); // Start observing for new messages
    }, 2000); // Wait a bit for initial content to load
}

// Optional: Add a way to toggle the nav bar visibility, e.g., via a browser action or a button
// This could use chrome.storage.sync to remember the state.
