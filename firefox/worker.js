/*******************************************************************************

 Artstation Plus — a browser extension
 Copyright (C) 2023-present Demiurge Ash

 Home: https://github.com/demiurge-ash/artstation-plus

 ******************************************************************************/

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

    // Save File to folder
    if (message.message && message.message === 'downloadFile') {
        delete message.message;
        chrome.downloads.download(message, function (downloadId) {
            sendResponse(downloadId);
        });

        return true;

    // Open Download Folder
    } else if (message.message && message.message === 'openFolder') {
        chrome.downloads.show(message.downloadId);
    }

});
