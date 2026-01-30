// Bible API endpoints
const RANDOM_VERSE_API = 'https://bible-api.com/';

// Storage keys
const STORAGE_KEY = 'dailyScripture';
const STORAGE_DATE_KEY = 'dailyScriptureDate';

// Store for Gods Word
let currentDailyScripture = null;
let currentShareableUrl = '';

// =====================
// Text-to-Speech Manager
// =====================
class TextToSpeechManager {
    constructor() {
        this.synth = window.speechSynthesis;
        this.isPlaying = false;
        this.isPaused = false;
        this.currentUtterance = null;
        this.currentSentences = [];
        this.currentIndex = 0;
        this.currentSection = null;
        this.highlightedElement = null;
        this.preferredPitch = 0.45; // Deep male voice pitch
        this.preferredRate = 0.85; // Slightly slower for gravitas
        this.preferredVolume = 1.0; // Full volume
    }

    splitIntoSentences(text) {
        // Split by major punctuation followed by space (avoiding over-pausing on abbreviations)
        // This keeps the text flowing naturally without long pauses at periods, commas, quotes, etc.
        const sentences = text.split(/(?<=[.!?])\s+/g).filter(s => s.trim().length > 0);
        return sentences.map(s => s.trim());
    }

    getVoices() {
        return this.synth.getVoices();
    }

    getFemaleVoice() {
        const voices = this.getVoices();
        // Try to find a female voice (usually contains "female" or "woman")
        let femaleVoice = voices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman'));
        
        // If no explicit female voice, try common female voice patterns
        if (!femaleVoice) {
            femaleVoice = voices.find(v => 
                v.name.toLowerCase().includes('victoria') ||
                v.name.toLowerCase().includes('samantha') ||
                v.name.toLowerCase().includes('moira') ||
                v.name.toLowerCase().includes('karen') ||
                v.name.toLowerCase().includes('zira')
            );
        }
        
        // Fallback to any available voice
        if (!femaleVoice && voices.length > 0) {
            femaleVoice = voices[1] || voices[0];
        }
        
        return femaleVoice;
    }

    speak(text, section) {
        if (!text) return;

        // Cancel any ongoing speech
        this.stop();

        this.currentSection = section;
        this.currentSentences = this.splitIntoSentences(text);
        this.currentIndex = 0;

        if (this.currentSentences.length === 0) {
            return;
        }

        this.isPlaying = true;
        this.isPaused = false;
        this.updateControls();
        this.speakSentence(0);
    }

    speakSentence(index) {
        if (index >= this.currentSentences.length) {
            this.isPlaying = false;
            this.updateControls();
            return;
        }

        const sentence = this.currentSentences[index];
        this.currentUtterance = new SpeechSynthesisUtterance(sentence);
        this.currentUtterance.voice = this.getFemaleVoice();
        this.currentUtterance.rate = this.getCurrentRate();
        this.currentUtterance.pitch = 1.2; // Slightly higher pitch for clarity
        this.currentUtterance.volume = 1;

        // Highlight the current sentence in the DOM
        this.highlightSentence(index);

        this.currentUtterance.onend = () => {
            this.currentIndex++;
            this.speakSentence(this.currentIndex);
        };

        this.currentUtterance.onerror = (event) => {
            console.error('Speech error:', event);
            this.currentIndex++;
            this.speakSentence(this.currentIndex);
        };

        this.isPlaying = true;
        this.isPaused = false;
        this.updateControls();
        this.synth.speak(this.currentUtterance);
    }

    highlightSentence(index) {
        // Remove previous highlight
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('reading-highlight');
            this.highlightedElement = null;
        }

        // Find and highlight the sentence element (gracefully skip if section is null)
        if (!this.currentSection) return;
        const sentenceElements = this.currentSection.querySelectorAll('.sentence');
        if (sentenceElements[index]) {
            this.highlightedElement = sentenceElements[index];
            this.highlightedElement.classList.add('reading-highlight');
            this.highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    pause() {
        if (this.isPlaying && !this.isPaused) {
            this.synth.pause();
            this.isPaused = true;
            this.isPlaying = false;
            this.updateControls();
        }
    }

    resume() {
        if (this.isPaused) {
            this.synth.resume();
            this.isPlaying = true;
            this.isPaused = false;
            this.updateControls();
        }
    }

    stop() {
        this.synth.cancel();
        this.isPlaying = false;
        this.isPaused = false;
        this.currentIndex = 0;

        // Remove highlight
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('reading-highlight');
            this.highlightedElement = null;
        }

        this.updateControls();
    }

