"use strict";

const HTTPS_PATTERN = /^https:\/\//i;
const VALID_URL_PATTERN = /^(f|ht)tps?:\/\//i;

const detectEnvironment = (platformInfo = {}, hasInstallTrigger = false) => {
    if (platformInfo.os === "android") return "android";
    return hasInstallTrigger ? "firefox" : "chrome";
};

const isValidUrl = (url) => typeof url === "string" && VALID_URL_PATTERN.test(url);

const isBrowserUrl = (url) => typeof url === "string" && (url.startsWith("about:") || url.startsWith("chrome://"));

const isHttpsUrl = (url) => typeof url === "string" && HTTPS_PATTERN.test(url);

const normalizeUrl = (url) => {
    if (!isValidUrl(url)) return url;
    const uri = new URL(url);
    const host = uri.host.toLowerCase();
    const normalizedHost = host.startsWith("www.") ? host.slice(4) : host;
    const normalizedUrl = `https://${normalizedHost}${uri.pathname}${uri.search}${uri.hash}`.replace(/\/$/, "");
    return normalizedUrl.toLowerCase();
};

const buildMatchPattern = (url) => {
    if (isValidUrl(url)) {
        const normalizedUrl = normalizeUrl(url);
        const uri = new URL(normalizedUrl);
        const hostname = uri.hostname.toLowerCase();
        const port = uri.port ? `:${uri.port}` : "";
        const hostVariants = new Set([hostname]);
        if (hostname.startsWith("www.")) {
            hostVariants.add(hostname.slice(4));
        } else {
            const dotCount = (hostname.match(/\./g) || []).length;
            if (dotCount === 1) hostVariants.add(`www.${hostname}`);
        }
        const patterns = Array.from(hostVariants).map(hostVariant => `*://${hostVariant}${port}/*`);
        return patterns.length === 1 ? patterns[0] : patterns;
    }
    if (isBrowserUrl(url)) {
        return `${url}*`;
    }
    return url;
};

const chooseByPinned = (observedTab, candidateTab, keepPinnedTab) => {
    if (!keepPinnedTab || observedTab.pinned === candidateTab.pinned) return null;
    return observedTab.pinned ? observedTab.id : candidateTab.id;
};

const chooseByHttps = (observedUrl, candidateUrl, observedTab, candidateTab, keepTabWithHttps) => {
    if (!keepTabWithHttps) return null;
    const observedHttps = isHttpsUrl(observedUrl);
    const candidateHttps = isHttpsUrl(candidateUrl);
    if (observedHttps === candidateHttps) return null;
    return observedHttps ? observedTab.id : candidateTab.id;
};

const chooseByRecency = (observedLastComplete, candidateLastComplete, observedTab, candidateTab, keepNewerTab) => {
    const observedMissing = observedLastComplete === null || typeof observedLastComplete === "undefined";
    const candidateMissing = candidateLastComplete === null || typeof candidateLastComplete === "undefined";
    if (keepNewerTab) {
        if (observedMissing) return observedTab.id;
        if (candidateMissing) return candidateTab.id;
        return observedLastComplete > candidateLastComplete ? observedTab.id : candidateTab.id;
    }
    if (observedMissing) return candidateTab.id;
    if (candidateMissing) return observedTab.id;
    return observedLastComplete < candidateLastComplete ? observedTab.id : candidateTab.id;
};

const chooseByFocus = (observedTab, candidateTab, activeWindowId, currentRetainedId) => {
    if (!activeWindowId) return currentRetainedId;
    const candidateInActiveWindow = candidateTab.windowId === activeWindowId;
    const observedInActiveWindow = observedTab.windowId === activeWindowId;

    if (currentRetainedId === observedTab.id) {
        if (candidateInActiveWindow && (candidateTab.active || !observedInActiveWindow)) {
            return candidateTab.id;
        }
        return observedTab.id;
    }

    if (observedInActiveWindow && (observedTab.active || !candidateInActiveWindow)) {
        return observedTab.id;
    }
    return candidateTab.id;
};

