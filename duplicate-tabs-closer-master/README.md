# deDup2Activate


deDup2Activate detects and closes duplicate tabs.

* Use the WebExtensions API
* Support [Firefox](https://addons.mozilla.org/en-US/firefox/addon/duplicate-tabs-closer) and [Chrome](https://chrome.google.com/webstore/detail/duplicate-tabs-closer/gnmdbogfankgjepgglmmfmbnimcmcjle)
* Firefox Container Tab feature is supported.

## Options:

### On duplicate tab detected:

* **Close tab automatically** *(default)*: automatically closes the detected duplicate tab.
* **Do nothing**: monitor tabs and update the badge icon to indicate the number of duplicate tabs detected.

#### On remaining tab:
(Used with option *Close tab automatically*)
* **Activate** *(default)*: once the duplicate tab is closed, the remaining tab is activated.
* **Do nothing**: nothing is done after the duplicate tab is closed.
* **Apply opening tab behavior**: once the duplicate tab is closed, depending on the default tab behavior, the remaining tab will be moved to the position of the closed tab and activated if needed.

#### Whiltelist":
(Used with option *Close tab automatically*)  
List of urls to not close automatically. Duplicate tabs skipped will be notified in badge.  
Wildcards and RegExp are supported.


### Priority:
(Used with option *Close tab automatically* and *Close all duplicate tabs* button)  
* **Keep older tab** *(default)*: Keep the already existing tab.
* **Keep newer tab**: Keep the newer tab.
* **Keep tab with https** *(default on)*: Ignore the scheme part during comparison and keep the tab with the https scheme.
* **Keep pinned tab** *(default on)*: Keep the pinned tab.


### matchingRules:

* **Ignore case in URL** *(default on)*
* **Ignore 'www' in URL domain name** *(default on)*
* **Ignore hash part in URL** *(default off)*
* **Ignore search part in URL** *(default off)*
* **Ignore path part in URL** *(default off)*
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


