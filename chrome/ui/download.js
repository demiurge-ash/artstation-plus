const website = 'https://www.artstation.com/';
const websiteProjectUrl = website + 'projects/';
const websiteUserUrl = website + 'users/';
const downloadApi = createApiClient({ credentials: 'include' });
const token = window.location.hash.slice(1);
const activeDownloads = new Map();
let images = [];
let closeDialog = false;
let cancelled = false;
let queueStopped = false;
let finished = false;
let parentOrigin = '*';
let completedCount = 0;
let failedCount = 0;
let preparationFailures = 0;
let totalImages = 0;
let totalSize = 0;
let unknownSizes = 0;
let firstDownloadId;

closeButton();
document.getElementById('cancel').onclick = cancelDownloads;
startDownload();

async function startDownload() {
    try {
        const data = await chrome.runtime.sendMessage({ message: 'getDownloadData', token: token });
        if (closeDialog) return;
        if (cancelled) return finishDownloads();
        if (!data || data.error || typeof data.username !== 'string' || !data.username) {
            throw new Error(data?.error || 'Unable to identify the artist. Reopen the download dialog.');
        }
        parentOrigin = data.parentOrigin;
        const username = encodeURIComponent(data.username);
        const result = await getJson(websiteUserUrl + username + '/projects.json?per_page=1',
            data => data && isApiCount(data.total_count));
        const fullname = cleanName(data.fullname, data.username);
        document.getElementById('username').textContent = fullname;

        await loadAllPages(username, Math.ceil(Number(result.total_count) / 50), fullname);
        if (closeDialog) return;
        if (cancelled) return finishDownloads();
        stopSpin();
        document.getElementById('search').classList.add('none');
        totalImages = images.length;

        if (totalImages === 0) {
            document.getElementById('found-nothing').classList.remove('none');
            return finishDownloads();
        }

        document.getElementById('total-count').textContent = nFormatter(totalSize)
            + (unknownSizes ? ' (some sizes unknown)' : '');
        document.getElementById('total').classList.remove('none');
        document.getElementById('download').classList.remove('none');
        updateProgress();
        chrome.downloads.onChanged.addListener(onDownloadChanged);
        chrome.downloads.onErased.addListener(onDownloadErased);

        let nextImage = 0;
        async function consume() {
            while (!cancelled && !closeDialog && !queueStopped && nextImage < images.length) {
                const index = nextImage++;
                const image = images[index];
                images[index] = null;
                try {
                    const result = await downloadFile(image);
                    if (closeDialog) return;
                    if (result.state === 'complete') {
                        completedCount++;
                        if (firstDownloadId === undefined) firstDownloadId = result.id;
                    } else if (!cancelled) {
                        failedCount++;
                        recordFailure(image.filename, new Error(result.error || 'Download interrupted.'));
                    }
                } catch (error) {
                    if (closeDialog) return;
                    if (!cancelled) {
                        failedCount++;
                        recordFailure(image.filename, error);
                    }
                }
                updateProgress();
                if ((completedCount + failedCount) % 25 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(3, totalImages) }, consume));
        if (!closeDialog) finishDownloads();
    } catch (error) {
        downloadApi.abort();
        if (!closeDialog) {
            if (cancelled) finishDownloads();
            else showDownloadError(error);
        }
    } finally {
        images = [];
        chrome.downloads.onChanged.removeListener(onDownloadChanged);
        chrome.downloads.onErased.removeListener(onDownloadErased);
    }
}

async function loadAllPages(username, pages, fullname) {
    for (let pageIndex = 1; pageIndex <= pages; pageIndex++) {
        if (cancelled || closeDialog) return;
        let page;
        try {
            page = await getJson(websiteUserUrl + username + '/projects.json?per_page=50&page=' + pageIndex,
                data => data && Array.isArray(data.data)
                    && data.data.every(item => item && typeof item.hash_id === 'string' && item.hash_id.length > 0));
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            preparationFailures++;
            recordFailure('Page ' + pageIndex, error);
            continue;
        }

        let nextProject = 0;
        async function prepare() {
            while (!cancelled && !closeDialog && nextProject < page.data.length) {
                const item = page.data[nextProject++];
                try {
                    await saveImages(item, fullname);
                } catch (error) {
                    if (error.name === 'AbortError') throw error;
                    preparationFailures++;
                    recordFailure(item.title || item.hash_id, error);
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(3, page.data.length) }, prepare));
    }
}

