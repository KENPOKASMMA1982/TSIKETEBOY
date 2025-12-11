// assets/js/saavn-search.js (ΑΠΟΛΥΤΩΣ ΤΕΛΙΚΗ ΕΚΔΟΧΗ)

// ---------------- Globals ----------------
var results_container = document.querySelector("#saavn-results"); 
let results_objects = {};
const BASE_API_URL = "https://jiosaavn-api-privatecvc2.vercel.app/search/";
let lastSearch = "";
let page_index = 1;
let isLoading = false;
const seenSongMap = new Map(); 
const displayedAlbumIds = new Set(); 
const albumDetailsMap = {}; 
const firstSongOfAlbumDisplayed = new Set(); 
let lastQueryHash = ""; 

// ΝΕΑ GLOBALS ΓΙΑ ΤΟΝ PLAYER
let playlist = [];
let currentTrackIndex = -1;
let currentTrackId = null;
let playPauseBtn;
let playerTimeout; // Για να κρατάμε τον χρονοδιακόπτη των 30 δευτερολέπτων

// View/Theme Globals
let currentViewMode = localStorage.getItem('saavnViewMode') || 'horizontal';
let currentTheme = localStorage.getItem('saavnTheme') || 'white';

// ****** GLOBAL ΓΙΑ ΕΝΗΜΕΡΩΣΗ ΗΜΕΡΟΜΗΝΙΑΣ ΑΠΟ ΕΞΩΤΕΡΙΚΗ ΠΗΓΗ (π.χ. Spotify/MusicBrainz) ******
// ΠΡΕΠΕΙ ΝΑ ΑΝΤΙΚΑΤΑΣΤΑΘΕΙ: Αυτό το endpoint θα πρέπει να λαμβάνει query και να επιστρέφει: { fullReleaseDate: "YYYY-MM-DD" }
const SPOTIFY_HELPER_API_URL = "https://example.com/api/get-release-date?q=";

// ---------------- Helpers ----------------
function TextAbstract(text, length) {
    if (!text) return "";
    if (text.length <= length) return text;
    let text_part = text.substring(0, length);
    let last = text_part.lastIndexOf(" ");
    if (last === -1) return text_part + "...";
    return text_part.substring(0, last) + "...";
}

function getArtistNames(artists) {
    if (!artists) return "";
    if (Array.isArray(artists)) return artists.map(a => a.name || a).join(", ");
    return artists;
}

