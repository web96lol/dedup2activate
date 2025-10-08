# Background Bundle Verification

This document records the verification performed to ensure that `background.js`
initially provided the exact same behaviour as the previous individual background
scripts when the bundle was introduced. Subsequent feature changes (such as the
removal of reload and keyboard shortcut handling) intentionally diverge from the
archived comparison below.

## Method

The bundle was compared against a plain concatenation of the original source files
(`tabsInfo.js`, `options.js`, `urlUtils.js`, `badge.js`, `worker.js`,
`messageListener.js`, and `background.js`) from the previous commit.

```
(
  git show HEAD^:duplicate-tabs-closer-master/tabsInfo.js
  git show HEAD^:duplicate-tabs-closer-master/options.js
  git show HEAD^:duplicate-tabs-closer-master/urlUtils.js
  git show HEAD^:duplicate-tabs-closer-master/badge.js
  git show HEAD^:duplicate-tabs-closer-master/worker.js
  git show HEAD^:duplicate-tabs-closer-master/messageListener.js
  git show HEAD^:duplicate-tabs-closer-master/background.js
) > /tmp/oldbundle.js

diff -u /tmp/oldbundle.js duplicate-tabs-closer-master/background.js
```

The diff showed no differences other than the missing trailing newline at the end
of the bundle file, confirming that the bundle executes the same code in the same
order as before.