    setRate(rate) {
        if (typeof rate === 'number' && rate > 0) {
            this.preferredRate = rate;
        }
    }

    getCurrentRate() {
        return this.preferredRate || 0.85;
    }

    setVoiceProfile({ pitch, rate, volume } = {}) {
        if (typeof pitch === 'number' && pitch > 0) this.preferredPitch = pitch;
        if (typeof rate === 'number' && rate > 0) this.preferredRate = rate;
        if (typeof volume === 'number') this.preferredVolume = Math.max(0, Math.min(1, volume));
    }

    updateControls() {
        if (this.currentSection && this.currentSection.id) {
            const prefix = this.currentSection.id === 'daily-scripture' ? 'daily' : 'search';
            const playBtn = document.getElementById(`${prefix}-play-btn`);
            const pauseBtn = document.getElementById(`${prefix}-pause-btn`);

            if (playBtn && pauseBtn) {
                if (this.isPlaying && !this.isPaused) {
                    playBtn.style.display = 'none';
                    pauseBtn.style.display = 'flex';
                } else {
                    playBtn.style.display = 'flex';
                    pauseBtn.style.display = 'none';
                }
            }
        }
    }
}

// Global TTS Manager
const ttsManager = new TextToSpeechManager();

// Initialize voices when ready
if (ttsManager.synth.onvoiceschanged !== undefined) {
    ttsManager.synth.onvoiceschanged = () => {
        ttsManager.getVoices();
    };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    loadDailyScripture();
    setupSearchFunctionality();
    setupReadAloudControls();
    setupShareButtons();
    // Load dynamic praise verses (random scriptures)
    try {
        loadPraiseVerses();
    } catch (e) {
        console.warn('Praise verses loader not available:', e);
    }
});

// =====================
// Read Aloud Controls Setup
// =====================
function setupReadAloudControls() {
    // Daily Scripture Controls
    const dailyPlayBtn = document.getElementById('daily-play-btn');
    const dailyPauseBtn = document.getElementById('daily-pause-btn');

    if (dailyPlayBtn) {
        dailyPlayBtn.addEventListener('click', () => {
            // If currently paused, resume instead of restarting
            if (ttsManager.isPaused) {
                ttsManager.resume();
                return;
            }

            const container = document.getElementById('daily-scripture');
            const text = container.innerText;
            ttsManager.speak(text, container);
        });
    }

    if (dailyPauseBtn) {
        dailyPauseBtn.addEventListener('click', () => {
            if (ttsManager.isPlaying) {
                ttsManager.pause();
            } else if (ttsManager.isPaused) {
                ttsManager.resume();
            }
        });
    }

    // Search Results Controls
    const searchPlayBtn = document.getElementById('search-play-btn');
    const searchPauseBtn = document.getElementById('search-pause-btn');

    if (searchPlayBtn) {
        searchPlayBtn.addEventListener('click', () => {
            // If currently paused, resume instead of restarting
            if (ttsManager.isPaused) {
                ttsManager.resume();
                return;
            }

            const container = document.getElementById('search-results');
            const text = container.innerText;
            ttsManager.speak(text, container);
        });
    }

    if (searchPauseBtn) {
        searchPauseBtn.addEventListener('click', () => {
            if (ttsManager.isPlaying) {
                ttsManager.pause();
            } else if (ttsManager.isPaused) {
                ttsManager.resume();
            }
        });
    }
}

// =====================
// Navigation
// =====================
let navigationInitialized = false;

