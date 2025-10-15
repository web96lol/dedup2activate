# deDup2Activate


deDup2Activate detects and closes duplicate tabs.

* Use the WebExtensions API
* Support [Firefox](https://addons.mozilla.org/en-US/firefox/addon/duplicate-tabs-closer) and [Chrome](https://chrome.google.com/webstore/detail/duplicate-tabs-closer/gnmdbogfankgjepgglmmfmbnimcmcjle)
* Firefox Container Tab feature is supported.

## Options:

### Automatic duplicate handling

Duplicate tabs are always closed automatically. Use the whitelist to keep specific URLs open. Wildcards and RegExp are supported, and skipped duplicates are still reflected in the badge count.


### Duplicate resolution behavior
(Used when the extension closes duplicates automatically or when you use the *Close all duplicate tabs* button)
The extension always keeps pinned tabs, prefers the HTTPS version of a page, and retains the older tab when deciding which duplicate to close. These rules are now built-in and no longer configurable.


### matchingRules:

URL comparisons always normalize links by forcing HTTPS, ignoring a leading `www`, comparing in lowercase, and keeping the full path, search, and hash segments. The remaining optional rule is:
* **Compare with tab title** *(default off)*


### Scope:

* **Container in active window<**: only closes/displays duplicate tabs that belong to a same container in the active window.
* **Container in all windows**: only closes/displays duplicate tabs that belong to a same container in all windows.
* **Active window** *(default)*: only closes/displays duplicate tabs that belong to a same window.
* **All window**: closes/displays duplicate tabs for all windows.


### Customization:
(only accessible from the *page Options* - opened from extension popup panel by clicking on top right icon or by opening the Extensions panel and select extension's options )

* **Duplicate tabs badge color** *(default `#df73ff`)*: Set the badge color for duplicate tabs
* **No duplicate tab badge color** *(default `#1e90ff`)*: Set the badge color for no duplicate tabs
* **Show badge if no duplicate tab** *(default off)*: Show badge with value `0` if no duplicate tab


