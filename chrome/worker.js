/*******************************************************************************

 Artstation Plus — a browser extension
 Copyright (C) 2023-present Demiurge Ash

 Home: https://github.com/demiurge-ash/artstation-plus

 ******************************************************************************/

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message?.message !== 'getDownloadData') return;
    if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id)
        || typeof message.token !== 'string' || !/^[\da-f-]{36}$/i.test(message.token)
        || sender.url !== chrome.runtime.getURL('ui/download.html') + '#' + message.token) {
        sendResponse({ error: 'Invalid download dialog.' });
        return;
    }

    // Ask only the content script in the tab that opened this dialog.
    chrome.tabs.sendMessage(sender.tab.id, message, { frameId: 0 })
        .then(data => sendResponse(data || { error: 'The download dialog has expired. Reopen it.' }),
            error => sendResponse({ error: error.message }));
    return true;
});