function initializeNavigation() {
    // Prevent duplicate initialization
    if (navigationInitialized) return;
    navigationInitialized = true;

    const navLinks = document.querySelectorAll('.nav-link');
    const sections = Array.from(document.querySelectorAll('section[id]'));

    if (!navLinks.length || !sections.length) return;

    // Smooth scroll and click active handling
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').replace('#', '');
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Highlight nav item based on scroll position
    function onScroll() {
        const scrollPos = window.scrollY + Math.max(window.innerHeight * 0.1, 80);
        let current = sections[0];
        for (const sec of sections) {
            const rect = sec.getBoundingClientRect();
            const top = window.scrollY + rect.top;
            if (scrollPos >= top) current = sec;
        }

        const id = current ? current.id : null;
        if (!id) return;
        navLinks.forEach(l => {
            const href = l.getAttribute('href').replace('#', '');
            if (href === id) l.classList.add('active'); else l.classList.remove('active');
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // Run once to initialize
    onScroll();
}

// =====================
// Gods Word
// =====================
async function loadDailyScripture(forceRefresh = false) {
    const container = document.getElementById('daily-scripture');
    
    // Check if we have today's scripture cached (unless forcing refresh)
    const today = new Date().toDateString();
    const cachedDate = localStorage.getItem(STORAGE_DATE_KEY);
    const cachedScripture = localStorage.getItem(STORAGE_KEY);
    
    if (!forceRefresh && cachedDate === today && cachedScripture) {
        try {
            currentDailyScripture = JSON.parse(cachedScripture);
            currentShareableUrl = generateShareableUrl(currentDailyScripture);
            displayScripture(container, currentDailyScripture);
            return;
        } catch (error) {
            console.log('Cache error, fetching fresh verse');
        }
    }

    container.innerHTML = '<div class="loading">Loading scripture...</div>';

    try {
        // Expanded list of Bible verses (365+ unique verses for daily rotation)
        const scriptures = [
            'John 3:16', 'Romans 8:28', 'Proverbs 3:5', 'Psalms 23:1', '1 Peter 5:7',
            'Philippians 4:8', 'Matthew 11:28', 'Jeremiah 29:11', 'Proverbs 17:17', 'Ephesians 2:8',
            'Isaiah 40:31', 'Philippians 4:13', 'James 1:2', 'Deuteronomy 31:6', '1 John 4:7',
            'Genesis 1:27', 'Proverbs 31:25', 'Psalm 27:1', 'Isaiah 26:3', 'Matthew 5:16',
            'Colossians 3:23', 'Proverbs 22:6', 'Galatians 5:22', '1 Thessalonians 5:16', 'Romans 12:2',
            'Proverbs 27:12', 'Psalm 139:14', 'Isaiah 41:10', 'Matthew 6:33', 'Proverbs 15:22',
            'Ephesians 4:2', 'Proverbs 14:12', 'Matthew 7:7', 'Proverbs 13:20', 'Romans 6:23',
            'Proverbs 10:19', 'Psalm 37:4', 'Isaiah 53:5', 'Matthew 28:20', 'Proverbs 11:14',
            'Ecclesiastes 4:9', 'Proverbs 9:10', 'Psalm 100:1', 'Matthew 22:37', 'Romans 8:31',
            'Proverbs 19:20', 'Psalm 119:105', 'Isaiah 9:6', 'Matthew 11:30', 'Proverbs 4:23',
            'Proverbs 23:7', 'Psalm 42:5', 'Isaiah 12:2', 'Matthew 5:7', 'Romans 3:28',
            'Proverbs 12:25', 'Psalm 46:5', 'Isaiah 64:8', 'Matthew 26:39', 'Ephesians 6:18',
            'Proverbs 8:11', 'Psalm 56:3', 'Isaiah 55:8', 'Matthew 5:44', 'Galatians 2:20',
            'Proverbs 21:3', 'Psalm 62:8', 'Jeremiah 31:3', 'Matthew 18:20', 'Philippians 2:13',
            'Proverbs 24:3', 'Psalm 84:11', 'Lamentations 3:22', 'Mark 11:24', 'Colossians 1:27',
            'Proverbs 20:15', 'Psalm 91:1', 'Ezekiel 11:19', 'Mark 9:23', '2 Timothy 1:7',
            'Proverbs 18:15', 'Psalm 121:1', 'Daniel 6:10', 'Mark 12:30', '2 Corinthians 5:7',
            'Proverbs 16:3', 'Psalm 23:6', 'Hosea 6:6', 'Luke 1:37', '2 Corinthians 12:9',
            'Proverbs 15:1', 'Psalm 37:23', 'Joel 2:12', 'Luke 6:38', '2 Timothy 2:13',
            'Proverbs 14:1', 'Psalm 119:11', 'Amos 5:4', 'Luke 11:28', 'Titus 2:12',
            'Proverbs 13:12', 'Psalm 103:10', 'Obadiah 1:21', 'Luke 15:7', 'Hebrews 4:16',
            'Proverbs 11:2', 'Psalm 145:14', 'Jonah 2:9', 'John 1:1', 'Hebrews 10:24',
            'Proverbs 10:12', 'Psalm 147:3', 'Micah 6:8', 'John 7:38', 'Hebrews 12:1',
            'Proverbs 9:8', 'Psalm 150:2', 'Nahum 1:7', 'John 8:12', 'Hebrews 13:5',
            'Proverbs 8:33', 'Psalm 18:2', 'Habakkuk 2:4', 'John 11:25', 'James 1:19',
            'Proverbs 7:7', 'Psalm 5:3', 'Zephaniah 3:17', 'John 14:6', 'James 3:17',
            'Proverbs 6:6', 'Psalm 139:23', 'Haggai 2:4', 'John 15:5', '1 Peter 1:3',
            'Proverbs 5:21', 'Psalm 73:26', 'Zechariah 2:8', 'John 17:3', '1 Peter 2:9',
            'Proverbs 4:7', 'Psalm 94:19', 'Malachi 3:10', 'Acts 1:8', '1 John 1:7',
            'Proverbs 3:21', 'Psalm 119:162', 'Matthew 4:4', 'Acts 20:35', 'Revelation 3:20',
            'Genesis 28:15', 'Proverbs 2:6', 'Matthew 5:14', 'Romans 1:16', 'Revelation 21:4',
            'Exodus 14:14', 'Proverbs 1:7', 'Matthew 6:11', 'Romans 5:8', 'Psalm 139:1',
            'Leviticus 19:18', 'Job 11:18', 'Matthew 7:24', 'Romans 10:9', 'Proverbs 28:13',
            'Numbers 6:24', 'Psalm 33:11', 'Matthew 9:29', 'Corinthians 13:4', 'Proverbs 29:18',
            'Deuteronomy 6:5', 'Proverbs 30:5', 'Matthew 14:27', '2 Corinthians 9:8', 'Ecclesiastes 12:13',
            'Joshua 1:8', 'Song of Solomon 2:4', 'Matthew 16:26', 'Galatians 3:28', 'Proverbs 25:11',
            'Judges 6:14', 'Isaiah 30:15', 'Matthew 19:26', 'Ephesians 1:3', 'Proverbs 26:4',
            'Ruth 3:11', 'Isaiah 35:3', 'Matthew 23:37', 'Ephesians 3:17', 'Psalm 1:3',
            '1 Samuel 16:7', 'Isaiah 45:22', 'Mark 1:17', 'Philippians 1:6', 'Psalm 16:11',
            '2 Samuel 22:33', 'Isaiah 48:17', 'Mark 5:36', 'Philippians 3:7', 'Psalm 32:11',
            '1 Kings 3:9', 'Jeremiah 1:5', 'Mark 6:31', 'Colossians 2:6', 'Psalm 63:3',
            '2 Kings 6:16', 'Jeremiah 3:4', 'Mark 10:27', 'Colossians 3:16', 'Psalm 119:99',
            '1 Chronicles 28:20', 'Jeremiah 10:24', 'Mark 14:36', '1 Thessalonians 4:3', 'Psalm 27:10',
            '2 Chronicles 15:7', 'Jeremiah 20:11', 'Luke 1:28', '1 Thessalonians 5:17', 'Psalm 107:1'
        ];

        let verseString;
        
        if (forceRefresh) {
            // Pick a random verse when refreshing
            verseString = scriptures[Math.floor(Math.random() * scriptures.length)];
        } else {
            // Use day of year to get a unique verse each day
            const dayOfYear = getDayOfYear();
            verseString = scriptures[dayOfYear % scriptures.length];
        }

        const verse = await getVerseFromAPI(verseString);
        currentDailyScripture = verse;

        // Cache the verse only if not forced refresh
        if (!forceRefresh) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(verse));
            localStorage.setItem(STORAGE_DATE_KEY, today);
        }

        // Generate shareable URL
        currentShareableUrl = generateShareableUrl(verse);

        displayScripture(container, verse);
    } catch (error) {
        console.error('Error loading scripture:', error);
        container.innerHTML = '<div class="loading">Unable to load scripture. Please refresh.</div>';
    }
}

function getDayOfYear() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

async function getVerseFromAPI(verseString, timeout = 8000) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(`${RANDOM_VERSE_API}${verseString}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Verse "${verseString}" not found (HTTP ${response.status})`);
        }

        const data = await response.json();

        return {
            reference: data.reference || verseString,
            text: data.text || 'No content available',
            bookName: data.bookName || '',
            chapter: data.chapter || '',
            verse: data.verse || ''
        };
    } catch (error) {
        console.error('Error fetching verse from API:', error);
        throw error;
    }
}