async function saveImages(item, fullname) {
    const project = await getJson(websiteProjectUrl + encodeURIComponent(item.hash_id) + '.json',
        data => data && Array.isArray(data.assets) && data.assets.every(asset => asset
            && typeof asset.asset_type === 'string'
            && (asset.asset_type !== 'image' || (typeof asset.image_url === 'string' && asset.image_url.length > 0))));
    let iteration = 0;

    for (const asset of project.assets) {
        if (cancelled || closeDialog) return;
        if (asset.asset_type !== 'image') continue;
        const positionName = iteration++;
        try {
            const url = new URL(asset.image_url);
            if (!['https:', 'http:'].includes(url.protocol)
                || !(url.hostname === 'artstation.com' || url.hostname.endsWith('.artstation.com'))) {
                throw new Error('Invalid image URL.');
            }
            const filename = fullname + '/' + fullname + ' - ' + cleanName(item.title) + ' - '
                + (positionName ? positionName + ' - ' : '') + cleanName(item.hash_id) + '.' + getFileExtension(url);
            const filesize = await getFileSize(url.href);
            if (cancelled || closeDialog) return;
            images.push({ url: url.href, filename: filename });
            totalSize += filesize;
            if (!filesize) unknownSizes++;
            document.getElementById('found-count').textContent = images.length.toString();
            document.getElementById('found').classList.remove('none');
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            preparationFailures++;
            recordFailure(item.title || item.hash_id, error);
        }
    }
}

async function downloadFile(image) {
    const id = await chrome.downloads.download({
        url: image.url,
        filename: image.filename,
        conflictAction: 'overwrite',
        saveAs: false
    });
    if (!Number.isInteger(id)) throw new Error('Unable to start the download.');
    if (closeDialog && !cancelled) return { id: id, state: 'in_progress' };

    return new Promise(resolve => {
        activeDownloads.set(id, resolve);
        // A small file may finish before download() returns its ID.
        chrome.downloads.search({ id: id }).then(items => {
            if (!items.length) settleDownload(id, 'interrupted', 'Download removed from history.');
            else settleDownload(id, items[0].state, items[0].error);
        }).catch(async error => {
            if (closeDialog || !activeDownloads.has(id)) return;
            try {
                await chrome.downloads.cancel(id);
            } catch (cancelError) {
                queueStopped = true;
                error = new Error('Unable to track or cancel the download. Queue stopped. ' + cancelError.message);
            }
            settleDownload(id, 'interrupted', error.message);
        });
        if (cancelled) cancelDownload(id);
    });
}

function settleDownload(id, state, error) {
    if (state !== 'complete' && state !== 'interrupted') return;
    const resolve = activeDownloads.get(id);
    if (!resolve) return;
    activeDownloads.delete(id);
    resolve({ id: id, state: state, error: error });
}

function onDownloadChanged(delta) {
    settleDownload(delta.id, delta.state?.current || (delta.error?.current ? 'interrupted' : undefined), delta.error?.current);
}

function onDownloadErased(id) {
    settleDownload(id, 'interrupted', 'Download removed from history.');
}

async function cancelDownloads() {
    if (cancelled || finished) return;
    cancelled = true;
    downloadApi.abort();
    document.getElementById('cancel').disabled = true;
    await Promise.all(Array.from(activeDownloads.keys(), cancelDownload));
}

