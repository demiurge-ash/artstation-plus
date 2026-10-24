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
let downloadStatusID;
let checkingDownloads = false;
let downloadStatusFailures = 0;

closeButton();
document.getElementById('cancel').onclick = cancelDownloads;
startDownload();

async function startDownload() {
    try {
        const data = await downloadRequest('getDownloadData');
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
        clearTimeout(downloadStatusID);
        downloadStatusID = undefined;
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
    const response = await downloadRequest('downloadFile', {
        url: image.url,
        filename: image.filename
    });
    const id = response.downloadId;
    if (!Number.isInteger(id)) throw new Error('Unable to start the download.');
    if (closeDialog && !cancelled) return { id: id, state: 'in_progress' };

    return new Promise(resolve => {
        activeDownloads.set(id, resolve);
        if (downloadStatusID === undefined && !checkingDownloads) {
            downloadStatusID = setTimeout(checkDownloadStates, 0);
        }
        if (cancelled) cancelDownload(id);
    });
}

async function checkDownloadStates() {
    downloadStatusID = undefined;
    if (closeDialog || !activeDownloads.size) return;
    checkingDownloads = true;
    const ids = Array.from(activeDownloads.keys());
    try {
        const response = await downloadRequest('getDownloadStates', { ids: ids });
        if (closeDialog) return;
        if (!Array.isArray(response.downloads) || response.downloads.length !== ids.length
            || ids.some(id => !response.downloads.some(item => item && item.id === id))
            || response.downloads.some(item => !['in_progress', 'complete', 'interrupted', 'unavailable'].includes(item.state))) {
            throw new Error('Invalid download status response.');
        }
        downloadStatusFailures = 0;
        for (const item of response.downloads) {
            if (item.state === 'unavailable') await failDownloadTracking(item.id, new Error(item.error));
            else settleDownload(item.id, item.state, item.error);
        }
    } catch (error) {
        // Retry short-lived messaging failures without starting files again.
        if (++downloadStatusFailures >= 3) {
            for (const id of ids) await failDownloadTracking(id, error);
        }
    } finally {
        checkingDownloads = false;
        if (!closeDialog && activeDownloads.size) downloadStatusID = setTimeout(checkDownloadStates, 500);
    }
}

async function failDownloadTracking(id, error) {
    if (closeDialog || !activeDownloads.has(id)) return;
    try {
        const result = await downloadRequest('cancelDownload', { downloadId: id });
        if (result.download?.state === 'complete') {
            settleDownload(id, 'complete');
            return;
        }
    } catch (cancelError) {
        queueStopped = true;
        error = new Error('Unable to track or cancel the download. Queue stopped. ' + cancelError.message);
    }
    settleDownload(id, 'interrupted', error.message);
}

function settleDownload(id, state, error) {
    if (state !== 'complete' && state !== 'interrupted') return;
    const resolve = activeDownloads.get(id);
    if (!resolve) return;
    activeDownloads.delete(id);
    resolve({ id: id, state: state, error: error });
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
        const result = await downloadRequest('cancelDownload', { downloadId: id });
        if (!activeDownloads.has(id)) return;
        settleDownload(id, result.download?.state === 'complete' ? 'complete' : 'interrupted', 'Cancelled.');
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
                await downloadRequest('openFolder', { downloadId: firstDownloadId });
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

async function downloadRequest(message, data = {}) {
    const response = await chrome.runtime.sendMessage({ ...data, message: message, token: token });
    if (!response || response.error) throw new Error(response?.error || 'The download service did not respond.');
    return response;
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
    clearTimeout(downloadStatusID);
    downloadStatusID = undefined;
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