function displayScripture(container, scripture) {
    if (!container) return;
    // Wrap each sentence in a span for highlighting; improved regex to handle abbreviations
    const text = scripture.text || '';
    const sentences = text.match(/[^.!?]*[.!?]+(?=\s|$)/g) || [text];
    const wrappedSentences = sentences.map((s) => `<span class="sentence">${escapeHtml(s.trim())}</span>`).join(' ');
    
    const html = `
        <div class="scripture-ref">${escapeHtml(scripture.reference || '')}</div>
        <div class="scripture-text">${wrappedSentences}</div>
    `;
    container.innerHTML = html;
    
    // Show read-aloud controls
    const controlsId = container.id === 'daily-scripture' ? 'daily-readAloud-controls' : 'search-readAloud-controls';
    const controls = document.getElementById(controlsId);
    if (controls) {
        controls.style.display = 'flex';
    }
}

function generateShareableUrl(scripture) {
    // Create a shareable URL with the verse info encoded
    const verseInfo = encodeURIComponent(`${scripture.reference}`);
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?daily=${verseInfo}`;
}

// Share message constant
const SHARE_MESSAGE = `godsword.pages.dev 🜲Jesus is King🜲.\n\n`;

// Setup share buttons (moved into DOMContentLoaded to ensure DOM is ready)
function setupShareButtons() {
    const refreshBtn = document.getElementById('refresh-daily');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadDailyScripture(true));
    }

    const fbBtn = document.getElementById('share-facebook');
    if (fbBtn) {
        fbBtn.addEventListener('click', () => {
            if (!currentDailyScripture) return;
            const verseContent = `📖 ${currentDailyScripture.reference}\n\n~ ${currentDailyScripture.text}\n${SHARE_MESSAGE}`;
            const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentShareableUrl)}&quote=${encodeURIComponent(verseContent)}`;
            window.location.href = url;
            showToast('Opening Facebook...');
        });
    }

    const twitterBtn = document.getElementById('share-twitter');
    if (twitterBtn) {
        twitterBtn.addEventListener('click', () => {
            if (!currentDailyScripture) return;
            const verseContent = `📖 ${currentDailyScripture.reference}\n\n~ ${currentDailyScripture.text}\n${SHARE_MESSAGE}`;
            const url = `https://x.com/intent/tweet?text=${encodeURIComponent(verseContent)}&url=${encodeURIComponent(currentShareableUrl)}`;
            window.location.href = url;
            showToast('Opening X...');
        });
    }

    const waBtn = document.getElementById('share-whatsapp');
    if (waBtn) {
        waBtn.addEventListener('click', () => {
            if (!currentDailyScripture) return;
            const verseContent = `📖 ${currentDailyScripture.reference}\n\n~ ${currentDailyScripture.text}\n${SHARE_MESSAGE}`;
            const url = `https://wa.me/?text=${encodeURIComponent(verseContent)}`;
            window.location.href = url;
            showToast('Opening WhatsApp...');
        });
    }

    const igBtn = document.getElementById('share-instagram');
    if (igBtn) {
        igBtn.addEventListener('click', () => {
            if (!currentDailyScripture) return;
            const verseContent = `📖 ${currentDailyScripture.reference}\n\n~ ${currentDailyScripture.text}\n${SHARE_MESSAGE}`;
            const url = `https://instagram.com/direct/inbox/?text=${encodeURIComponent(verseContent)}`;
            window.location.href = url;
            showToast('Opening Instagram...');
        });
    }

    const copyBtn = document.getElementById('copy-link');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            if (!currentShareableUrl) return;
            try {
                await navigator.clipboard.writeText(currentShareableUrl);
                showToast('Link copied to clipboard!', 'success');
            } catch (err) {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = currentShareableUrl;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showToast('Link copied to clipboard!', 'success');
            }
        });
    }
}

