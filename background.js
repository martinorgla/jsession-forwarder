const DEFAULT_ENDPOINT = "https://domeen.ee/patchSession";
const FIVE_MINUTES = 5 * 60 * 1000;

let config = {
    enabled: false,
    endpoint: DEFAULT_ENDPOINT,
    lastExecutionTimestamp: null,
    lastSessionId: null,
    monitoredDomain: "",
};

function loadConfig() {
    chrome.storage.local.get(["enabled", "endpoint", "lastExecutionTimestamp", "lastSessionId", "monitoredDomain"]).then(res => {
        config.enabled = !!res.enabled;
        config.endpoint = res.endpoint || DEFAULT_ENDPOINT;
        config.lastExecutionTimestamp = res.lastExecutionTimestamp || null;
        config.lastSessionId = res.lastSessionId || null;
        config.monitoredDomain = res.monitoredDomain || "";
    });
}

function updateConfigValue(key, value) {
    config[key] = value;

    const storageObj = {};
    storageObj[key] = value;

    chrome.storage.local.set(storageObj, () => {
        console.log(`Updated ${key} in config and local storage:`, value);
    });
}

function isMonitored(monitoredUrl) {
    if (!config.monitoredDomain || config.monitoredDomain.trim() === "") {
        return true;
    }

    try {
        const url = new URL(monitoredUrl);
        const host = url.hostname;
        const domain = config.monitoredDomain.trim().toLowerCase();

        return host === domain || host.endsWith("." + domain);
    } catch (e) {
        return false;
    }
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
        if (changes.enabled) {
            config.enabled = changes.enabled.newValue;
        }

        if (changes.endpoint) {
            config.endpoint = changes.endpoint.newValue || DEFAULT_ENDPOINT;
        }

        if (changes.lastExecutionTimestamp) {
            config.lastExecutionTimestamp = changes.lastExecutionTimestamp.newValue || null;
        }

        if (changes.lastSessionId) {
            config.lastSessionId = changes.lastSessionId.newValue || null;
        }

        if (changes.monitoredDomain) {
            config.monitoredDomain = changes.monitoredDomain.newValue || "";
        }
    }
});

chrome.webRequest.onCompleted.addListener(async (details) => {
        loadConfig();

        try {
            if (!config.enabled) {
                return;
            }

            if (!isMonitored(details.url)) {
                return;
            }

            const url = details.url;
            const cookies = await chrome.cookies.getAll({url});

            const jSession = cookies.find(c => c.name === "JSESSIONID");
            const xsrf = cookies.find(c => c.name === "XSRF-TOKEN");
            const expiryCookie = cookies.find(c => c.name === "sessionExpiry");

            const jSessionVal = jSession ? jSession.value : null;
            const xsrfVal = xsrf ? xsrf.value : null;
            const sessionExpiryVal = expiryCookie ? (isNaN(Number(expiryCookie.value)) ? null : Number(expiryCookie.value)) : null;

            if (!jSessionVal) {
                console.log("Session expired. JSESSIONID missing");
                return;
            }

            if (!xsrfVal) {
                console.log("Session expired. XSRF-TOKEN missing");
                return;
            }

            if (!sessionExpiryVal || sessionExpiryVal <= Date.now()) {
                console.log("Session expired, sessionExpiry missing or invalid");
                return;
            }

            let hostname;

            try {
                hostname = (new URL(url)).hostname;
            } catch (e) {
                hostname = details.initiator || "unknown";
            }

            if (config.lastExecutionTimestamp && config.lastSessionId === jSessionVal) {
                if ((Date.now() - config.lastExecutionTimestamp) < FIVE_MINUTES) {
                    console.log(`${hostname} last sentAt is newer than 5 minutes, skipping.`);
                    return;
                }
            }

            const payload = {
                sessionId: jSessionVal,
                xsrfToken: xsrfVal,
                sessionExpiry: sessionExpiryVal,
                sourceUrl: url,
                detectedAt: Date.now()
            };

            try {
                const endpoint = config.endpoint || DEFAULT_ENDPOINT;

                await fetch(endpoint, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                console.log("[Session Forwarder] Sent session to", endpoint, payload);

                updateConfigValue("lastSessionId", jSessionVal);
                updateConfigValue("lastExecutionTimestamp", Date.now());
            } catch (e) {
                console.error("[Session Forwarder] Failed to send PATCH:", e);
            }
        } catch (err) {
            console.error("[Session Forwarder] Listener error:", err);
        }
    },
    {urls: ["<all_urls>"]},
    []);
