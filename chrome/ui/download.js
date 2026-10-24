const website = 'https://www.artstation.com/';
const websiteProjectUrl = website + 'projects/';
const websiteUserUrl = website + 'users/';
let images;
let closeDialog = false;
const downloadController = new AbortController();

closeButton();
chrome.storage.local.get('userdata', function (items) {
    if (chrome.runtime.lastError) {
        showDownloadError(new Error(chrome.runtime.lastError.message));
        return;
    }
    download(items.userdata);
});

async function download(data) {
    images = [];

    if (!data || !data.username) {
        showDownloadError(new Error('Unable to identify the artist. Reopen the download dialog.'));
        return;
    }

    return getJson(websiteUserUrl + data.username + '/projects.json?per_page=1')
        .then(async function (result) {
            const per_page = 50;
            const totalCount = result.total_count;
            const pages = Math.ceil(totalCount / per_page);
            const fullname = cleanName(data.fullname, data.username);

            await loadAllPages(data, pages, fullname);
            if (closeDialog) return;

            stopSpin();

            let totalImages = images.length;

            if (totalImages > 0) {

                const totalEl = document.getElementById('total');
                totalEl.classList.remove('none');

                const foundEl = document.getElementById('download');
                foundEl.classList.remove('none');

                const folderEl = document.getElementById('username');
                folderEl.textContent = fullname;

                const progressEl = document.getElementById('progress');
                let completedCount = 0;
                let firstDownloadId;

                calculateTotalSize();

                for (const image of images) {
                    if (closeDialog) return;

                    delete image.filesize;
                    image.conflictAction = 'overwrite';
                    image.saveAs = false;
                    image.message = "downloadFile";

                    const response = await chrome.runtime.sendMessage(image);
                    if (!response || response.error || !Number.isInteger(response.downloadId)) {
                        throw new Error(response?.error || 'Unable to start the download.');
                    }
                    if (closeDialog) return;
                    const downloadId = response.downloadId;
                    if (firstDownloadId === undefined) firstDownloadId = downloadId;

                    completedCount++;
                    const progress = (completedCount / totalImages) * 100;
                    progressEl.style.width = progress + '%';

                    await sleep(200);
                    if (closeDialog) return;

                    if (completedCount === totalImages) {
                        const doneEl = document.getElementById('done');
                        doneEl.classList.remove('none');
                        const showBtn = document.querySelector('.show-folder');

                        showBtn.onclick = async function () {
                            try {
                                const response = await chrome.runtime.sendMessage({
                                    message: 'openFolder',
                                    downloadId: firstDownloadId
                                });
                                if (response?.error) throw new Error(response.error);
                            } catch (error) {
                                showDownloadError(error);
                            }
                        }
                    }
                }
            } else {
                const foundEl = document.getElementById('found-nothing');
                foundEl.classList.remove('none');
            }
        }).catch(error => {
            downloadController.abort();
            if (!closeDialog) showDownloadError(error);
        });
}

function loadAllPages(data, pages, fullname) {
    const promises = [];

    for (let i = 1; i <= pages; i++) {
        const promise = getJson(websiteUserUrl + data.username + '/projects.json?page=' + i)
            .then(function(page) {
                const pageData = page.data;
                const itemPromises = pageData.map(function(item) {
                    return saveImages(item, fullname);
                });
                return Promise.all(itemPromises);
            });
        promises.push(promise);
    }

    return Promise.all(promises);
}

async function saveImages(item, fullname) {
    if (closeDialog) return;
    const project = await getJson(websiteProjectUrl + item.hash_id + '.json');
    let iteration = 0;

    const processedAssets = project.assets
        .filter(asset => asset.asset_type === 'image');

    for (const asset of processedAssets) {
        if (closeDialog) return;

        let positionName;
        if (iteration > 0) positionName = iteration;
        iteration++;

        const image = asset.image_url;
        const fileName = fullname
            + '/'
            + fullname
            + ' - '
            + cleanName(item.title)
            + ' - '
            + (positionName ? positionName + ' - ' : '')
            + item.hash_id
            + '.'
            + getFileExtension(image);

        let filesize = await getFileSize(image);
        if (closeDialog || downloadController.signal.aborted) return;

        const imageData = {
            url: image,
            filename: fileName,
            filesize: filesize,
        };

        await updateFoundCount();
        await sleep(100);
        if (closeDialog || downloadController.signal.aborted) return;

        images.push(imageData);
    }
}

function calculateTotalSize() {
    let totalSize = 0;
    for (const image of images) {
        const totalCountEl = document.getElementById('total-count');
        totalSize += image.filesize;
        totalCountEl.textContent = nFormatter(totalSize).toString();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function stopSpin() {
    const spinEl = document.getElementById('found-spin');
    spinEl.classList.remove('art-plus-icon-spin');
}

function showDownloadError(error) {
    console.error(error);
    stopSpin();
    document.getElementById('search').classList.add('none');
    document.getElementById('done').classList.add('none');
    const errorEl = document.getElementById('error');
    errorEl.textContent = 'Unable to complete the operation. ' + error.message;
    errorEl.classList.remove('none');
}

function updateFoundCount() {
    const foundCountEl = document.getElementById('found-count');
    let foundCount = parseInt(foundCountEl.textContent);
    if (foundCount === 0) {
        const foundEl = document.getElementById('found');
        foundEl.classList.remove('none');
    }
    foundCount++;
    foundCountEl.textContent = foundCount.toString();

    return Promise.resolve();
}

function getFileSize(url) {
    return fetch(url, { signal: downloadController.signal })
        .then(function(response) {
            if (!response.ok) return 0;
            const contentLength = response.headers.get('Content-Length');
            if (contentLength !== null) {
                return parseInt(contentLength, 10);
            } else {
                return 0;
            }
        })
        .catch(function(error) {
            if (error.name === 'AbortError') throw error;
            console.log(error);
            return 0;
        });
}

function cleanName(name, fallback = '') {
    let clean = String(name ?? '')
        .replace(/[\u0000-\u001f/\\?%*:|"<>]/g, '-')
        .trim()
        .replace(/[. ]+$/g, '');

    if (!clean && fallback) return cleanName(fallback);

    if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean)) {
        clean = '-' + clean;
    }

    return clean;
}

function getFileExtension(url) {
    return url.split('.').pop().split(/[#?]/)[0];
}

function getJson(url) {
    return fetch(url, { signal: downloadController.signal })
        .then(function(response) {
            if (!response.ok) throw new Error('ArtStation request failed: ' + response.status);
            return response.json();
        })
        .then(function(data) {
            return data;
        });
}

function closeButton() {
    const showBtn = document.getElementById('close');
    showBtn.onclick = function() {
        closeDialogEvent();
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeDialogEvent();
        }
    });
}

function closeDialogEvent() {
    closeDialog = true;
    downloadController.abort();
    window.parent.postMessage('closeModal', '*');
}

function nFormatter(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'Gb';
    }
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'Mb';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'Kb';
    }
    return num;
}