// =====================
// Search Functionality
// =====================
function setupSearchFunctionality() {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    if (!searchBtn || !searchInput) return;
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}

async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    const resultsContainer = document.getElementById('search-results');

    if (!query) {
        resultsContainer.innerHTML = '<p class="no-results">Please enter a search term (e.g., "John 3:16" or "love").</p>';
        // Hide controls for empty search
        const controls = document.getElementById('search-readAloud-controls');
        if (controls) controls.style.display = 'none';
        return;
    }

    resultsContainer.innerHTML = '<div class="loading">Searching the Bible...</div>';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${RANDOM_VERSE_API}${encodeURIComponent(query)}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            resultsContainer.innerHTML = '<p class="no-results">No verses found matching your search. Try a different format like "John 3:16".</p>';
            // Hide controls for no results
            const controls = document.getElementById('search-readAloud-controls');
            if (controls) controls.style.display = 'none';
            return;
        }

        const data = await response.json();

        if (!data.reference) {
            resultsContainer.innerHTML = '<p class="no-results">No verses found. Try searching by book and chapter, like "Romans 8".</p>';
            // Hide controls for no results
            const controls = document.getElementById('search-readAloud-controls');
            if (controls) controls.style.display = 'none';
            return;
        }

        // Wrap each sentence in a span for highlighting; improved regex to handle abbreviations
        const text = data.text || '';
        const sentences = text.match(/[^.!?]*[.!?]+(?=\s|$)/g) || [text];
        const wrappedSentences = sentences.map((s) => `<span class="sentence">${escapeHtml(s.trim())}</span>`).join(' ');

        const html = `
            <div class="verse-result">
                <div class="verse-ref">${escapeHtml(data.reference || '')}</div>
                <div class="verse-text">${wrappedSentences}</div>
            </div>
        `;
        resultsContainer.innerHTML = html;

        // Show read-aloud controls
        const controls = document.getElementById('search-readAloud-controls');
        if (controls) {
            controls.style.display = 'flex';
        }
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<p class="no-results">Error searching the Bible. Please try again.</p>';
        // Hide controls on error
        const controls = document.getElementById('search-readAloud-controls');
        if (controls) controls.style.display = 'none';
    }
}