async function cancelDownload(id) {
    try {
        await chrome.downloads.cancel(id);
        if (!activeDownloads.has(id)) return;
        const items = await chrome.downloads.search({ id: id });
        settleDownload(id, items[0]?.state === 'complete' ? 'complete' : 'interrupted', 'Cancelled.');
    } catch (error) {
        if (!closeDialog) recordFailure('Cancel download ' + id, error);
        settleDownload(id, 'interrupted', error.message);
    }
}

function updateProgress() {
    document.getElementById('download-status').classList.remove('none');
    document.getElementById('download-status').textContent = 'Downloaded: ' + completedCount + ' / ' + totalImages
        + (failedCount ? '. Failed: ' + failedCount : '');
    const progress = totalImages ? completedCount / totalImages * 100 : 0;
    document.getElementById('progress').style.width = progress + '%';
    document.getElementById('progress').setAttribute('aria-valuenow', Math.round(progress));
}

function finishDownloads() {
    finished = true;
    stopSpin();
    document.getElementById('search').classList.add('none');
    document.getElementById('cancel').classList.add('none');
    if (!cancelled && !totalImages && !preparationFailures) return;
    document.getElementById('done-message').textContent = cancelled ? 'Cancelled.'
        : failedCount || preparationFailures ? 'Finished with errors.' : 'Well done!';
    document.getElementById('done').classList.remove('none');
    const showBtn = document.querySelector('.show-folder');
    if (firstDownloadId !== undefined) {
        showBtn.classList.remove('none');
        showBtn.onclick = async () => {
            try {
                await chrome.downloads.show(firstDownloadId);
            } catch (error) {
                recordFailure('Open Folder', error);
            }
        };
    }
}

function recordFailure(label, error) {
    const list = document.getElementById('failure-list');
    document.getElementById('failures').classList.remove('none');
    if (list.childElementCount < 20) {
        const entry = document.createElement('li');
        entry.textContent = label + ': ' + error.message;
        list.appendChild(entry);
    } else {
        document.getElementById('failure-limit').classList.remove('none');
    }
}

function stopSpin() {
    document.getElementById('found-spin').classList.remove('art-plus-icon-spin');
}

function showDownloadError(error) {
    finished = true;
    console.error(error);
    stopSpin();
    document.getElementById('search').classList.add('none');
    document.getElementById('done').classList.add('none');
    document.getElementById('cancel').classList.add('none');
    const errorEl = document.getElementById('error');
    errorEl.textContent = 'Unable to complete the operation. ' + error.message;
    errorEl.classList.remove('none');
}

function getFileSize(url) {
    return downloadApi.getFileSize(url).catch(error => {
        if (error.name === 'AbortError') throw error;
        return 0;
    });
}

function cleanName(name, fallback = '') {
    let clean = String(name ?? '')
        .replace(/[\u0000-\u001f/\\?%*:|"<>]/g, '-')
        .trim()
        .replace(/^[. ]+|[. ]+$/g, '');

    if (!clean && fallback) return cleanName(fallback);

    if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean)) {
        clean = '-' + clean;
    }

    return clean;
}

function getFileExtension(url) {
    const extension = url.pathname.split('.').pop().toLowerCase();
    return /^(jpe?g|png|gif|webp|avif|bmp|tiff?|svg)$/.test(extension) ? extension : 'jpg';
}

function getJson(url, validate) {
    return downloadApi.getJson(url, validate);
}

function closeButton() {
    document.getElementById('close').onclick = closeDialogEvent;
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeDialogEvent();
    });
    window.addEventListener('pagehide', stopQueue);
}

function stopQueue() {
    closeDialog = true;
    downloadApi.abort();
    chrome.downloads.onChanged.removeListener(onDownloadChanged);
    chrome.downloads.onErased.removeListener(onDownloadErased);
    for (const id of activeDownloads.keys()) settleDownload(id, 'interrupted', 'Dialog closed.');
    images = [];
}

function closeDialogEvent() {
    stopQueue();
    window.parent.postMessage({ message: 'closeModal', token: token }, parentOrigin);
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