const determineRetainedTabId = ({
    observedTab,
    observedTabUrl,
    candidateTab,
    candidateUrl,
    observedTabLastComplete,
    candidateLastComplete,
    activeWindowId,
    keepPinnedTab,
    keepTabWithHttps,
    keepNewerTab
}) => {
    let retainedTabId = chooseByPinned(observedTab, candidateTab, keepPinnedTab);
    if (!retainedTabId) {
        retainedTabId = chooseByHttps(observedTabUrl ?? observedTab.url, candidateUrl ?? candidateTab.url, observedTab, candidateTab, keepTabWithHttps);
        if (!retainedTabId) {
            retainedTabId = chooseByRecency(observedTabLastComplete, candidateLastComplete, observedTab, candidateTab, keepNewerTab);
            retainedTabId = chooseByFocus(observedTab, candidateTab, activeWindowId, retainedTabId);
        }
    }
    return retainedTabId;
};

class TabsInfo {

    constructor() {
        this.tabs = new Map();
        this.nbDuplicateTabs = new Map();
        this.initialize();
    }

    async initialize() {
        const openedTabs = await getTabs({ windowType: "normal" });
        for (const openedTab of openedTabs) {
            this.setOpenedTab(openedTab);
        }
    }

    setNewTab(tabId) {
        const tab = { url: null, lastComplete: null, ignored: false };
        this.tabs.set(tabId, tab);
    }

    setOpenedTab(openedTab) {
        const tab = { url: openedTab.url, lastComplete: Date.now(), ignored: false };
        this.tabs.set(openedTab.id, tab);
    }

    ignoreTab(tabId, state) {
        const tab = this.tabs.get(tabId);
        tab.ignored = state;
        this.tabs.set(tabId, tab);
    }

    isIgnoredTab(tabId) {
        const tab = this.tabs.get(tabId);
        return (!tab || tab.ignored) ? true : false;
    }

    getLastComplete(tabId) {
        const tab = this.tabs.get(tabId);
        return tab.lastComplete;
    }

    updateTab(openedTab) {
        const tab = this.tabs.get(openedTab.id);
        tab.url = openedTab.url;
        tab.lastComplete = Date.now();
        this.tabs.set(openedTab.id, tab);
    }

    resetTab(tabId) {
        this.setNewTab(tabId);
    }

    hasUrlChanged(openedTab) {
        const tab = this.tabs.get(openedTab.id);
        return tab.url !== openedTab.url;
    }

    removeTab(tabId) {
        this.tabs.delete(tabId);
    }

    hasTab(tabId) {
        return this.tabs.has(tabId);
    }

    hasDuplicateTabs(windowId) {
        // Even nothing set, return true so it will force the refresh and set the badge.
        return this.nbDuplicateTabs.get(windowId) !== "0";
    }

    getNbDuplicateTabs(windowId) {
        return this.nbDuplicateTabs.get(windowId) || "0";
    }

    setNbDuplicateTabs(windowId, nbDuplicateTabs) {
        this.nbDuplicateTabs.set(windowId, nbDuplicateTabs.toString());
    }

    clearDuplicateTabsInfo(windowId) {
        if (this.nbDuplicateTabs.has(windowId)) this.nbDuplicateTabs.delete(windowId);
    }

}

// eslint-disable-next-line no-unused-vars
const tabsInfo = new TabsInfo();"use strict";

const defaultOptions = {
    shrunkMode: {
        value: false
    },
    onDuplicateTabDetected: {
        value: "A"
    },
    onRemainingTab: {
        value: "A"
    },
    keepTabBasedOnAge: {
        value: "O" // "O" (older) or "N" (newer)
    },
    keepTabWithHttps: {
        value: true
    },
    keepPinnedTab: {
        value: true
    },
    keepTabWithHistory: {
        value: false
    },
    scope: {
        value: "C"
    },
    ignoreHashPart: {
        value: false
    },
    ignoreSearchPart: {
        value: false
    },
    ignorePathPart: {
        value: false
    },
    ignore3w: {
        value: true
    },
    caseInsensitive: {
        value: true
    },
    compareWithTitle: {
        value: false
    },
    onDuplicateTabDetectedPinned: {
        value: true
    },
    tabPriorityPinned: {
        value: true
    },
    matchingRulesPinned: {
        value: true
    },
    scopePinned: {
        value: true
    },
    customizationPinned: {
        value: true
    },
    whiteList: {
        value: ""
    },
    blackList: {
        value: ""
    },
    badgeColorDuplicateTabs: {
        value: BADGE_PRIMARY_COLOR
    },
    badgeColorNoDuplicateTabs: {
        value: BADGE_PRIMARY_COLOR
    },
    badgeColorNoDuplicateTabs: {
        value: "#1e90ff"
    },
    showBadgeIfNoDuplicateTabs: {
        value: true
    },
    closePopup: {
        value: false
    },
    closePopup: {
        value: false
    },
    environment: {
        value: "firefox"
    }
};

