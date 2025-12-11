var results_container = document.querySelector("#saavn-results");

function PlayAudio(audio_url, song_id) {
    var audio = document.getElementById('player');
    var source = document.getElementById('audioSource');
    source.src = audio_url;
    var name = document.getElementById(song_id+"-n").textContent;
    var album = document.getElementById(song_id+"-a").textContent;
    var image = document.getElementById(song_id+"-i").getAttribute("src");

    document.title = name+" - "+album;
    var bitrate = document.getElementById('saavn-bitrate');
    var bitrate_i = bitrate.options[bitrate.selectedIndex].value;
    var quality = (bitrate_i == 4 ? 320 : 160);

    document.getElementById("player-name").innerHTML = name;
    document.getElementById("player-album").innerHTML = album;
    document.getElementById("player-image").setAttribute("src",image);

    var promise = audio.load();
    if (promise) {
        promise.catch(function(error) { console.error(error); });
    }
    audio.play();
};

function searchSong(search_term) {
    document.getElementById('saavn-search-box').value = search_term;
    document.getElementById("search-trigger").click();
}

var DOWNLOAD_API = "https://openmp3compiler.astudy.org";

function AddDownload(id) {
    var SONG_URL = results_objects[id].downloadUrl.find(q => q.quality == "320kbps")?.link || results_objects[id].downloadUrl.pop()?.link;
    var DOWNLOAD_STATUS_URL = `${DOWNLOAD_API}/status?id=`;

    fetch(`${DOWNLOAD_API}/add?id=${id}&url=${SONG_URL}&title=${encodeURIComponent(results_objects[id].name)}&album=${encodeURIComponent(results_objects[id].album.name)}&artist=${encodeURIComponent(results_objects[id].primaryArtists)}&img=${encodeURIComponent(results_objects[id].image[2].link)}`)
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        if(data.status == "Added") {
            var downloads_list = document.getElementById('download-list');
            var download_item = `
            <li id="dl-item-${id}" class="list-group-item bg-dark" style="border-color:#ff9f44;color:rgb(255,255,255);">
                <div class="row">
                    <div class="col-12 col-md-8" style="padding-right:0px;">
                        <p class="float-left">${results_objects[id].name}</p>
                        <p class="float-right" id="dl-size-${id}" style="color:gray;padding-left:10px;">Size: 0MB</p>
                    </div>
                    <div class="col-12 col-md-4" style="text-align: right;padding-left:0px;">
                        <span id="dl-status-${id}" style="color:green">Compiling.</span>
                    </div>
                </div>
                <hr>
            </li>`;
            downloads_list.innerHTML = download_item + downloads_list.innerHTML;

            var download_status_span = document.getElementById("dl-status-"+id);
            var download_size = document.getElementById("dl-size-"+id);

            var float_tap = document.getElementById('mpopupLink');
            float_tap.style.backgroundColor = "green";
            float_tap.style.borderColor = "green";

            setTimeout(function() {
                float_tap.style.backgroundColor = "#ff9f44";
                float_tap.style.borderColor = "#ff9f44";
            }, 1000);

            var interval = setInterval(function() {
                fetch(DOWNLOAD_STATUS_URL + id)
                .then(response => response.json())
                .then(data => {
                    if (data.status) {
                        download_status_span.textContent = data.status;
                        if(data.size) download_size.textContent = "Size: "+data.size;
                        if (data.status == "Done") {
                            download_status_span.innerHTML = `<a href="${DOWNLOAD_API}${data.url}" target="_blank" style="color:rgb(255,165,0);">Download MP3</a>`;
                            clearInterval(interval);
                            return;
                        }
                    }
                });
            }, 3000);
        }
    })
    .catch(error => {
        console.error('Download API Error (CORS or Fetch Failed):', error);
        var downloads_list = document.getElementById('download-list');
        var error_message = `<li class="list-group-item bg-dark" style="border-color:rgb(255,0,0);color:rgb(255,0,0);">
                                **CORS/API Σφάλμα Λήψης:** Αδύνατη η σύνδεση με το ${DOWNLOAD_API}.<br>
                                Αυτό συνήθως οφείλεται σε **CORS Policy** ή ο server είναι ανενεργός.
                            </li>`;
        downloads_list.innerHTML = error_message + downloads_list.innerHTML;
    });
}

// *** ΝΕΑ ΣΥΝΑΡΤΗΣΗ ΓΙΑ ΦΙΛΤΡΟ SONGS ***
async function filterAlbumSongType(album_id, song_id) {
    const albumApiUrl = `https://jiosaavn-api-privatecvc2.vercel.app/albums?id=${album_id}`;
    const container = document.getElementById(`song-container-${song_id}`);
    if (!container) return;

    try {
        const response = await fetch(albumApiUrl);
        const data = await response.json();
        const song_count = data.data.songs ? data.data.songs.length : 0;

        if (song_count >= 6) container.style.display = 'block';
        else container.style.display = 'none';
    } catch (error) {
        console.error(`Error fetching album details for song ${song_id}:`, error);
        container.style.display = 'none';
    }
}

// ΣΥΝΑΡΤΗΣΗ ΓΙΑ ΤΟΝ ΕΛΕΓΧΟ ΤΟΥ ΑΡΙΘΜΟΥ ΤΩΝ ΤΡΑΓΟΥΔΙΩΝ
async function getAlbumSongCount(album_id) {
    const albumApiUrl = `https://jiosaavn-api-privatecvc2.vercel.app/albums?id=${album_id}`;
    const countElement = document.getElementById(`album-count-${album_id}`);
    if (!countElement) return;

    try {
        const response = await fetch(albumApiUrl);
        const data = await response.json();
        const song_count = data.data.songs ? data.data.songs.length : 'N/A';
        countElement.textContent = `Tracks: ${song_count}`;

        const filter_type = document.getElementById('album-filter-type').value;
        const container = countElement.closest('.song-container'); 
        if (container) {
            if (filter_type === 'all') container.style.display = 'block';
            else {
                let matches_filter = false;
                if (filter_type === 'single' && (song_count === 1 || song_count === 2)) matches_filter = true;
                else if (filter_type === 'ep' && (song_count >= 3 && song_count <= 5)) matches_filter = true;
                else if (filter_type === 'full' && song_count >= 6) matches_filter = true;
                container.style.display = matches_filter ? 'block' : 'none';
            }
        }

    } catch (error) {
        console.error(`Error fetching song count for album ${album_id}:`, error);
        countElement.textContent = 'Tracks: Error';
    }
}

// ΣΥΝΑΡΤΗΣΗ ΓΙΑ ΤΗΝ ΕΜΦΑΝΙΣΗ ΤΩΝ ΤΡΑΓΟΥΔΙΩΝ ΕΝΟΣ ΑΛΜΠΟΥΜ
async function loadAlbumSongs(album_id) {
    const albumApiUrl = `https://jiosaavn-api-privatecvc2.vercel.app/albums?id=${album_id}`; 
    results_container.innerHTML = `<span class="loader">Loading Album Tracks...</span>`;

    try {
        const response = await fetch(albumApiUrl);
        const data = await response.json();
        console.log("Album Data:", data); 
        alert(`Loaded Album ID: ${album_id}. Check console for full track list.`);
    } catch (error) {
        console.error("Error fetching album songs:", error);
        results_container.innerHTML = `<span class="loader">Error loading album tracks.</span>`;
    }
}
