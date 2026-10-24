/*******************************************************************************

 Artstation Plus — a browser extension
 Copyright (C) 2023-present Demiurge Ash

 Home: https://github.com/demiurge-ash/artstation-plus

 ******************************************************************************/

let projectCacheQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(null).then(data => {
        const keys = Object.keys(data).filter(key => key === 'project_cache_index_v1' || key.startsWith('project_cache_v1:'));
        if (keys.length) return chrome.storage.local.remove(keys);
    }).catch(error => console.warn('Project cache cleanup:', error));
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!['getProjectCache', 'setProjectCache'].includes(message?.message)) return;
    const pageUrl = new URL(sender.url || 'about:blank');
    const isSite = ['https:', 'http:'].includes(pageUrl.protocol)
        && (pageUrl.hostname === 'artstation.com' || pageUrl.hostname.endsWith('.artstation.com'));
    const isDialog = sender.url?.startsWith(chrome.runtime.getURL('ui/download.html') + '#');
    if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id) || (!isSite && !isDialog)
        || typeof message.hash !== 'string' || !/^[a-zA-Z0-9]{1,64}$/.test(message.hash)) {
        sendResponse({ error: 'Invalid project cache request.' });
        return;
    }
    if (sender.tab.incognito) {
        sendResponse({ data: null });
        return;
    }
    const result = projectCacheQueue.then(() => handleProjectCacheMessage(message));
    projectCacheQueue = result.then(() => {}, () => {});
    result.then(sendResponse, error => sendResponse({ error: error.message }));
    return true;
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!['getDownloadData', 'downloadFile', 'getDownloadStates', 'cancelDownload', 'openFolder'].includes(message?.message)) return;
    if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id)
        || typeof message.token !== 'string' || !/^[\da-f-]{36}$/i.test(message.token)
        || sender.url !== chrome.runtime.getURL('ui/download.html') + '#' + message.token) {
        sendResponse({ error: 'Invalid download dialog.' });
        return;
    }

    handleDownloadMessage(message, sender).then(sendResponse, error => sendResponse({ error: error.message }));
    return true;
});

async function handleDownloadMessage(message, sender) {
    if (message.message === 'getDownloadData') {
        // Ask only the content script in the tab that opened this dialog.
        return await chrome.tabs.sendMessage(sender.tab.id, message, { frameId: 0 })
            || { error: 'The download dialog has expired. Reopen it.' };
    }
    if (message.message === 'downloadFile') {
        const url = new URL(message.url);
        if (!['https:', 'http:'].includes(url.protocol)
            || !(url.hostname === 'artstation.com' || url.hostname.endsWith('.artstation.com'))
            || typeof message.filename !== 'string' || !message.filename) {
            throw new Error('Invalid download file.');
        }
        const downloadId = await chrome.downloads.download({
            url: url.href, filename: message.filename, conflictAction: 'overwrite', saveAs: false
        });
        return { downloadId: downloadId };
    }
    if (message.message === 'getDownloadStates') {
        if (!Array.isArray(message.ids) || message.ids.length > 3
            || !message.ids.every(id => Number.isInteger(id) && id >= 0)) {
            throw new Error('Invalid download IDs.');
        }
        const downloads = await Promise.all(message.ids.map(async id => {
            try {
                return await getDownloadState(id);
            } catch (error) {
                return { id: id, state: 'unavailable', error: error.message };
            }
        }));
        return { downloads: downloads };
    }
    if (!Number.isInteger(message.downloadId) || message.downloadId < 0) {
        throw new Error('Invalid download ID.');
    }
    if (message.message === 'cancelDownload') {
        try {
            await chrome.downloads.cancel(message.downloadId);
        } catch (error) {
            const download = await getDownloadState(message.downloadId).catch(() => null);
            if (download?.state === 'complete') return { download: download };
            throw error;
        }
        const download = await getDownloadState(message.downloadId).catch(() => ({
            id: message.downloadId, state: 'interrupted', error: 'Cancelled.'
        }));
        return { download: download };
    }
    await chrome.downloads.show(message.downloadId);
    return {};
}

async function getDownloadState(id) {
    const items = await chrome.downloads.search({ id: id });
    if (!items.length) return { id: id, state: 'interrupted', error: 'Download removed from history.' };
    return { id: id, state: items[0].state, error: items[0].error };
}

async function handleProjectCacheMessage(message) {
    const key = 'project_cache_v1:' + message.hash;
    const indexKey = 'project_cache_index_v1';
    const ttl = 5 * 60 * 1000;
    // Session quota counts memory, so reserve space beyond serialized payloads for strings and metadata.
    const maxBytes = Math.min(2 * 1024 * 1024, (chrome.storage.session.QUOTA_BYTES || 1024 * 1024) / 4);
    const now = Date.now();
    if (message.message === 'getProjectCache') {
        const result = await chrome.storage.session.get(key);
        const entry = result[key];
        const age = entry && Date.now() - entry.timestamp;
        if (entry && Number.isFinite(entry.timestamp) && age >= 0 && age < ttl) {
            return { data: entry.data };
        }
        if (entry) await chrome.storage.session.remove(key);
        return { data: null };
    }

    const input = message.data;
    if (!input || !['id', 'views_count', 'likes_count', 'comments_count'].every(name =>
        Number.isSafeInteger(input[name]) && input[name] >= 0)
        || !Array.isArray(input.assets) || !input.assets.every(asset => asset && asset.asset_type === 'image'
            && typeof asset.image_url === 'string' && asset.image_url)) throw new Error('Invalid project cache data.');
    if (!Number.isFinite(message.timestamp) || message.timestamp > now || now - message.timestamp >= ttl) return {};
    const data = {
        id: input.id, views_count: input.views_count, likes_count: input.likes_count, comments_count: input.comments_count,
        assets: input.assets.map(asset => ({ asset_type: 'image', image_url: asset.image_url }))
    };
    const entry = { data: data, timestamp: message.timestamp };
    const bytes = new TextEncoder().encode(key + JSON.stringify(entry)).length;
    if (bytes > maxBytes) return {};
    const stored = await chrome.storage.session.get(indexKey);
    const index = stored[indexKey] || {};
    const removed = [];
    for (const [name, item] of Object.entries(index)) {
        if (name === key || !item || !Number.isFinite(item.timestamp) || !Number.isFinite(item.bytes)
            || item.bytes < 0 || item.timestamp > now || now - item.timestamp >= ttl) {
            delete index[name];
            removed.push(name);
        }
    }
    index[key] = { timestamp: message.timestamp, bytes: bytes };
    const oldest = Object.keys(index).sort((a, b) => index[a].timestamp - index[b].timestamp);
    let totalBytes = Object.values(index).reduce((sum, item) => sum + item.bytes, 0);
    while (oldest.length > 500 || totalBytes > maxBytes) {
        const name = oldest.shift();
        totalBytes -= index[name].bytes;
        delete index[name];
        removed.push(name);
    }
    if (removed.length) await chrome.storage.session.remove(removed);
    const updates = { [indexKey]: index };
    if (index[key]) updates[key] = entry;
    await chrome.storage.session.set(updates);
    return {};
}