// =====================
// Praise Section - Verses Only
// =====================
// Note: Praise messaging UI removed. Only dynamic praise verses loaded.

// Load praise verses from Bible API
async function loadPraiseVerses() {
    const container = document.getElementById('praise-verses');
    
    try {
        // Praise and worship related verses (expanded list)
        const praiseVerses = [
            'Psalm 100:1',
            'Psalm 150:1',
            'Philippians 4:4',
            'Colossians 3:16',
            'Exodus 15:11',
            'Psalm 95:1',
            'Psalm 34:1',
            'Romans 12:1',
            '1 Peter 2:9',
            'Psalm 47:1',
            'Nehemiah 8:10',
            'Psalm 113:1',
            'Habakkuk 3:18',
            'Psalm 42:5',
            'Luke 1:46',
            'Psalm 63:3',
            'Psalm 107:1',
            'Psalm 135:1',
            '1 Chronicles 16:8',
            'Psalm 89:1',
            'Psalm 145:1',
            'Psalm 92:1',
            'Psalm 96:1',
            'Psalm 81:1',
            'Psalm 66:1'
        ];

        // Check if we have today's praise verses cached
        const today = new Date().toDateString();
        const cachedDate = localStorage.getItem('praiseVersesDate');
        const cachedVerses = localStorage.getItem('praiseVerses');

        let versesToLoad = [];

        if (cachedDate === today && cachedVerses) {
            try {
                versesToLoad = JSON.parse(cachedVerses);
            } catch (error) {
                console.log('Cache error, generating fresh praise verses');
                versesToLoad = selectDailyPraiseVerses(praiseVerses);
            }
        } else {
            // Get day-specific selection of praise verses
            versesToLoad = selectDailyPraiseVerses(praiseVerses);
            localStorage.setItem('praiseVerses', JSON.stringify(versesToLoad));
            localStorage.setItem('praiseVersesDate', today);
        }

        let html = '';
        let loadedCount = 0;

        for (const verseRef of versesToLoad) {
            if (loadedCount >= 6) break; // Load 6 praise verses
            
            try {
                const response = await fetch(`${RANDOM_VERSE_API}${verseRef}`);
                if (response.ok) {
                    const data = await response.json();
                    const safeText = escapeHtml(data.text);
                    html += `
                        <div class="praise-verse-card">
                            <div class="praise-verse-ref">${data.reference}</div>
                            <div class="praise-verse-text">${data.text}</div>
                            <div class="praise-verse-buttons">
                                <button class="verse-share-btn facebook" data-reference="${data.reference}" data-text="${safeText}" data-platform="facebook" title="Share on Facebook">
                                    <i class="fab fa-facebook-f"></i>
                                </button>
                                <button class="verse-share-btn twitter" data-reference="${data.reference}" data-text="${safeText}" data-platform="twitter" title="Share on X">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                                        <g>
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="currentColor"></path>
                                        </g>
                                    </svg>
                                </button>
                                <button class="verse-share-btn whatsapp" data-reference="${data.reference}" data-text="${safeText}" data-platform="whatsapp" title="Share on WhatsApp">
                                    <i class="fab fa-whatsapp"></i>
                                </button>
                                <button class="verse-share-btn instagram" data-reference="${data.reference}" data-text="${safeText}" data-platform="instagram" title="Share on Instagram">
                                    <i class="fab fa-instagram"></i>
                                </button>
                            </div>
                        </div>
                    `;
                    loadedCount++;
                }
            } catch (error) {
                console.error(`Error loading ${verseRef}:`, error);
            }
        }

        if (html) {
            container.innerHTML = html;
            
            // Add event listeners to praise verse share buttons
            const shareButtons = container.querySelectorAll('.verse-share-btn');
            shareButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const reference = btn.getAttribute('data-reference');
                    const text = btn.getAttribute('data-text');
                    const platform = btn.getAttribute('data-platform');
                    sharePraiseVerse(reference, text, platform);
                });
            });
        } else {
            container.innerHTML = '<p class="no-results">Unable to load praise verses. Please refresh.</p>';
        }
    } catch (error) {
        console.error('Error loading praise verses:', error);
        container.innerHTML = '<p class="no-results">Unable to load praise verses.</p>';
    }
}