const setupDefaultOptions = async () => {
    const environment = await getEnvironment();
    const options = Object.assign({}, defaultOptions);
    options.environment.value = environment;
    return options;
};

const getEnvironment = async () => {
    const info = await getPlatformInfo();
    const environment = detectEnvironment(info, typeof InstallTrigger !== "undefined");
    return environment;
};

const getNotInReferenceKeys = (referenceKeys, keys) => {
    const setKeys = new Set(keys);
    return Array.from(referenceKeys).filter(key => !setKeys.has(key));
};

// eslint-disable-next-line no-unused-vars
const initializeOptions = async () => {
    const options = await getStoredOptions();
    let storedOptions = options.storedOptions;
    if (storedOptions.length === 0) {
        const intialOptions = await setupDefaultOptions();
        storedOptions = await saveStoredOptions(intialOptions);
    } else {
        const storedKeys = Object.keys(storedOptions).sort();
        const defaultKeys = Object.keys(defaultOptions).sort();
        if (JSON.stringify(storedKeys) != JSON.stringify(defaultKeys)) {
            const obsoleteKeys = getNotInReferenceKeys(storedKeys, defaultKeys);
            obsoleteKeys.forEach(key => delete storedOptions[key]);
            const missingKeys = getNotInReferenceKeys(defaultKeys, storedKeys);
            // eslint-disable-next-line no-return-assign
            missingKeys.forEach(key => storedOptions[key] = { value: defaultOptions[key].value });
            const environment = await getEnvironment();
            storedOptions.environment.value = environment;
            storedOptions = await saveStoredOptions(storedOptions, true);
        }
    }
    setOptions(storedOptions);
    setEnvironment(storedOptions);
};

// eslint-disable-next-line no-unused-vars
const setStoredOption = async (name, value, refresh) => {
    const options = await getStoredOptions();
    const storedOptions = options.storedOptions;
    storedOptions[name].value = value;
    saveStoredOptions(storedOptions);
    setOptions(storedOptions);
    if (refresh) refreshGlobalDuplicateTabsInfo();
    else if (name === "onDuplicateTabDetected") setBadgeIcon();
    else if (name === "showBadgeIfNoDuplicateTabs" || name === "badgeColorNoDuplicateTabs" || name === "badgeColorDuplicateTabs") updateBadgeStyle();
};

const options = {};

const setOptions = (storedOptions) => {
    options.autoCloseTab = storedOptions.onDuplicateTabDetected.value === "A";
    options.defaultTabBehavior = storedOptions.onRemainingTab.value === "B";
    options.activateKeptTab = storedOptions.onRemainingTab.value === "A";
    options.keepNewerTab = storedOptions.keepTabBasedOnAge.value === "N";
    options.keepTabWithHttps = storedOptions.keepTabWithHttps.value;
    options.keepPinnedTab = storedOptions.keepPinnedTab.value;
    options.ignoreHashPart = storedOptions.ignoreHashPart.value;
    options.ignoreSearchPart = storedOptions.ignoreSearchPart.value;
    options.ignorePathPart = storedOptions.ignorePathPart.value;
    options.compareWithTitle = storedOptions.compareWithTitle.value;
    options.ignore3w = storedOptions.ignore3w.value;
    options.caseInsensitive = storedOptions.caseInsensitive.value;
    options.searchInAllWindows = storedOptions.scope.value === "A" || storedOptions.scope.value === "CA";
    options.searchPerContainer = storedOptions.scope.value === "CC" || storedOptions.scope.value === "CA";
    options.whiteList = whiteListToPattern(storedOptions.whiteList.value);
    options.badgeColorDuplicateTabs = storedOptions.badgeColorDuplicateTabs.value;
    options.badgeColorNoDuplicateTabs = storedOptions.badgeColorNoDuplicateTabs.value;
    options.showBadgeIfNoDuplicateTabs = storedOptions.showBadgeIfNoDuplicateTabs.value;
};

