const designCheckbox = document.getElementById('legacyDesign');

chrome.storage.local.get('legacyDesign', (data) => {
    if (data.legacyDesign !== undefined) {
        designCheckbox.checked = data.legacyDesign;
    }
});

designCheckbox.addEventListener('change', (event) => {
    chrome.storage.local.set({ legacyDesign: event.target.checked });
});

document.getElementById('close-button').addEventListener('click', function() {
    window.close();
});