function selectDailyPraiseVerses(praiseVerses) {
    const dayOfYear = getDayOfYear();
    const selectedVerses = [];
    
    // Select 6 different verses based on the day of year
    for (let i = 0; i < 6; i++) {
        const index = (dayOfYear + i) % praiseVerses.length;
        selectedVerses.push(praiseVerses[index]);
    }
    
    return selectedVerses;
}

// Share praise verse function - Direct sharing without popups
function sharePraiseVerse(reference, text, platform) {
    // Decode HTML entities if needed
    const decodedText = text.replace(/&amp;/g, '&')
                           .replace(/&lt;/g, '<')
                           .replace(/&gt;/g, '>')
                           .replace(/&quot;/g, '"')
                           .replace(/&#039;/g, "'");
    
    const shareMessage = `godsword.pages.dev 🜲Jesus is King🜲.\n\n`;
    const verseContent = `🙏 ${reference}\n\n~ ${decodedText}\n${shareMessage}`;
    const baseUrl = window.location.origin + window.location.pathname;
    
    // Direct platform sharing
    if (platform === 'facebook') {
        window.location.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(baseUrl)}&quote=${encodeURIComponent(verseContent)}`;
        showToast('Opening Facebook...');
    } else if (platform === 'twitter') {
        window.location.href = `https://x.com/intent/tweet?text=${encodeURIComponent(verseContent)}&url=${encodeURIComponent(baseUrl)}`;
        showToast('Opening X...');
    } else if (platform === 'whatsapp') {
        window.location.href = `https://wa.me/?text=${encodeURIComponent(verseContent)}`;
        showToast('Opening WhatsApp...');
    } else if (platform === 'instagram') {
        window.location.href = `https://instagram.com/direct/inbox/?text=${encodeURIComponent(verseContent)}`;
        showToast('Opening Instagram...');
    }
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// =====================
// Utilities
// =====================
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInUp 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Handle URL parameters for shared links
function handleShareableLink() {
    const params = new URLSearchParams(window.location.search);
    const daily = params.get('daily');
    
    if (daily) {
        // Highlight the shared scripture
        const element = document.getElementById('daily-scripture');
        if (element) {
            element.parentElement.style.borderWidth = '3px';
            element.parentElement.style.borderColor = '#f5576c';
        }
    }
}

handleShareableLink();