function cleanString(s){
    if(!s) return "";
    return String(s)
        .toLowerCase()
        .replace(/\(.*?\)|\[.*?\]/g,'')
        .replace(/-.*$/g,'')
        .replace(/feat\.|ft\./g,'')
        .replace(/[^a-z0-9\s\u0370-\u03FF\u1F00-\u1FFF]/g,'') 
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeArtists(artists){
    if(!artists) return "";
    return String(artists)
        .split(',')
        .map(a=>a.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join(',');
}

function makeSongKey(song){
    const title = cleanString(song.name || '');
    const artists = normalizeArtists(song.primaryArtists || '');
    const albumId = song.album && song.album.id ? String(song.album.id) : '';
    const duration = song.duration ? String(Math.round(song.duration)) : '';
    let dlToken = '';
    if (song.downloadUrl && Array.isArray(song.downloadUrl) && song.downloadUrl.length>0){
        const u = song.downloadUrl[0].link || '';
        dlToken = u.split('/').pop().slice(0,20);
    }
    return `${title}::${artists}::${albumId}::${duration}::${dlToken}`;
}

/**
 * Μετατρέπει ημερομηνία τύπου "YYYY-MM-DD" ή "YYYY" σε φιλική μορφή (π.χ. "24 Νοε 2023" ή "Έτος: 2025").
 * @param {string|number} dateString - Η ημερομηνία κυκλοφορίας ή το έτος.
 * @returns {string} Μορφοποιημένη ημερομηνία.
 */
function formatReleaseDate(dateString) {
    if (!dateString) return "";
    
    const s = String(dateString).trim();
    
    // Αν είναι μόνο έτος (π.χ. "2023")
    if (s.match(/^\d{4}$/)) {
        return `Έτος: ${s}`; // Εμφανίζει τη λέξη Έτος
    }
    
    // Αν είναι πλήρης ημερομηνία (π.χ. "2023-11-24")
    const date = new Date(s);
    
    if (isNaN(date.getTime())) {
        return s; // Επιστροφή όπως είναι αν η μορφή είναι άγνωστη
    }
    
    // Χρησιμοποιούμε 'el-GR' για ελληνικούς μήνες
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('el-GR', options); 
}

/**
 * Προσπαθεί να βρει την πλήρη ημερομηνία (YYYY-MM-DD) από εξωτερική πηγή (π.χ. Spotify/MusicBrainz),
 * με βάση το όνομα του άλμπουμ και τον καλλιτέχνη.
 * @param {string} albumName - Όνομα άλμπουμ.
 * @param {string} artistName - Όνομα καλλιτέχνη.
 * @returns {Promise<string|null>} Η πλήρης ημερομηνία ή null.
 */
async function fetchFullReleaseDate(albumName, artistName) {
    // Επιστρέφουμε null αν δεν έχει ρυθμιστεί η εξωτερική API.
    if (!albumName || !artistName || SPOTIFY_HELPER_API_URL.includes("example.com")) return null;
    
    const query = `${albumName} ${artistName}`;
    const url = SPOTIFY_HELPER_API_URL + encodeURIComponent(query);

    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Network response was not ok.');
        
        const data = await resp.json();
        
        // Υποθέτουμε ότι η εξωτερική API επιστρέφει: { fullReleaseDate: "YYYY-MM-DD" }
        const fullDate = data.fullReleaseDate || data.date; 
        
        if (fullDate && fullDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            console.log(`[External Date Fetch] Found date: ${fullDate} for ${albumName}`);
            return fullDate;
        }
        return null;
    } catch(e) {
        console.warn(`Could not fetch full date for ${albumName}.`, e);
        return null;
    }
}


async function fetchAlbumDetails(albumId) {
    if (!albumId) return { count: 0 };

    if (albumDetailsMap[albumId] && albumDetailsMap[albumId].count !== undefined) {
        return albumDetailsMap[albumId];
    }
    
    const countElement = document.getElementById(`album-count-${albumId}`);
    if (countElement) {
        countElement.textContent = "Tracks: Loading...";
    }
    
    try {
        const url = `https://jiosaavn-api-privatecvc2.vercel.app/albums?id=${albumId}`;
        const resp = await fetch(url);
        const data = await resp.json();
        
        const count = data?.data?.songs?.length || 0;
        
        let releaseDate = data?.data?.releaseDate || data?.data?.year || null; // Δεδομένα JioSaavn
        
        // ********** LOGIC: ΣΥΜΠΛΗΡΩΣΗ ΑΠΟ ΕΞΩΤΕΡΙΚΗ ΠΗΓΗ (Spotify Data) **********
        // Αν η JioSaavn δίνει μόνο το έτος (4 ψηφία)
        if (releaseDate && String(releaseDate).length === 4) {
            const albumName = data.data.name;
            const artistName = data.data.primaryArtists || '';
            
            // Κλήση της βοηθητικής συνάρτησης για την πλήρη ημερομηνία
            const fullDateFromExternal = await fetchFullReleaseDate(albumName, artistName);
            
            if (fullDateFromExternal) {
                releaseDate = fullDateFromExternal; // Αντικατάσταση του έτους με την πλήρη ημερομηνία
            }
        }
        // ***************************************************************

        const details = { count: count, releaseDate: releaseDate };
        albumDetailsMap[albumId] = details;
        
        if (countElement) {
            countElement.textContent = `Tracks: ${count}`;
        }
        
        applyFilteringAndSorting(); 
        
        return details;
    } catch(e) {
        console.error(`Album details error for ${albumId}:`, e);
        if (countElement) {
             countElement.textContent = "Tracks: Error";
        }
        albumDetailsMap[albumId] = { count: 0 }; 
        return { count: 0 };
    }
}


// ---------------- Theme & View Logic ----------------
window.setTheme = function(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('saavnTheme', theme);
    currentTheme = theme;
    
    const themeButtons = document.querySelectorAll('.theme-toggle-group .btn');
    themeButtons.forEach(button => {
        const buttonTheme = button.id.replace('theme-toggle-', '');
        
        if (buttonTheme === theme) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

window.setViewMode = function(mode) {
    const container = document.getElementById('saavn-results');
    currentViewMode = mode;
    localStorage.setItem('saavnViewMode', mode);
    
    document.getElementById('view-toggle-vertical')?.classList.remove('active');
    document.getElementById('view-toggle-horizontal')?.classList.remove('active');
    document.getElementById(`view-toggle-${mode}`)?.classList.add('active');

    if (mode === 'vertical') {
        container.classList.add('view-vertical');
        container.classList.remove('view-horizontal');
    } else { // horizontal
        container.classList.add('view-horizontal');
        container.classList.remove('view-vertical');
    }

    applyFilteringAndSorting(); 
}


// ---------------- Search Logic ----------------
function getSearchUrl(type) {
    if (type === 'albums') return BASE_API_URL + "albums?query=";
    return BASE_API_URL + "songs?query=";
}


// ΕΝΗΜΕΡΩΜΕΝΗ ΣΥΝΑΡΤΗΣΗ SaavnSearch (Προστέθηκε Συγχρονισμός)
window.SaavnSearch = function(event, fromBottomBar = false) {
    if (event) event.preventDefault();
    
    let query;
    const searchBoxTop = document.querySelector("#saavn-search-box");
    const searchBoxBottom = document.querySelector("#saavn-search-box-bottom");

    if (fromBottomBar) {
        query = searchBoxBottom.value.trim();
        // Συγχρονισμός της τιμής στο επάνω πεδίο
        searchBoxTop.value = query;
    } else {
        query = searchBoxTop.value.trim();
        // Συγχρονισμός της τιμής στο κάτω πεδίο
        searchBoxBottom.value = query;
    }
    
    const search_type = document.querySelector("#saavn-search-type").value;
    let filter_type = document.querySelector("#album-filter-type").value;
    
    let limit = parseInt(document.getElementById('api-call-limit').value);
    limit = Math.max(1, limit || 1); 

    if (search_type !== 'albums' && search_type !== 'songs') filter_type = 'all'; 
    
    // Η αλλαγή του hash θα ενεργοποιήσει το hashchange event
    const hash_value = search_type + '::' + filter_type + '::' + encodeURIComponent(query) + '::' + limit; 
    
    if(query.length > 0) { 
        // Προσθήκη timestamp για να ενεργοποιείται το hashchange event ακόμα κι αν το query είναι το ίδιο
        window.location.hash = hash_value + '::' + Date.now(); 
    } else { 
        window.location.hash = ""; 
    }
}

async function doSaavnSearch(query, append=false, totalCalls=1) {
    // Συγχρονισμός και των δύο πεδίων
    document.querySelector("#saavn-search-box").value = decodeURIComponent(query);
    document.querySelector("#saavn-search-box-bottom").value = decodeURIComponent(query);

    if(!query) return;
    
    const currentHash = window.location.hash;
    
    const isNewSearch = lastSearch !== query || currentHash.split('::')[2] !== lastQueryHash.split('::')[2]; 
    lastQueryHash = currentHash; 
    
    lastSearch = query;
    
    const currentQueryClean = cleanString(query);

    let search_type = 'songs';
    let filter_type = 'all';
    let limit = 1;

    const hash_parts = window.location.hash.substring(1).split('::');
    
    if (hash_parts.length >= 3) {
        search_type = hash_parts[0];
        filter_type = hash_parts[1]; 
        
        if (hash_parts.length >= 4) {
             limit = Math.max(1, parseInt(hash_parts[3]) || 1);
        }

        document.querySelector("#saavn-search-type").value = search_type;
        document.querySelector("#album-filter-type").value = filter_type;
        document.getElementById('api-call-limit').value = limit; 
    } else {
        search_type = document.querySelector("#saavn-search-type").value;
        filter_type = document.querySelector("#album-filter-type").value;
        limit = parseInt(document.getElementById('api-call-limit').value) || 1;
    }

    const albumFilter = document.querySelector("#album-filter-type");
    if (search_type === 'albums' || search_type === 'songs') albumFilter.disabled = false; 
    else { 
        albumFilter.disabled = true; 
        albumFilter.value = 'all'; 
        filter_type = 'all'; 
    }

    const finalSearchUrl = getSearchUrl(search_type);
    
    if (!append) {
        page_index = 1; 
        if (results_container.querySelector('.initial-message')) {
            results_container.innerHTML = '';
        }
    }
    
    const fetchPromises = [];
    const startingPage = page_index;
    
    const loaders = results_container.querySelectorAll('.loader');
    if (loaders.length > 0) {
        const lastLoader = loaders[loaders.length - 1];
        lastLoader.textContent = append ? `Loading more (${totalCalls} simultaneous calls)...` : `Searching (${totalCalls} simultaneous calls)...`;
    } else if (results_container.childElementCount > 0) {
        // Προσθήκη loader στο τέλος των υπαρχόντων αποτελεσμάτων
        const loaderDiv = document.createElement('div');
        loaderDiv.classList.add('col-12', 'loader');
        loaderDiv.textContent = append ? `Loading more (${totalCalls} simultaneous calls)...` : `Searching (${totalCalls} simultaneous calls)...`;
        results_container.appendChild(loaderDiv);
    } else {
        // Εάν δεν υπάρχουν αποτελέσματα, απλώς εμφανίζουμε το loader
        results_container.innerHTML = `<div class="col-12 loader">${append ? 'Loading more' : 'Searching'} (${totalCalls} simultaneous calls)...</div>`;
    }


    isLoading = true;

    for (let i = 0; i < totalCalls; i++) {
        const currentPage = startingPage + i;
        const url = finalSearchUrl + encodeURIComponent(query) + `&limit=40&page=${currentPage}`;
        
        fetchPromises.push(
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (search_type === 'albums') {
                        return data.data.albums || data.data.results || [];
                    } else if (search_type === 'songs') {
                        return data.data.songs || data.data.results || [];
                    }
                    return [];
                })
                .catch(err => {
                    console.error(`Error loading results from page ${currentPage}:`, err);
                    return []; 
                })
        );
    }
    
    let results_data = [];
    let albumsToFetch = [];

    try {
        const all_results_arrays = await Promise.all(fetchPromises);
        
        all_results_arrays.forEach(arr => {
             results_data.push(...arr);
        });
        
        page_index = startingPage + totalCalls;

    } catch(err) {
        console.error("An error occurred during parallel fetching:", err);
        const loaders = results_container.querySelectorAll('.loader');
        if (loaders.length > 0) {
            loaders[loaders.length - 1].textContent = 'An error occurred while loading results.';
        } else {
            results_container.innerHTML += '<div class="col-12 loader">An error occurred while loading results.</div>';
        }
    }
    
    isLoading = false; 
    
    const loaders_to_remove = results_container.querySelectorAll('.loader');
    loaders_to_remove.forEach(loader => loader.remove());


    let final_data = [];
    if (search_type === 'albums') {
        for(const album of results_data) {
            if (!album || !album.id || !album.name || (album.type && album.type.toLowerCase() !== 'album')) continue;
            
            if (displayedAlbumIds.has(album.id)) continue;
            displayedAlbumIds.add(album.id);
            
            albumsToFetch.push(album.id); 
            final_data.push(album);
        }
    } else { 
        for(const song of results_data) {
            if (!song || !song.name || !song.primaryArtists || !song.album || !song.album.id) continue;
            
            const albumId = song.album.id;

            if (firstSongOfAlbumDisplayed.has(albumId)) continue; 
            
            const key = makeSongKey(song);
            if (seenSongMap.has(key)) continue;
            
            const songNameClean = cleanString(song.name || '');
            const albumNameClean = cleanString(song.album.name || '');
            const primaryArtistsClean = cleanString(song.primaryArtists || '');
            
            const queryMatchInSong = songNameClean.includes(currentQueryClean);
            const queryMatchInArtist = primaryArtistsClean.includes(currentQueryClean);
            const queryMatchInAlbumOnly = albumNameClean.includes(currentQueryClean) && !queryMatchInSong && !queryMatchInArtist;
            
            if (queryMatchInAlbumOnly) {
                continue; 
            }
            
            seenSongMap.set(key, true);
            firstSongOfAlbumDisplayed.add(albumId); 
            
            if (song.album && song.album.id) {
                if (!albumsToFetch.includes(albumId)) {
                    albumsToFetch.push(albumId);
                }
            }
            final_data.push(song);
        }
    }

    for(const item of final_data){
        // *** ΝΕΑ ΠΡΟΣΘΗΚΗ: Αποθήκευση releaseDate/year για ταξινόμηση ***
        item.releaseDateForSort = item.releaseDate || item.year;
        results_objects[item.id] = item;
        
        // **ΛΟΓΙΚΗ PLAYER:** Προσθήκη τραγουδιών στη λίστα αναπαραγωγής
        if (search_type === 'songs' && item.downloadUrl) {
            const bitrate = document.getElementById('saavn-bitrate');
            const bitrate_i = bitrate.options[bitrate.selectedIndex].value;
            let download_url = "";
            if (bitrate_i == 4) download_url = item.downloadUrl.find(q => q.quality == "320kbps")?.link || item.downloadUrl.pop()?.link;
            else download_url = item.downloadUrl.find(q => q.quality == "160kbps")?.link || item.downloadUrl.pop()?.link;
            
            if (download_url) {
                playlist.push({ id: item.id, url: download_url });
            }
        }
    }
    
    renderNewResults(final_data, search_type);
    
    document.getElementById('load-more-btn').style.display = (results_data.length > 0) ? 'inline-block' : 'none';
    
    if (albumsToFetch.length > 0) {
        const uniqueNewAlbumIds = albumsToFetch.filter(id => id && albumDetailsMap[id]?.count === undefined);
        
        // Λήψη λεπτομερειών, συμπεριλαμβανομένης της πιθανής διόρθωσης ημερομηνίας μέσω fetchFullReleaseDate
        Promise.all(uniqueNewAlbumIds.map(id => fetchAlbumDetails(id)))
            .then(() => {
                applyFilteringAndSorting(); 
            })
            .catch(err => {
                console.error("Error fetching album details:", err);
                applyFilteringAndSorting(); 
            });
    } else {
        applyFilteringAndSorting();
    }
    
}

window.nextPage = function() {
    if (isLoading) return;
    
    const limit = parseInt(document.getElementById('api-call-limit').value);
    
    isLoading = true;
    const hash_parts = window.location.hash.substring(1).split('::');
    const query = decodeURIComponent(hash_parts[2] || lastSearch); 
    
    doSaavnSearch(query, true, limit).then(() => {
        isLoading = false;
    }).catch(() => {
        isLoading = false;
    });
}


// ---------------- Filtering & Sorting Logic ----------------
document.getElementById('sort-type')?.addEventListener('change', ()=> applyFilteringAndSorting());

document.getElementById('album-filter-type')?.addEventListener('change', function() {
    const query = document.querySelector("#saavn-search-box").value.trim();
    const search_type = document.querySelector("#saavn-search-type").value;
    const filter_type = this.value; 
    
    const limit = parseInt(document.getElementById('api-call-limit').value);
    
    const hash_value = search_type + '::' + filter_type + '::' + encodeURIComponent(query) + '::' + limit; 
    if(query.length > 0) { 
        window.location.hash = hash_value + '::' + Date.now(); 
    } 
    else { window.location.hash = ""; }
});


function applyFilteringAndSorting(){
    const sort_value = document.getElementById('sort-type').value;
    
    const filter_type = document.querySelector("#album-filter-type").value; 
    const search_type = document.querySelector("#saavn-search-type").value;
    const container = document.getElementById('saavn-results');
    
    let items = Array.from(container.querySelectorAll('.song-container'));

    // 1. Εφαρμογή Φίλτρου 
    items.forEach(item => {
        let shouldDisplay = true;

        if (filter_type !== 'all' && (search_type === 'albums' || search_type === 'songs')) {
            const albumId = item.getAttribute('data-album-id');
            if (albumId) {
                const trackCount = albumDetailsMap[albumId]?.count;

                if (trackCount === undefined) { 
                    shouldDisplay = true; 
                } else {
                    let isSingle = trackCount >= 1 && trackCount <= 2;
                    let isEP = trackCount >= 3 && trackCount <= 5;
                    let isFullAlbum = trackCount >= 6;
                    
                    if (filter_type === 'singles') {
                        shouldDisplay = isSingle;
                    } else if (filter_type === 'eps') {
                        shouldDisplay = isEP;
                    } else if (filter_type === 'albums') {
                        shouldDisplay = isFullAlbum;
                    }
                }
            } else if (filter_type !== 'all') {
                 shouldDisplay = false; 
            }
        }
        
        item.style.display = shouldDisplay ? '' : 'none'; 
        
        // **ΛΟΓΙΚΗ PLAYER:** Σημάδεψε το τραγούδι που παίζει
        if(item.getAttribute('data-song-id') === currentTrackId) {
            item.style.border = '2px solid #ff9f44';
            item.style.padding = '8px';
        } else {
            item.style.border = 'none';
            item.style.padding = '10px';
        }
    });


    // 2. Ταξινόμηση (ΜΟΝΟ για ορατά στοιχεία)
    if (sort_value !== 'none') {
        let visibleItems = items.filter(item => item.style.display !== 'none');
        let otherContent = Array.from(container.children).filter(child => !child.classList.contains('song-container'));
        
        visibleItems.sort((a, b) => {
            let nameA_element = a.querySelector('.song-text');
            let nameB_element = b.querySelector('.song-text');
            
            let nameA = nameA_element ? nameA_element.textContent.replace(/^ALBUM:\s*/i, '').toLowerCase() : '';
            let nameB = nameB_element ? nameB_element.textContent.replace(/^ALBUM:\s*/i, '').toLowerCase() : '';
            
            if (sort_value === 'alphabetical') return nameA.localeCompare(nameB);
            
            // *************** ΔΙΟΡΘΩΣΗ: ΤΑΞΙΝΟΜΗΣΗ ΜΕ ΗΜΕΡΟΜΗΝΙΑ ***************
            
            // Εύρεση του ID
            const idA = a.getAttribute('data-song-id') || a.getAttribute('data-album-id');
            const idB = b.getAttribute('data-song-id') || b.getAttribute('data-album-id');
            
            // Λήψη του αντικειμένου από το global map
            const itemA = results_objects[idA];
            const itemB = results_objects[idB];
            
            // Λήψη της ημερομηνίας. Αυτή θα είναι είτε η πλήρης (JioSaavn ή διορθωμένη) είτε μόνο το έτος.
            let dateA = itemA?.releaseDateForSort || albumDetailsMap[idA]?.releaseDate || itemA?.year;
            let dateB = itemB?.releaseDateForSort || albumDetailsMap[idB]?.releaseDate || itemB?.year;
            
            let dateAString = String(dateA);
            let dateBString = String(dateB);
            
            // Προσαρμογή της ημερομηνίας με βάση τον τύπο ταξινόμησης
            if (sort_value === 'newest') {
                // Για Newest: Χρησιμοποιούμε 31/12 για να τα φέρουμε στο τέλος του έτους
                if (dateA && dateAString.length === 4) dateA = `${dateA}-12-31`;
                if (dateB && dateBString.length === 4) dateB = `${dateB}-12-31`;
            } else if (sort_value === 'oldest') {
                // Για Oldest: Χρησιμοποιούμε 01/01 για να τα φέρουμε στην αρχή του έτους
                if (dateA && dateAString.length === 4) dateA = `${dateA}-01-01`;
                if (dateB && dateBString.length === 4) dateB = `${dateB}-01-01`;
            }

            // Μετατροπή σε αντικείμενα Date
            const timeA = dateA ? new Date(dateA).getTime() : 0;
            const timeB = dateB ? new Date(dateB).getTime() : 0;
            
            if (sort_value === 'newest') {
                return timeB - timeA; // Φθίνουσα σειρά (πιο πρόσφατο πρώτο)
            } else if (sort_value === 'oldest') {
                return timeA - timeB; // Αύξουσα σειρά (πιο παλιό πρώτο)
            }
            
            // *****************************************************************

            // Fallback: Χρησιμοποιούμε το ID αν δεν βρεθεί ημερομηνία
            let idA_match = a.id.match(/-(\d+)$/);
            let idB_match = b.id.match(/-(\d+)$/);
            let fallbackIdA = idA_match ? parseInt(idA_match[1]) : 0;
            let fallbackIdB = idB_match ? parseInt(idB_match[1]) : 0;

            if (sort_value === 'newest') return fallbackIdB - fallbackIdA; 
            else if (sort_value === 'oldest') return fallbackIdA - fallbackIdB; 
            
            return 0;
        });

        const fragment = document.createDocumentFragment();
        
        container.innerHTML = '';
        
        otherContent.forEach(item => fragment.appendChild(item));
        
        visibleItems.forEach(item => fragment.appendChild(item));

        items.filter(item => item.style.display === 'none').forEach(item => fragment.appendChild(item));
        
        container.appendChild(fragment);

    } 
}

function renderNewResults(data, search_type) {
    const htmlParts = [];
    
    if (search_type === 'albums') {
        for (let album of data) {
            let album_id = album.id;
            let artist_name = TextAbstract(getArtistNames(album.primaryArtists || album.artists), 30);
            let album_name_display = TextAbstract(album.name, 40);
            let image_url = album.image?.[2]?.link || '';
            
            let trackCountDisplay = albumDetailsMap[album_id]?.count !== undefined 
                ? albumDetailsMap[album_id].count 
                : (album.songs ? album.songs.length : "Loading...");

            // ******* ΠΡΟΣΘΗΚΗ HTML ΓΙΑ ΗΜΕΡΟΜΗΝΙΑ (ALBUMS) *******
            const albumData = results_objects[album_id] || {};
            const release_info = albumData.releaseDateForSort || albumDetailsMap[album_id]?.releaseDate || '';
            let date_display_html = '';

            if (release_info) {
                const formatted_date = formatReleaseDate(release_info); // ΧΡΗΣΗ ΜΟΡΦΟΠΟΙΗΣΗΣ
                date_display_html = `<p class="song-text" style="color:rgb(172,248,159);font-size:12px;">Released: ${formatted_date}</p>`;
            }
            // *****************************************************

            htmlParts.push(`
                <div id="album-container-${album_id}" class="col-sm-6 col-md-4 col-lg-3 song-container" data-album-id="${album_id}" data-type="album" style="padding: 10px;">
                    <img id="${album_id}-i" class="img-fluid float-left song-image" src="${image_url}" loading="lazy" />
                    <div style="padding-left:110px;">
                        <p id="${album_id}-n" class="song-text" style="color:#ff9f44;">ALBUM: ${album_name_display}</p>
                        <p class="song-text" style="color:#d8d8d8;font-size:12px;">Artists: ${artist_name}</p>
                        ${date_display_html} <p id="album-count-${album_id}" class="song-text" style="color:rgb(172,248,159);font-size:12px;">Tracks: ${trackCountDisplay}</p>
                    </div>
                </div>
            `);
        }
    } else { // search_type === 'songs'
        for (let song of data) {
            let song_id = song.id;
            
            const albumId = song.album?.id || '';
            const albumName = TextAbstract(song.album?.name || "", 30);
            
            var artist_name = TextAbstract(getArtistNames(song.primaryArtists), 30);
            var song_name = TextAbstract(song.name, 40);
            var image_url = song.image?.[2]?.link || '';
            var play_time = song.duration ? new Date(song.duration * 1000).toISOString().substr(14, 5) : "0:00";
            
            // ******* ΠΡΟΣΘΗΚΗ HTML ΓΙΑ ΗΜΕΡΟΜΗΝΙΑ (SONGS) *******
            const release_info = song.releaseDateForSort || albumDetailsMap[albumId]?.releaseDate || '';
            let date_display_html = '';

            if (release_info) {
                const formatted_date = formatReleaseDate(release_info); // ΧΡΗΣΗ ΜΟΡΦΟΠΟΙΗΣΗΣ
                date_display_html = `<p class="song-text" style="color:#d8d8d8;font-size:12px;">Release: ${formatted_date}</p>`;
            }
            // *****************************************************

            // **ΑΛΛΑΓΗ:** Το PlayAudio καλείται πλέον με το id
            htmlParts.push(`
                <div id="song-container-${song_id}" class="col-sm-6 col-md-4 col-lg-3 song-container" data-album-id="${albumId}" data-song-id="${song_id}" data-type="song" style="padding: 10px;">
                    <img id="${song_id}-i" class="img-fluid float-left song-image" src="${image_url}" loading="lazy" />
                    <div style="padding-left:110px;">
                        <p id="${song_id}-n" class="song-text">${song_name}</p>
                        <p id="${song_id}-a" class="song-text" style="color:#d8d8d8;font-size:12px;">Album: ${albumName}</p>
                        ${date_display_html} <p class="song-text" style="color:#d8d8d8;font-size:12px;">Artists: ${artist_name}</p>
                        <button class="btn btn-primary song-btn" type="button" style="margin:0px 2px;" onclick='PlayAudio("${song_id}")'>▶</button>
                        <button class="btn btn-primary song-btn" type="button" style="margin:0px 2px;" onclick='AddDownload("${song_id}")'>DL</button>
                        <p class="float-right fit-content" style="color:#fff;padding-top:15px;">${play_time}</p>
                    </div>
                </div>
            `);
        }
    }
    
    // Προσθήκη των νέων στοιχείων στο τέλος
    const newElementsContainer = document.createElement('div');
    newElementsContainer.innerHTML = htmlParts.join(' ');
    
    while (newElementsContainer.firstChild) {
        results_container.appendChild(newElementsContainer.firstChild);
    }
}


// ---------------- Event Listeners & Initialization ----------------
document.getElementById('search-trigger')?.addEventListener('click', (e) => SaavnSearch(e, false));
document.getElementById('search-trigger-bottom')?.addEventListener('click', (e) => SaavnSearch(e, true)); 
document.getElementById('saavn-search-type')?.addEventListener('change', SaavnSearch);
document.getElementById('saavn-bitrate')?.addEventListener('change', SaavnSearch); 
document.getElementById('api-call-limit')?.addEventListener('change', SaavnSearch); 

document.addEventListener('DOMContentLoaded', () => {
    setTheme(currentTheme);
    setViewMode(currentViewMode); 
    playPauseBtn = document.getElementById('play-pause-btn');

    // **ΛΟΓΙΚΗ PLAYER:** Αν ένα κομμάτι τελειώσει (onended), πήγαινε στο επόμενο
    audioTag.onended = function() {
        // Εάν το κομμάτι σταμάτησε λόγω του 30sec timeout, ΔΕΝ το θεωρούμε "τέλος"
        if (!playerTimeout) {
            nextTrack();
        }
    };
    
    // Εμφάνιση του σωστού εικονιδίου Play/Pause
    audioTag.onplay = function() {
        playPauseBtn.innerHTML = '&#x25AE;&#x25AE;'; // Pause icon
    };
    audioTag.onpause = function() {
        playPauseBtn.innerHTML = '&#x25BA;'; // Play icon
    };
    
    // **ΝΕΟ:** Συγχρονισμός της εισαγωγής κειμένου
    document.querySelector("#saavn-search-box").addEventListener('input', function() {
        document.querySelector("#saavn-search-box-bottom").value = this.value;
    });
    document.querySelector("#saavn-search-box-bottom").addEventListener('input', function() {
        document.querySelector("#saavn-search-box").value = this.value;
    });
});

if(window.location.hash) {
    const hash_parts = window.location.hash.substring(1).split('::');
    const query = hash_parts.length >= 3 ? decodeURIComponent(hash_parts[2]) : 'english';
    const limit = hash_parts.length >= 4 ? parseInt(hash_parts[3]) : 1; 
    doSaavnSearch(query, false, limit);
} else {
    // Κανένα default search
}

addEventListener('hashchange', event => {
    const hash_parts = window.location.hash.substring(1).split('::');
    const query = hash_parts.length >= 3 ? decodeURIComponent(hash_parts[2]) : '';
    const limit = hash_parts.length >= 4 ? parseInt(hash_parts[3]) : 1;

    if (query) doSaavnSearch(query, false, limit);
});


// =================================================================
// ΚΕΝΤΡΙΚΟΣ PLAYER LOGIC
// =================================================================

const audioTag = document.getElementById('audio-tag');
const playerImage = document.getElementById('player-image');
const playerName = document.getElementById('player-name');
const playerAlbum = document.getElementById('player-album');
const audioCurrentBitrate = document.getElementById('audio-current-bitrate');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

function updatePlayerControls() {
    prevBtn.disabled = currentTrackIndex <= 0;
    nextBtn.disabled = currentTrackIndex === -1 || currentTrackIndex >= playlist.length - 1;
}

function updateTrackHighlight() {
    const allContainers = document.querySelectorAll('.song-container');
    allContainers.forEach(container => {
        if (container.getAttribute('data-song-id') === currentTrackId) {
            container.style.border = '2px solid #ff9f44';
            container.style.padding = '8px'; 
        } else {
            container.style.border = 'none';
            container.style.padding = '10px';
        }
    });
}

function playSelectedTrack() {
    if (currentTrackIndex === -1 || currentTrackIndex >= playlist.length) return;
    
    // 1. Καθαρισμός προηγούμενου timer (αν υπάρχει)
    if (playerTimeout) {
        clearTimeout(playerTimeout);
        playerTimeout = null;
    }

    const track = playlist[currentTrackIndex];
    const song = results_objects[track.id];
    
    currentTrackId = track.id;

    if (song) {
        const image_url = song.image?.[0]?.link || ''; 
        
        playerImage.src = image_url;
        playerName.textContent = TextAbstract(song.name, 30);
        playerAlbum.textContent = TextAbstract(song.album?.name || "Unknown Album", 30);
        
        const bitrateSelect = document.getElementById('saavn-bitrate');
        const selectedBitrate = bitrateSelect.options[bitrateSelect.selectedIndex].text;
        audioCurrentBitrate.textContent = `Bitrate: ${selectedBitrate}`;
    } else {
        playerImage.src = '';
        playerName.textContent = 'Track Not Found';
        playerAlbum.textContent = '';
        audioCurrentBitrate.textContent = 'Bitrate: -';
    }
    
    audioTag.src = track.url;
    
    // **ΕΦΑΡΜΟΓΗ 30 ΔΕΥΤΕΡΟΛΕΠΤΩΝ ΟΡΙΟΥ**
    audioTag.oncanplaythrough = function() {
        if (audioTag.currentTime === 0 && !audioTag.paused) { 
            audioTag.play();
            
            // Ορισμός χρονοδιακόπτη για διακοπή μετά από 30 δευτερόλεπτα
            playerTimeout = setTimeout(() => {
                audioTag.pause();
                // **ΠΡΟΣΟΧΗ:** Δεν καλούμε nextTrack, απλά σταματάμε
            }, 30000); // 30000 milliseconds = 30 seconds
            
            // Απενεργοποίηση του oncanplaythrough μετά την πρώτη φορά
            audioTag.oncanplaythrough = null;
        }
    };
    
    // Εάν το τραγούδι παίζει ήδη, μην το ξαναφορτώσεις, απλά παίξτο
    if (audioTag.src !== track.url || audioTag.paused) {
        audioTag.load();
        audioTag.play();
    } else {
        audioTag.play();
    }


    updatePlayerControls();
    updateTrackHighlight();
}


/**
 * Παίζει ένα τραγούδι με βάση το songId.
 * @param {string} songId - Το ID του τραγουδιού από τα results_objects.
 */
window.PlayAudio = function(songId) {
    if (!songId) return;
    
    // Βρίσκουμε τον δείκτη του τραγουδιού στη λίστα αναπαραγωγής
    const index = playlist.findIndex(track => track.id === songId);
    
    if (index !== -1) {
        currentTrackIndex = index;
        playSelectedTrack();
    } else {
        // Αυτό δεν πρέπει να συμβαίνει συχνά λόγω του doSaavnSearch
        console.warn(`Song ID ${songId} not found in current playlist.`);
    }
}

window.nextTrack = function() {
    if (currentTrackIndex < playlist.length - 1) {
        currentTrackIndex++;
        playSelectedTrack();
    }
}

window.prevTrack = function() {
    if (currentTrackIndex > 0) {
        currentTrackIndex--;
        playSelectedTrack();
    }
}

window.stopTrack = function() {
    audioTag.pause();
    audioTag.currentTime = 0;
    if (playerTimeout) { // Καθαρισμός του 30sec timer
        clearTimeout(playerTimeout);
        playerTimeout = null;
    }
}

window.togglePlayPause = function() {
    if (audioTag.paused) {
        audioTag.play();
        // Εάν δεν έχει παρέλθει το 30sec limit, ξεκινάμε ξανά το timer
        if (playerTimeout === null && audioTag.currentTime < 30) {
             playerTimeout = setTimeout(() => {
                 audioTag.pause();
             }, (30 - audioTag.currentTime) * 1000);
        }
    } else {
        audioTag.pause();
        if (playerTimeout) { // Σταμάτα το timer όταν κάνεις pause
            clearTimeout(playerTimeout);
            playerTimeout = null;
        }
    }
}

/**
 * Ανοίγει τη σελίδα λήψης για το τραγούδι.
 */
window.AddDownload = function(songId) {
    const song = results_objects[songId];
    if (!song || !song.downloadUrl) {
        alert("Download link not found for this song.");
        return;
    }
    
    const bitrateSelect = document.getElementById('saavn-bitrate');
    const bitrate_i = bitrateSelect.options[bitrateSelect.selectedIndex].value;
    let download_url = "";
            
    if (bitrate_i == 4) download_url = song.downloadUrl.find(q => q.quality == "320kbps")?.link || song.downloadUrl.pop()?.link;
    else download_url = song.downloadUrl.find(q => q.quality == "160kbps")?.link || song.downloadUrl.pop()?.link;

    if (download_url) {
        window.open(download_url, '_blank');
    } else {
        alert("No suitable download URL found.");
    }
}