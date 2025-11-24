const domainInput = document.getElementById("domain");
const endpointInput = document.getElementById("endpoint");
const enabledCheckbox = document.getElementById("enabled");
const saveBtn = document.getElementById("save");
const statusTxt = document.getElementById("statustxt");
const endpointTxt = document.getElementById("endpointTxt");
const lastExecutionTimestamp = document.getElementById("lastExecutionTimestampTxt");
const lastSessionIdTxt = document.getElementById("lastSessionIdTxt");

function load() {
    chrome.storage.local.get(["enabled", "monitoredDomain", "endpoint"]).then(res => {
        enabledCheckbox.checked = !!res.enabled;
        domainInput.value = res.monitoredDomain || "";
        endpointInput.value = res.endpoint || "https://domeen.ee/patchSession";

        updateStatus();
    });
}

function save() {
    const monitoredDomain = domainInput.value.trim();
    const endpoint = endpointInput.value.trim();
    const enabled = enabledCheckbox.checked;

    chrome.storage.local.set({
        enabled,
        endpoint,
        lastExecutionTimestamp: null,
        lastSessionId: null,
        monitoredDomain
    }).then(() => {
        statusTxt.textContent = "Saved!";

        setTimeout(updateStatus, 800);
    });
}

function updateStatus() {
    chrome.storage.local.get(["enabled", "endpoint", "lastExecutionTimestamp", "lastSessionId"]).then(res => {
        statusTxt.textContent = res.enabled ? "Enabled" : "Disabled";
        statusTxt.style.color = res.enabled ? "green" : "red";
        endpointTxt.textContent = res.endpoint || "not set"
        lastExecutionTimestamp.textContent = res.lastExecutionTimestamp ? new Date(res.lastExecutionTimestamp).toLocaleString() : "No data sent yet.";
        lastSessionIdTxt.textContent = res.lastSessionId || "No data sent yet.";
    });
}

saveBtn.addEventListener("click", save);

document.addEventListener("DOMContentLoaded", load);