const environment = {
    isAndroid: false,
    isFirefox: false,
    isChrome: false
};

const setEnvironment = (storedOptions) => {
    if (storedOptions.environment.value === "android") {
        environment.isAndroid = true;
        environment.isFirefox = false;
    } else if (storedOptions.environment.value === "firefox") {
        environment.isAndroid = false;
        environment.isFirefox = true;
        environment.isChrome = false;
    }
    else if (storedOptions.environment.value === "chrome") {
        environment.isAndroid = false;
        environment.isFirefox = false;
        environment.isChrome = true;
    }
};

// eslint-disable-next-line no-unused-vars
const isPanelOptionOpen = () => { 
    return false; //override for now, until replacement API comes in
    /* const popups = chrome.extension.getViews({ type: "popup" });
    if (popups.length) return true;
    const tabs = chrome.extension.getViews({ type: "tab" });
    return tabs.length > 0; */
};

const whiteListToPattern = (whiteList) => {
    const whiteListPatterns = new Set();
    const whiteListLines = whiteList.split("\n").map(line => line.trim());
    whiteListLines.forEach(whiteListLine => {
        const length = whiteListLine.length;
        let pattern = "^";
        for (let index = 0; index < length; index += 1) {
            const character = whiteListLine.charAt(index);
            pattern = (character === "*") ? `${pattern}.*` : pattern + character;
        }
        whiteListPatterns.add(new RegExp(`${pattern}$`));
    });
    return Array.from(whiteListPatterns);
};"use strict";

// eslint-disable-next-line no-unused-vars
const isBlankURL = (url) => url === "about:blank";

// eslint-disable-next-line no-unused-vars
const isChromeURL = (url) => url.startsWith("chrome://") || url.startsWith("view-source:chrome-search");

const isBrowserURL = (url) => isBrowserUrl(url);

const isValidURL = (url) => isValidUrl(url);

