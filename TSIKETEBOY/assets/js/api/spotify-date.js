// api/spotify-date.js

// Τα κλειδιά διαβάζονται από τις Environment Variables του Vercel,
// όπου έχεις ορίσει: 
// SPOTIFY_CLIENT_ID = 6a0943674cc44729a0c24fd98621f146
// SPOTIFY_CLIENT_SECRET = 0cfb719cc9164a949d4594b87364e791
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID; 
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Η συνάρτηση που εκτελείται από το Vercel
module.exports = async (req, res) => {
    // 1. Ρύθμιση Headers για CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const { query } = req.query;
    
    // 2. Έλεγχος Παραμέτρων
    if (!query) {
        res.status(400).json({ error: 'Missing query parameter' });
        return;
    }
    if (!CLIENT_ID || !CLIENT_SECRET) {
        res.status(500).json({ error: 'Spotify API credentials are not configured on the server (Environment Variables). Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.' });
        return;
    }

    try {
        // --- Α. Λήψη Access Token από Spotify ---
        const authUrl = 'https://accounts.spotify.com/api/token';
        const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

        const authResponse = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        });

        const authData = await authResponse.json();
        const accessToken = authData.access_token;
        
        if (!accessToken) {
            throw new Error(`Spotify access token error: ${authData.error_description || 'Unknown error'}`);
        }

        // --- Β. Αναζήτηση Άλμπουμ στο Spotify ---
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=1`;
        
        const searchResponse = await fetch(searchUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const searchData = await searchResponse.json();
        
        let releaseDate = null;
        
        // Λήψη της ημερομηνίας από το πρώτο album με ακρίβεια "day"
        const album = searchData.albums?.items?.[0];
        if (album && album.release_date && album.release_date_precision === 'day') {
             releaseDate = album.release_date; // Μορφή: YYYY-MM-DD
        }
        
        // --- Γ. Επιστροφή Αποτελέσματος ---
        // Επιστρέφουμε 200 (OK) ακόμα κι αν η ημερομηνία είναι null, για να μη σταματήσει το front-end
        res.status(200).json({ fullReleaseDate: releaseDate });

    } catch (error) {
        console.error("Spotify API Server Error:", error.message);
        res.status(200).json({ fullReleaseDate: null, serverError: error.message });
    }
};