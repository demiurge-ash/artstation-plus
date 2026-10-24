/*******************************************************************************

 Artstation Plus — a browser extension
 Copyright (C) 2023-present Demiurge Ash

 Home: https://github.com/demiurge-ash/artstation-plus

 ******************************************************************************/

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