// eslint-disable-next-line no-unused-vars
const getMatchingURL = (url) => {
	if (!isValidUrl(url)) return url;
	let matchingURL = url;
	if (options.ignorePathPart) {
		const uri = new URL(matchingURL);
		matchingURL = uri.origin;
	}
	else if (options.ignoreSearchPart) {
		matchingURL = matchingURL.split("?")[0];
	}
	else if (options.ignoreHashPart) {
		matchingURL = matchingURL.split("#")[0];
	}
	if (options.keepTabWithHttps) {
		matchingURL = matchingURL.replace(/^http:\/\//i, "https://");
	}
	if (options.ignore3w) {
		matchingURL = matchingURL.replace("://www.", "://");
	}
	if (options.caseInsensitive) {
		matchingURL = matchingURL.toLowerCase();
	}
	matchingURL = matchingURL.replace(/\/$/, "");
	return matchingURL;
};

// eslint-disable-next-line no-unused-vars
const getMatchPatternURL = (url) => {
	const pattern = buildMatchPattern(url);
	if (!isValidUrl(url) || options.ignorePathPart) {
		return pattern;
	}
	const uri = new URL(url);
	const applyPath = (entry) => {
		if (typeof entry !== "string") return entry;
		const wildcardIndex = entry.indexOf("/*");
		if (wildcardIndex === -1) return entry;
		let updatedPattern = `${entry.slice(0, wildcardIndex)}${uri.pathname}`;
		if (uri.search || uri.hash) {
			updatedPattern += "*";
		}
		return updatedPattern;
	};
	return Array.isArray(pattern) ? pattern.map(applyPath) : applyPath(pattern);
};"use strict";

// eslint-disable-next-line no-unused-vars
const setBadgeIcon = () => {
	chrome.action.setIcon({ path: options.autoCloseTab ? "images/auto_close_16.png" : "images/manual_close_16.png" });
	if (environment.isFirefox) browser.action.setBadgeTextColor({ color: "white" });
};

const setBadge = async (windowId, activeTabId) => {
	let nbDuplicateTabs = tabsInfo.getNbDuplicateTabs(windowId);
	if (nbDuplicateTabs === "0" && !options.showBadgeIfNoDuplicateTabs) nbDuplicateTabs = "";
	const backgroundColor = (nbDuplicateTabs !== "0") ? options.badgeColorDuplicateTabs : options.badgeColorNoDuplicateTabs;
	if (environment.isFirefox) {
		setWindowBadgeText(windowId, nbDuplicateTabs);
		setWindowBadgeBackgroundColor(windowId, backgroundColor);
	}
	else {
		// eslint-disable-next-line no-param-reassign
		activeTabId = activeTabId || await getActiveTabId(windowId);
		if (activeTabId) {
			setTabBadgeText(activeTabId, nbDuplicateTabs);
			setTabBadgeBackgroundColor(activeTabId, backgroundColor);
		}
	}
};

const getNbDuplicateTabs = (duplicateTabsGroups) => {
	let nbDuplicateTabs = 0;
	if (duplicateTabsGroups.size !== 0) {
		duplicateTabsGroups.forEach(duplicateTabs => (nbDuplicateTabs += duplicateTabs.size - 1));
	}
	return nbDuplicateTabs;
};

const updateBadgeValue = (nbDuplicateTabs, windowId) => {
	tabsInfo.setNbDuplicateTabs(windowId, nbDuplicateTabs);
	setBadge(windowId);
};

// eslint-disable-next-line no-unused-vars
const updateBadgesValue = async (duplicateTabsGroups, windowId) => {
	const nbDuplicateTabs = getNbDuplicateTabs(duplicateTabsGroups);
	if (options.searchInAllWindows) {
		const windows = await getWindows();
		windows.forEach(window => updateBadgeValue(nbDuplicateTabs, window.id));
	}
	else {
		updateBadgeValue(nbDuplicateTabs, windowId);
	}
};

// eslint-disable-next-line no-unused-vars
const updateBadgeStyle = async () => {
	const windows = await getWindows();
	windows.forEach(window => setBadge(window.id));
};"use strict";

const isUrlWhiteListed = (url) => {
    const matches = options.whiteList.filter(pattern => pattern.test(url));
    return matches.length !== 0;
};

const matchTitle = (tab1, tab2) => {
    if (options.compareWithTitle) {
        if ((isTabComplete(tab1) && isTabComplete(tab2)) && (tab1.title === tab2.title)) {
            return true;
        }
    }
    return false;
};

const getCloseInfo = (details) => {
    const observedTab = details.observedTab;
    const openedTab = details.openedTab;
    const activeWindowId = details.activeWindowId;
    const retainedTabId = determineRetainedTabId({
        observedTab: observedTab,
        observedTabUrl: details.observedTabUrl,
        candidateTab: openedTab,
        candidateUrl: openedTab.url,
        observedTabLastComplete: tabsInfo.getLastComplete(observedTab.id),
        candidateLastComplete: tabsInfo.getLastComplete(openedTab.id),
        activeWindowId: activeWindowId,
        keepPinnedTab: options.keepPinnedTab,
        keepTabWithHttps: options.keepTabWithHttps,
        keepNewerTab: options.keepNewerTab
    });
    if (retainedTabId === observedTab.id) {
        const keepInfo = {
            observedTabClosed: false,
            active: openedTab.active,
            tabIndex: openedTab.index,
            tabId: observedTab.id,
            windowId: observedTab.windowId
        };
        return [openedTab.id, keepInfo];
    } else {
        const keepInfo = {
            observedTabClosed: true,
            active: observedTab.active,
            tabIndex: observedTab.index,
            tabId: openedTab.id,
            windowId: openedTab.windowId
        };
        return [observedTab.id, keepInfo];
    }
};

// eslint-disable-next-line no-unused-vars
const searchForDuplicateTabsToClose = async (observedTab, queryComplete, loadingUrl) => {
    const observedTabUrl = loadingUrl || observedTab.url;
    const observedWindowsId = observedTab.windowId;
    if (isUrlWhiteListed(observedTabUrl)) {
        if (isTabComplete(observedTab)) refreshDuplicateTabsInfo(observedWindowsId);
        return;
    }
    const queryInfo = {};
    queryInfo.status = queryComplete ? "complete" : null;
    queryInfo.url = getMatchPatternURL(observedTabUrl);
    queryInfo.windowId = options.searchInAllWindows ? null : observedWindowsId;
    if (environment.isFirefox) queryInfo.cookieStoreId = options.searchPerContainer ? observedTab.cookieStoreId : null;
    const openedTabs = await getTabs(queryInfo);
    if (openedTabs.length > 1) {
        const matchingObservedTabUrl = getMatchingURL(observedTabUrl);
        let match = false;
        for (const openedTab of openedTabs) {
            if ((openedTab.id === observedTab.id) || tabsInfo.isIgnoredTab(openedTab.id) || (isBlankURL(openedTab.url) && !isTabComplete(openedTab))) continue;
            if ((getMatchingURL(openedTab.url) === matchingObservedTabUrl) || matchTitle(openedTab, observedTab)) {
                match = true;
                const [tabToCloseId, remainingTabInfo] = getCloseInfo({ observedTab: observedTab, observedTabUrl: observedTabUrl, openedTab: openedTab });
                closeDuplicateTab(tabToCloseId, remainingTabInfo);
                if (remainingTabInfo.observedTabClosed) break;
            }
        }
        if (!match) {
            if (tabsInfo.hasDuplicateTabs(observedWindowsId)) refreshDuplicateTabsInfo(observedWindowsId);
            else if (environment.isChrome && observedTab.active) setBadge(observedTab.windowId, observedTab.id);
        }
    }
};

const closeDuplicateTab = async (tabToCloseId, remainingTabInfo) => {
    try {
        tabsInfo.ignoreTab(tabToCloseId, true);
        await removeTab(tabToCloseId);
    }
    catch (ex) {
        tabsInfo.ignoreTab(tabToCloseId, false);
        return;
    }
    if (tabsInfo.hasTab(tabToCloseId)) {
        await wait(10);
        if (tabsInfo.hasTab(tabToCloseId)) {
            tabsInfo.ignoreTab(tabToCloseId, false);
            refreshDuplicateTabsInfo(remainingTabInfo.windowId);
            return;
        }
    }
    handleRemainingTab(remainingTabInfo.windowId, remainingTabInfo);
};

const _handleRemainingTab = async (details) => {
    if (!tabsInfo.hasTab(details.tabId)) return;
    if (options.defaultTabBehavior && details.observedTabClosed) {
        if (details.tabIndex > 0) moveTab(details.tabId, { index: details.tabIndex });
        if (details.active) activateTab(details.tabId);
    } else if (options.activateKeptTab) {
        focusTab(details.tabId, details.windowId);
    }
};

const handleRemainingTab = debounce(_handleRemainingTab, 500);

const handleObservedTab = (details) => {
    const observedTab = details.tab;
    const retainedTabs = details.retainedTabs;
    const duplicateTabsGroups = details.duplicateTabsGroups;
    let matchingTabURL = getMatchingURL(observedTab.url);
    let matchingTabTitle = options.compareWithTitle && isTabComplete(observedTab) ? `title=${observedTab.title}` : null;
    if (options.searchPerContainer) {
        matchingTabURL += observedTab.cookieStoreId;
        if (matchingTabTitle) matchingTabTitle += observedTab.cookieStoreId;
    }
    let matchingKey = matchingTabURL;
    let retainedTab = retainedTabs.get(matchingKey);
    if (!retainedTab) {
        if (isTabComplete(observedTab)) retainedTabs.set(matchingKey, observedTab);
        if (matchingTabTitle) {
            matchingKey = matchingTabTitle;
            retainedTab = retainedTabs.get(matchingKey);
            if (!retainedTab) {
                retainedTabs.set(matchingKey, observedTab);
            }
        }
    }
    if (retainedTab) {
        if (details.closeTab) {
            const [tabToCloseId] = getCloseInfo({ observedTab: observedTab, openedTab: retainedTab, activeWindowId: details.activeWindowId });
            if (tabToCloseId === observedTab.id) {
                chrome.tabs.remove(observedTab.id);
            }
            else {
                chrome.tabs.remove(retainedTab.id);
                retainedTabs.set(matchingKey, observedTab);
            }
        } else {
            const tabs = duplicateTabsGroups.get(matchingKey) || new Set([retainedTab]);
            tabs.add(observedTab);
            duplicateTabsGroups.set(matchingKey, tabs);
        }
    }
};

// eslint-disable-next-line no-unused-vars
const searchForDuplicateTabs = async (windowId, closeTabs) => {
    const queryInfo = { windowType: "normal" };
    if (!options.searchInAllWindows) queryInfo.windowId = windowId;
    const [activeWindowId, openedTabs] = await Promise.all([getActiveWindowId(), getTabs(queryInfo)]);
    const duplicateTabsGroups = new Map();
    const retainedTabs = new Map();
    for (const openedTab of openedTabs) {
        if ((isBlankURL(openedTab.url) && !isTabComplete(openedTab)) || tabsInfo.isIgnoredTab(openedTab.id)) continue;
        const details = {
            tab: openedTab,
            retainedTabs: retainedTabs,
            activeWindowId: activeWindowId,
            closeTab: closeTabs,
            duplicateTabsGroups: duplicateTabsGroups
        };
        handleObservedTab(details);
    }
    if (!closeTabs) {
        return {
            duplicateTabsGroups: duplicateTabsGroups,
            activeWindowId: activeWindowId
        };
    }
};

// eslint-disable-next-line no-unused-vars
const closeDuplicateTabs = (windowId) => searchForDuplicateTabs(windowId, true);

const setDuplicateTabPanel = async (duplicateTab, duplicateTabs) => {
    let containerColor = "";
    if (environment.isFirefox && (!duplicateTab.incognito && duplicateTab.cookieStoreId !== "firefox-default")) {
        const getContext = await browser.contextualIdentities.get(duplicateTab.cookieStoreId);
        if (getContext) containerColor = getContext.color;
    }
    duplicateTabs.add({
        id: duplicateTab.id,
        url: duplicateTab.url,
        title: duplicateTab.title || duplicateTab.url,
        windowId: duplicateTab.windowId,
        containerColor: containerColor,
        icon: duplicateTab.favIconUrl || "../images/default-favicon.png"
    });
};

const getDuplicateTabsForPanel = async (duplicateTabsGroups) => {
    if (duplicateTabsGroups.size === 0) return null;
    const duplicateTabsPanel = new Set();
    for (const tabsGroup of duplicateTabsGroups) {
        const duplicateTabs = tabsGroup[1];
        await Promise.all(Array.from(duplicateTabs, duplicateTab => setDuplicateTabPanel(duplicateTab, duplicateTabsPanel)));
    }
    return Array.from(duplicateTabsPanel);
};

// eslint-disable-next-line no-unused-vars
const requestDuplicateTabsFromPanel = async (windowId) => {
    const searchResult = await searchForDuplicateTabs(windowId, false);
    sendDuplicateTabs(searchResult.duplicateTabsGroups);
};

const sendDuplicateTabs = async (duplicateTabsGroups) => {
    const duplicateTabs = await getDuplicateTabsForPanel(duplicateTabsGroups);
    chrome.runtime.sendMessage({
        action: "updateDuplicateTabsTable",
        data: { "duplicateTabs": duplicateTabs }
    });
};

const _refreshDuplicateTabsInfo = async (windowId) => {
    const searchResult = await searchForDuplicateTabs(windowId, false);
    updateBadgesValue(searchResult.duplicateTabsGroups, windowId);
    if (isPanelOptionOpen() && (options.searchInAllWindows || (windowId === searchResult.activeWindowId))) {
        sendDuplicateTabs(searchResult.duplicateTabsGroups);
    }
};

const refreshDuplicateTabsInfo = debounce(_refreshDuplicateTabsInfo, 300);

// eslint-disable-next-line no-unused-vars
const refreshGlobalDuplicateTabsInfo = async () => {
    if (options.searchInAllWindows) {
        refreshDuplicateTabsInfo();
    } else {
        const windows = await getWindows();
        windows.forEach(window => refreshDuplicateTabsInfo(window.id));
    }
};"use strict";

const handleMessage = (message, sender, response) => {
    switch (message.action) {
        case "setStoredOption": {
            setStoredOption(message.data.name, message.data.value, message.data.refresh);
            break;
        }
        case "getStoredOptions": {
            getStoredOptions().then(storedOptions => response({ data: storedOptions }));
            return true;
        }
        case "getDuplicateTabs": {
            requestDuplicateTabsFromPanel(message.data.windowId);
            break;
        }
        case "closeDuplicateTabs": {
            closeDuplicateTabs(message.data.windowId);
            break;
        }
    }
};

chrome.runtime.onMessage.addListener(handleMessage);"use strict";

const onCreatedTab = (tab) => {
	tabsInfo.setNewTab(tab.id);
	if (tab.status === "complete" && !isBlankURL(tab.url)) {
		options.autoCloseTab ? searchForDuplicateTabsToClose(tab, true) : refreshDuplicateTabsInfo(tab.windowId);
	}
};

const onBeforeNavigate = async (details) => {
	if (options.autoCloseTab && (details.frameId == 0) && (details.tabId !== -1) && !isBlankURL(details.url)) {
		if (tabsInfo.isIgnoredTab(details.tabId)) return;
		const tab = await getTab(details.tabId);
		if (tab) {
			tabsInfo.resetTab(tab.id);
			searchForDuplicateTabsToClose(tab, true, details.url);
		}
	}
};

const onCompletedTab = async (details) => {
	if ((details.frameId == 0) && (details.tabId !== -1)) {
		if (tabsInfo.isIgnoredTab(details.tabId)) return;
		const tab = await getTab(details.tabId);
		if (tab) {
			tabsInfo.updateTab(tab);
			options.autoCloseTab ? searchForDuplicateTabsToClose(tab) : refreshDuplicateTabsInfo(tab.windowId);
		}
	}
};

const onUpdatedTab = (tabId, changeInfo, tab) => {
	if (tabsInfo.isIgnoredTab(tabId)) return;
	if (Object.prototype.hasOwnProperty.call(changeInfo, "status") && changeInfo.status === "complete") {
		if (Object.prototype.hasOwnProperty.call(changeInfo, "url") && (changeInfo.url !== tab.url)) {
			if (isBlankURL(tab.url) || !tab.favIconUrl || !tabsInfo.hasUrlChanged(tab)) return;
			tabsInfo.updateTab(tab);
			options.autoCloseTab ? searchForDuplicateTabsToClose(tab) : refreshDuplicateTabsInfo(tab.windowId);
		}
		else if (isChromeURL(tab.url)) {
			tabsInfo.updateTab(tab);
			options.autoCloseTab ? searchForDuplicateTabsToClose(tab) : refreshDuplicateTabsInfo(tab.windowId);
		}
	}
};

const onAttached = async (tabId) => {
	const tab = await getTab(tabId);
	if (tab) {
		options.autoCloseTab ? searchForDuplicateTabsToClose(tab) : refreshDuplicateTabsInfo(tab.windowId);
	}
};

const onRemovedTab = (removedTabId, removeInfo) => {
	tabsInfo.removeTab(removedTabId);
	if (removeInfo.isWindowClosing) {
		if (options.searchInAllWindows && tabsInfo.hasDuplicateTabs(removeInfo.windowId)) refreshDuplicateTabsInfo();
		tabsInfo.clearDuplicateTabsInfo(removeInfo.windowId);
	}
	else if (tabsInfo.hasDuplicateTabs(removeInfo.windowId)) {
		refreshDuplicateTabsInfo(removeInfo.windowId);
	}
};

const onDetachedTab = (detachedTabId, detachInfo) => {
	if (tabsInfo.hasDuplicateTabs(detachInfo.oldWindowId)) refreshDuplicateTabsInfo(detachInfo.oldWindowId);
};

const onActivatedTab = (activeInfo) => {
	// for Chrome only
	if (tabsInfo.isIgnoredTab(activeInfo.tabId)) return;
	setBadge(activeInfo.windowId, activeInfo.tabId);
};

const start = async () => {
        // eslint-disable-next-line no-unused-vars
        await initializeOptions();
        setBadgeIcon();
        await refreshGlobalDuplicateTabsInfo();
        chrome.tabs.onCreated.addListener(onCreatedTab);
        chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigate);
        chrome.tabs.onAttached.addListener(onAttached);
        chrome.tabs.onDetached.addListener(onDetachedTab);
        chrome.tabs.onUpdated.addListener(onUpdatedTab);
        chrome.webNavigation.onCompleted.addListener(onCompletedTab);
        chrome.tabs.onRemoved.addListener(onRemovedTab);
        if (!environment.isFirefox) chrome.tabs.onActivated.addListener(onActivatedTab);
};

start();
