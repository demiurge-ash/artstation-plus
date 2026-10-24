/*******************************************************************************

 Artstation Plus — a browser extension
 Copyright (C) 2023-present Demiurge Ash

 Home: https://github.com/demiurge-ash/artstation-plus

 ******************************************************************************/

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

    // Save File to folder
    if (message.message && message.message === 'downloadFile') {
        delete message.message;
        try {
            chrome.downloads.download(message, function (downloadId) {
                const error = chrome.runtime.lastError;
                sendResponse(error ? { error: error.message } : { downloadId: downloadId });
            });
        } catch (error) {
            sendResponse({ error: error.message });
        }

        return true;

    // Open Download Folder
    } else if (message.message && message.message === 'openFolder') {
        try {
            chrome.downloads.show(message.downloadId);
            sendResponse({});
        } catch (error) {
            sendResponse({ error: error.message });
        }
    }

});
