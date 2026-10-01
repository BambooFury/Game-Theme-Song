# Changelog

## [2.0.1](https://github.com/BambooFury/Game-Theme-Song/compare/v2.0.0...v2.0.1) (2026-10-01)


### Maintenance

* build with node and starlight instead of bun ([b285e69](https://github.com/BambooFury/Game-Theme-Song/commit/b285e69c03f55ab8bc141e4a23a8465df9ed8795))
* merge release 2.0.0 into next ([8f6602a](https://github.com/BambooFury/Game-Theme-Song/commit/8f6602a250981d1f226049289f69324128b91bbb))

## [2.0.0](https://github.com/BambooFury/Game-Theme-Song/compare/v1.6.4...v2.0.0) (2026-10-01)


### Features

* add game page note button and popup with now-playing and settings tabs ([f37d19a](https://github.com/BambooFury/Game-Theme-Song/commit/f37d19a4958354e8645dc59777d03f1e6b204ce1))
* add plugin.json for plugin database and auto version bumps ([76afea1](https://github.com/BambooFury/Game-Theme-Song/commit/76afea16e0b3396bbb546cf518b749ffc1dcc35c))
* embed library and cache as tabs with react-icons ([62fe391](https://github.com/BambooFury/Game-Theme-Song/commit/62fe391be413959d1a5cc31b2249abb77c1071a0))
* export context state from engine, add react-icons ([8893563](https://github.com/BambooFury/Game-Theme-Song/commit/88935631ce83d7b4c4672a436e545ef82298794e))
* improve track matching with phrase scoring, quality threshold and khinsider browser headers ([245a851](https://github.com/BambooFury/Game-Theme-Song/commit/245a851a5e441acf7390b9927b377f0548b24643))
* inject game page music button via native steam js patch ([2f1cc68](https://github.com/BambooFury/Game-Theme-Song/commit/2f1cc68aa67d52be06c5187d30143ac56b083c0d))
* live refresh downloaded music list and counts ([28c9c07](https://github.com/BambooFury/Game-Theme-Song/commit/28c9c07610e3506cc439ffd3460833e2309354cd))
* persist custom music in backup folder and restore it on install ([f28e83c](https://github.com/BambooFury/Game-Theme-Song/commit/f28e83c7125d4df9ba78f8aa91612e1970362729))
* real-time cache and custom music count updates ([84dd740](https://github.com/BambooFury/Game-Theme-Song/commit/84dd740cf49be088fca00f00e9583e21a73fb086))
* redesign custom music section with icon header and empty states ([6de66ea](https://github.com/BambooFury/Game-Theme-Song/commit/6de66ea3de0d97c599434dbd44373ab7a818a86c))
* redesign no-game empty state with centered icon ([15c6fa3](https://github.com/BambooFury/Game-Theme-Song/commit/15c6fa39037cf429b23cd24be44e874bb8a7f733))
* remove plugin settings entry, open popup only from game page button ([ffefa75](https://github.com/BambooFury/Game-Theme-Song/commit/ffefa757e3e7459b27dbb23fa55b81ca8bf311e0))
* scale phrase penalty by word coverage and add search again button ([a1ceda9](https://github.com/BambooFury/Game-Theme-Song/commit/a1ceda96aa9aeb75ed9ad013e04f1716bc0596c6))
* show checkmark after keeping song, use react-icons everywhere ([adbb6fa](https://github.com/BambooFury/Game-Theme-Song/commit/adbb6fa73683722967c232d4a3c10169398dbc37))


### Bug Fixes

* apply dark theme to popup on open ([2e34486](https://github.com/BambooFury/Game-Theme-Song/commit/2e3448672e4039ab0fd8a56da9185e5aaf9133a0))
* compact tabs, searching state, min window size, row layout ([dc01b31](https://github.com/BambooFury/Game-Theme-Song/commit/dc01b3152f9824a524284a03f73c5db4d10cf11b))
* handle object returns from v2 ffi in custom music upload ([215593e](https://github.com/BambooFury/Game-Theme-Song/commit/215593e1499c47e380f5fc9a428573895a4169f1))
* keep music playing when main popup is open ([8dc3e8e](https://github.com/BambooFury/Game-Theme-Song/commit/8dc3e8e2abbc241231e15b8c48e941e9281136e0))
* move state files to persistent data directory ([eace5f9](https://github.com/BambooFury/Game-Theme-Song/commit/eace5f988e67e7a8ee5b8bc3b5ca7627acc4c6ed))
* patch replacement syntax and remove diagnostics ([a6b005e](https://github.com/BambooFury/Game-Theme-Song/commit/a6b005ec64602d91b829b9090cc64a84da2b6623))
* place music button after last existing button ([3e0fd7e](https://github.com/BambooFury/Game-Theme-Song/commit/3e0fd7e6f9838be5a8aae6ea8abc2feb129c8f58))
* reduce game page button injection delay from 10s to polling ([8be393b](https://github.com/BambooFury/Game-Theme-Song/commit/8be393b6480c94b5bf5f20cda92ae0271c4184b5))
* remove icon header from custom music section ([64c9ac8](https://github.com/BambooFury/Game-Theme-Song/commit/64c9ac8c9fd0331527837607bcbde8737f9ec7b8))
* resolve TypeScript errors across frontend ([a8af360](https://github.com/BambooFury/Game-Theme-Song/commit/a8af360397aebe9fadd14da2009048fe14a780eb))
* restore button styling and event-driven injection ([4f0590c](https://github.com/BambooFury/Game-Theme-Song/commit/4f0590c71ba91def4f69b29b1cc6e44f50e80827))
* reuse existing desktop window for button injection ([e069663](https://github.com/BambooFury/Game-Theme-Song/commit/e0696635006b9dd4c67941f69a56894f4b746129))
* scoped tab hover styles via injected CSS ([b791655](https://github.com/BambooFury/Game-Theme-Song/commit/b79165529b686e30bb57bf8c59e6b3ae9be06328))
* sort games with custom music first in library list ([c799cf9](https://github.com/BambooFury/Game-Theme-Song/commit/c799cf9003666a792c1fb46ea965ba64cf7ff218))
* store full custom track title instead of one broken byte ([6403614](https://github.com/BambooFury/Game-Theme-Song/commit/640361485925ba422796c3eed8b10b975148fb3a))
* tab hover highlights single button and removes clipped border ([57b375d](https://github.com/BambooFury/Game-Theme-Song/commit/57b375d156808ac07b6f6b191c011d3848e21455))
* use AddWindowCreateHook for game page button injection ([6f7d668](https://github.com/BambooFury/Game-Theme-Song/commit/6f7d668cec48c8305b480f0adf993fb4e3527529))
* use DialogButton for clickable tabs with bigger spacing ([348f162](https://github.com/BambooFury/Game-Theme-Song/commit/348f162b448e82bfae6e3946d17b73e205325ffe))


### Documentation

* update readme for custom music backup, tabs and matching improvements ([3201119](https://github.com/BambooFury/Game-Theme-Song/commit/3201119ab3d2cde5683b768b24eb8f4d663805e7))


### Maintenance

* prepare release v2.0.0 ([aa28e4c](https://github.com/BambooFury/Game-Theme-Song/commit/aa28e4cd6efff14cdae78a114b1660d3a115ccc1))
* remove debug artifact ([3da2089](https://github.com/BambooFury/Game-Theme-Song/commit/3da2089da3b4e6337640c67c739b1106563d1560))
* remove debug artifact ([d58ae3b](https://github.com/BambooFury/Game-Theme-Song/commit/d58ae3bea11152bc93cb084af24c40068d4918eb))

## [1.6.4](https://github.com/BambooFury/Game-Theme-Song/compare/v1.6.3...v1.6.4) (2026-08-16)


### Refactoring

* use native Steam UI components for popups and controls ([31ed5d5](https://github.com/BambooFury/Game-Theme-Song/commit/31ed5d5200f7d6c057629b4be0a31d9b24d94ce4))
* use native Steam UI components for popups and controls ([1c143c2](https://github.com/BambooFury/Game-Theme-Song/commit/1c143c2e80c180fd3f05967e011a579543d7f46b))

## [1.6.3](https://github.com/BambooFury/Game-Theme-Song/compare/v1.6.2...v1.6.3) (2026-07-21)


### Maintenance

* pin typescript to v5 in ci builds ([5eab49e](https://github.com/BambooFury/Game-Theme-Song/commit/5eab49e806a3ff137e4d53a57f8a517e4039d8cf))
* pin typescript to v5 in ci builds ([9bd1801](https://github.com/BambooFury/Game-Theme-Song/commit/9bd1801a0d4ea8cbf45dcb2841bb82f6a3aedf83))

## [1.6.2](https://github.com/BambooFury/Game-Theme-Song/compare/v1.6.1...v1.6.2) (2026-07-21)


### Bug Fixes

* keep music playing on focus loss while a game runs with stop-on-launch off ([d34cdee](https://github.com/BambooFury/Game-Theme-Song/commit/d34cdee30d2324c2bbfe4a03958e8b266861fbef))
* pause theme song when Steam loses focus ([fafaea9](https://github.com/BambooFury/Game-Theme-Song/commit/fafaea92a09aa697c378ec46096092f67b861c4f))
* restore volume when Steam is refocused during fade-out ([125ace9](https://github.com/BambooFury/Game-Theme-Song/commit/125ace9237e3ad3b0f10b86bc00c6d5fd47a34e8))
* show game names in downloaded music list for apps not in library ([83dfebd](https://github.com/BambooFury/Game-Theme-Song/commit/83dfebd371822b18c77ebc7cf40560523fe85945))
* show software apps in custom music library so they can be ignored ([#41](https://github.com/BambooFury/Game-Theme-Song/issues/41)) ([284c208](https://github.com/BambooFury/Game-Theme-Song/commit/284c208ef58a93e7182e2a77671577f42e881a7b))
* valid app icon urls, real app types and backfill cached game names ([be30559](https://github.com/BambooFury/Game-Theme-Song/commit/be30559ac66f0f2fd0467b4ed320d4a58d232a8d))

## [1.6.1](https://github.com/BambooFury/Game-Theme-Song/compare/v1.6.0...v1.6.1) (2026-07-03)


### Maintenance

* remove the unnecessary file ([23b31f8](https://github.com/BambooFury/Game-Theme-Song/commit/23b31f8f67c2c7c3ef130a5971d8e4700638edb9))
* remove the unnecessary file ([f774d40](https://github.com/BambooFury/Game-Theme-Song/commit/f774d40246fc9f575915ca85ae0b267ca51a39c9))

## [1.6.0](https://github.com/BambooFury/Game-Theme-Song/compare/v1.5.0...v1.6.0) (2026-07-03)


### Features

* per-game ignore button in custom music library ([bc6b6f2](https://github.com/BambooFury/Game-Theme-Song/commit/bc6b6f2bb06e165562ae0377deff02188d5888ee))


### Bug Fixes

* disable LuaJIT to prevent EXCEPTION_ACCESS_VIOLATION crash in millennium.luavm64 ([e3defc1](https://github.com/BambooFury/Game-Theme-Song/commit/e3defc1ee7968245f0ca6b08d7eea6c0f76fda7e))


### Maintenance

* remove music icon from plugin settings entry ([398b737](https://github.com/BambooFury/Game-Theme-Song/commit/398b7377da8cc66b94d5c03b0b51743b88d00ed8))
* remove tooltip from mute button ([a3041e1](https://github.com/BambooFury/Game-Theme-Song/commit/a3041e1efaeb8066c281e22fe59ebfde39f72d2c))

## [1.5.0](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.8...v1.5.0) (2026-07-03)


### Features

* keep downloaded songs only after confirming with the check button ([5918c9c](https://github.com/BambooFury/Game-Theme-Song/commit/5918c9c37a1270c15a7b57d13ba0dab523b99662))


### Bug Fixes

* allow searching another song when a cached theme plays ([ffc17a9](https://github.com/BambooFury/Game-Theme-Song/commit/ffc17a9152e3a79fc9c3d3b4a2f31a90d184e90e))
* clean up reroll slot files when invalidating or clearing cache ([c7e5029](https://github.com/BambooFury/Game-Theme-Song/commit/c7e5029b033974345953b3ac2460331bc7b0325e))
* do not reset cache counter when backend is busy ([1f31167](https://github.com/BambooFury/Game-Theme-Song/commit/1f3116724bcfd1e4ad29b04e1e45f8701851ff4e))
* don't start theme music when a game is launched from desktop ([f603af6](https://github.com/BambooFury/Game-Theme-Song/commit/f603af6211add0c2226d91ba747a442782fb6ab5))
* enable confirm-before-download by default ([417c295](https://github.com/BambooFury/Game-Theme-Song/commit/417c295c58502348cc43ebf30493e61f53aefa76))
* hide search toast when a custom track is playing ([9c1e988](https://github.com/BambooFury/Game-Theme-Song/commit/9c1e988c440167bf79df48e465f06cbc4ad0031c))
* hide unconfirmed pending track from Downloaded music window ([a4cc4b3](https://github.com/BambooFury/Game-Theme-Song/commit/a4cc4b37720c63bcc42534b2f1fcdb5a2cd5cc6d))
* keep custom music modal open while native file picker is active ([94db565](https://github.com/BambooFury/Game-Theme-Song/commit/94db56526ffbf6380501b4d2cf6dcab846173616))
* mark rerolled track as pending so it is discarded without confirmation ([03c263b](https://github.com/BambooFury/Game-Theme-Song/commit/03c263b08123c2399cee3df2511332c9f93a3b88))
* recognize M4A and WebM signatures in audio validation ([832179c](https://github.com/BambooFury/Game-Theme-Song/commit/832179cb88695a9e7610aca262a12a22543fba72))
* remove empty header row from features table ([308260a](https://github.com/BambooFury/Game-Theme-Song/commit/308260ab388ba57e132c95ae99fc9d80111f7337))
* remove opposite slot file after successful reroll download ([c157bad](https://github.com/BambooFury/Game-Theme-Song/commit/c157bad4aa9358eaa9a7cc7d7b9d84705c158d6a))
* remove unused searchingShown variable that broke prod build ([89bfbdf](https://github.com/BambooFury/Game-Theme-Song/commit/89bfbdfccf137c7bfb1c20efcdd94989d237a3d8))
* replace features markdown table with HTML to remove empty header row ([7c781ad](https://github.com/BambooFury/Game-Theme-Song/commit/7c781ad8a451f33f1d31b8e837382f0ee68cb222))
* restore cache lookup lost when adding not_found TTL ([b99e4b0](https://github.com/BambooFury/Game-Theme-Song/commit/b99e4b0199a4b775fabe8a742497514cae32b435))
* retry theme resolution when backend is busy ([15a7125](https://github.com/BambooFury/Game-Theme-Song/commit/15a7125e665a8d1ab93d60cab0ee0fe90ef325aa))
* the bug with game music caching. ([e160ca8](https://github.com/BambooFury/Game-Theme-Song/commit/e160ca87bfce2837fd066774ceab39b63b385a78))
* update Readme.md ([d26d7cc](https://github.com/BambooFury/Game-Theme-Song/commit/d26d7ccf48259f50dcbbdcb5d3186c34f43943be))
* write state files atomically to prevent corruption ([ecedd43](https://github.com/BambooFury/Game-Theme-Song/commit/ecedd43abe2b0004210a7919cb2a21f1f9838754))


### Performance

* cache failed theme lookups to avoid repeated searches ([ea25723](https://github.com/BambooFury/Game-Theme-Song/commit/ea25723e80df3664cab7162248e7fa381c1bbea7))
* eliminate double JSON sanitization and redundant string copies ([77dc9c2](https://github.com/BambooFury/Game-Theme-Song/commit/77dc9c2bb250d054191226d1223d426fa7e55244))
* force full GC after heavy operations and tune GC aggressiveness ([e4a2197](https://github.com/BambooFury/Game-Theme-Song/commit/e4a219775e8a4ba8e0cc35167c2aa7f6e5b04caf))
* read cache sizes with a single directory listing ([0f12413](https://github.com/BambooFury/Game-Theme-Song/commit/0f12413e0fe7d69c24c07bebf151e4b98260416c))
* rewrite to_valid_utf8 with zero-alloc fast path for valid strings ([1294558](https://github.com/BambooFury/Game-Theme-Song/commit/12945585bd78cc923be33718e0114736249f72ef))
* use index cursor instead of table.remove in directory scan ([c629820](https://github.com/BambooFury/Game-Theme-Song/commit/c62982006b7603286c24357e5868bcdd86559189))
* use larger chunks for custom music upload ([7c994f1](https://github.com/BambooFury/Game-Theme-Song/commit/7c994f1e4dc8be44338782d6ce8c5c5482d7bf92))


### Refactoring

* migrate settings to native Millennium UI components ([5a4a333](https://github.com/BambooFury/Game-Theme-Song/commit/5a4a3339971588e4a180af7558f22a878f57ca01))
* migrate settings to native Millennium UI components ([14ab318](https://github.com/BambooFury/Game-Theme-Song/commit/14ab318d9eeead875a5292699ac6a80a298e0f63))
* use native Steam modals for library and cache windows ([6328db7](https://github.com/BambooFury/Game-Theme-Song/commit/6328db7026d163bbed61c7654f52c68e8477fe9e))


### Maintenance

* remove duplicated lines in store_custom and clear_custom_music ([a088cc3](https://github.com/BambooFury/Game-Theme-Song/commit/a088cc327501bf4ffbcd270669d1b2bcdc71a249))

## [1.4.8](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.7...v1.4.8) (2026-06-16)


### Bug Fixes

* add package.json to release-please extra-files ([485cba7](https://github.com/BambooFury/Game-Theme-Song/commit/485cba70b643ba6e7a42ab15f0f76d1b36c69271))
* defer audio stop until navigation debounce settles ([66336bc](https://github.com/BambooFury/Game-Theme-Song/commit/66336bc3ad1d30c0f5e7a08c9cbeffa92951dd84))
* drop unused tag parameter from JSON safe helpers ([707a5f3](https://github.com/BambooFury/Game-Theme-Song/commit/707a5f328a6af035112901025ba027cc10e2d357))
* log frontend messages instead of silently dropping them ([248ad9e](https://github.com/BambooFury/Game-Theme-Song/commit/248ad9ecc0f7e968e065e8793414ca9c5e54d0fc))
* log frontend messages instead of silently dropping them ([cbefec7](https://github.com/BambooFury/Game-Theme-Song/commit/cbefec7dd7ddebc10c1eaf3705fa14225b05a5e6))
* reject truncated audio downloads below minimum size ([a36e30d](https://github.com/BambooFury/Game-Theme-Song/commit/a36e30d3d9cf7ca61932f27ab4ada6107b310403))
* remove unused legacy worker marker write from cleanup ([ca22055](https://github.com/BambooFury/Game-Theme-Song/commit/ca220554512b637f99344efb2e7d6b36ea455456))
* remove unused log_frontend backend handler ([0557ffd](https://github.com/BambooFury/Game-Theme-Song/commit/0557ffd7e923b8bf32597b23e23d1372294189ad))
* reset in-memory caches in clear_cache_for ([8a62e14](https://github.com/BambooFury/Game-Theme-Song/commit/8a62e1438bec0388c8124e9a2df036ddb886a6f1))
* reset in-memory lookups when audio cache is cleared ([59fb507](https://github.com/BambooFury/Game-Theme-Song/commit/59fb507f4bb0dd471fd34730ca1d669e32d09e99))
* stop probeUrl spam and unused reportError/logFrontend calls ([ae61b3b](https://github.com/BambooFury/Game-Theme-Song/commit/ae61b3bf79e00483027e97475f3949ba9cc02b3b))
* use customMapRef in onFilePicked to avoid stale closure ([ce1c225](https://github.com/BambooFury/Game-Theme-Song/commit/ce1c225902992f0c5fa2646737e8127b5c90305b))
* use exponential backoff when resolving game name ([e4791c1](https://github.com/BambooFury/Game-Theme-Song/commit/e4791c19571265400e5800ab0660cc2cff690367))

## [1.4.7](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.6...v1.4.7) (2026-06-16)


### Bug Fixes

* add boot grace window to avoid VM crash on startup ([a4a7552](https://github.com/BambooFury/Game-Theme-Song/commit/a4a7552d735451aaa93ae1d0073859ce78ebd04d))
* simplify Custom music & Downloaded music modals ([bed2d2b](https://github.com/BambooFury/Game-Theme-Song/commit/bed2d2bb1c698f60577a97bb9529cf215e2830ed))
* simplify Custom music & Downloaded music modals ([cf33fd2](https://github.com/BambooFury/Game-Theme-Song/commit/cf33fd2c64e63f960ea4e00419aa60788ad1e48f))

## [1.4.6](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.5...v1.4.6) (2026-06-14)


### Performance

* cache library/khinsider lookups and debounce reroll to stop VM crash ([d1708e8](https://github.com/BambooFury/Game-Theme-Song/commit/d1708e840f22edf1b671110de7ed09efb195f75c))

## [1.4.5](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.4...v1.4.5) (2026-06-14)


### Bug Fixes

* harden native boundaries and guard reentrancy to stop VM crash ([c32b4ac](https://github.com/BambooFury/Game-Theme-Song/commit/c32b4acc11c8b9ba8a8d35585b4fd6cd9523372a))
* harden native boundaries and guard reentrancy to stop VM crash ([44ccda8](https://github.com/BambooFury/Game-Theme-Song/commit/44ccda82abeb0a155f16fc74a3f51529f9635b35))

## [1.4.4](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.3...v1.4.4) (2026-06-14)


### Bug Fixes

* harden native boundaries to prevent Lua VM crash ([8a1161d](https://github.com/BambooFury/Game-Theme-Song/commit/8a1161d7d560cb07bd8962105713f868a7adfac8))
* refresh welcome modal and re-show ([0114643](https://github.com/BambooFury/Game-Theme-Song/commit/0114643a8bd8dd5d69b2c212aa8cea6c3d25f73b))
* show cover art for non-Steam library entries ([ac061a2](https://github.com/BambooFury/Game-Theme-Song/commit/ac061a2cf79134f83bf98caf6843825bdfb54693))
* show cover art for non-Steam library entries ([9dc6e36](https://github.com/BambooFury/Game-Theme-Song/commit/9dc6e366e0acbf94ebbf50aa8867c45be268e0da))

## [1.4.3](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.2...v1.4.3) (2026-06-14)


### Bug Fixes

* sanitize invalid UTF-8 before json.decode to prevent crash ([baf639c](https://github.com/BambooFury/Game-Theme-Song/commit/baf639c9719e3cb4f92c8aa7fcac4f9fbbb52760))
* sanitize invalid UTF-8 before json.decode to prevent crash ([fb31bb8](https://github.com/BambooFury/Game-Theme-Song/commit/fb31bb8c63a11139838429b3db01040d8a2087b1))

## [1.4.2](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.1...v1.4.2) (2026-06-13)


### Bug Fixes

* harden JSON/HTTP boundary and reduce GC pressure to mitigate Mil… ([702ade7](https://github.com/BambooFury/Game-Theme-Song/commit/702ade72846b7637473308d3be734b7379e069e3))
* harden JSON/HTTP boundary and reduce GC pressure to mitigate Millennium VM crash ([5fe15e1](https://github.com/BambooFury/Game-Theme-Song/commit/5fe15e16416b72e475e6e30b19e07e9f9e60e156))

## [1.4.1](https://github.com/BambooFury/Game-Theme-Song/compare/v1.4.0...v1.4.1) (2026-06-13)


### Bug Fixes

* add search to downloaded music window ([ec65b56](https://github.com/BambooFury/Game-Theme-Song/commit/ec65b568c86823d69fcfa1a497449ff17e9eed82))
* allow editing music volume by typing the number ([1381f0e](https://github.com/BambooFury/Game-Theme-Song/commit/1381f0eeff7f92d1ef8f2468c9b023342433772c))
* **backend:** guard native json.decode against malformed responses + log decode source ([4f4cc08](https://github.com/BambooFury/Game-Theme-Song/commit/4f4cc0817562fa0df88957e595db02f19bdfe7f4))

## [1.4.0](https://github.com/BambooFury/Game-Theme-Song/compare/v1.3.0...v1.4.0) (2026-06-13)


### Features

* **search-toast:** reroll controls with native arg-order fix ([9f7976b](https://github.com/BambooFury/Game-Theme-Song/commit/9f7976bd61cf6255cc661a28e128529a2a35af4f))
* **settings:** manual song search toggle for classic/new modes ([0894639](https://github.com/BambooFury/Game-Theme-Song/commit/08946395cb702fa006d59c518e1df6c5a8bc07c8))


### Bug Fixes

* avoid audio click on first song change ([f667734](https://github.com/BambooFury/Game-Theme-Song/commit/f667734cf5d1440bc08f3273748c8e3c4168be5b))


### Refactoring

* drop dead code (get_icon_data_uri, single-shot set_custom_music) ([9e5e51e](https://github.com/BambooFury/Game-Theme-Song/commit/9e5e51eede95d2c3acd4685322c6308d72e5c510))
* split frontend settings UI into core and settings modules ([82daa6c](https://github.com/BambooFury/Game-Theme-Song/commit/82daa6cfd6e3bf68561a47b607ef6161a436170e))
* split frontend settings UI into core and settings modules ([639249c](https://github.com/BambooFury/Game-Theme-Song/commit/639249ccda9d0d5bffe20114cd37dbf95e736530))


### Maintenance

* **ui:** remove native title tooltips from buttons ([99d7ec3](https://github.com/BambooFury/Game-Theme-Song/commit/99d7ec341e91b79a9ef2bc862b7b23c21c9bf550))

## [1.3.0](https://github.com/BambooFury/Game-Theme-Song/compare/v1.2.1...v1.3.0) (2026-06-13)


### Features

* manage downloaded music per game with delete ([5836cf9](https://github.com/BambooFury/Game-Theme-Song/commit/5836cf9b8dbec66371a196cc7d1a474d1e55be85))
* song length limit in 5s steps with typeable input ([3330046](https://github.com/BambooFury/Game-Theme-Song/commit/3330046b4f5ade884fec65acdeba11b30ca78a8e))
* song length limit in 5s steps with typeable input ([52ac7b0](https://github.com/BambooFury/Game-Theme-Song/commit/52ac7b0d4180b5f11c74d7bbaa14f72e9f07aea3))

## [1.2.1](https://github.com/BambooFury/Game-Theme-Song/compare/v1.2.0...v1.2.1) (2026-06-13)


### Performance

* opaque library overlay to fix fps drop during playback ([86f6025](https://github.com/BambooFury/Game-Theme-Song/commit/86f60252c51287572ad5366030996854850aae64))


### Documentation

* document all settings and custom music in readme ([40263fa](https://github.com/BambooFury/Game-Theme-Song/commit/40263fa23731274204674d07580566ed4662a5c0))

## [1.2.0](https://github.com/BambooFury/Game-Theme-Song/compare/v1.1.1...v1.2.0) (2026-06-13)


### Features

* add custom game music with per-game audio library ([22c2044](https://github.com/BambooFury/Game-Theme-Song/commit/22c2044564c11561f8567c9efb02228e8469244d))
* add custom game music with per-game audio library ([d513b59](https://github.com/BambooFury/Game-Theme-Song/commit/d513b59f3d25aeca43b1de46b65ab69aff193690))

## [1.1.1](https://github.com/BambooFury/Game-Theme-Song/compare/v1.1.0...v1.1.1) (2026-06-13)


### Bug Fixes

* build filesystem paths with the platform separator so audio work… ([72cc433](https://github.com/BambooFury/Game-Theme-Song/commit/72cc43376a94a11b01f0308cffa1ce78d18d059f))
* build filesystem paths with the platform separator so audio works on Linux ([b2ee9c9](https://github.com/BambooFury/Game-Theme-Song/commit/b2ee9c95ec0ea2376b30d569ed3b805f19e66711))

## [1.1.0](https://github.com/BambooFury/Game-Theme-Song/compare/v1.0.0...v1.1.0) (2026-06-12)


### Features

* add clear downloaded music button in settings ([3117b38](https://github.com/BambooFury/Game-Theme-Song/commit/3117b38f26ba487bf7a0bf9ea8ef8d17baba4302))
* add loop toggle setting ([33fc870](https://github.com/BambooFury/Game-Theme-Song/commit/33fc870be1abcba9fe5ceb661e5ea207357029ac))
* add song length limit setting ([1429081](https://github.com/BambooFury/Game-Theme-Song/commit/14290812309c617da5d1b4b5bca42065a6808d54))
* play local game audio from install folder or soundtrack DLC when available ([f6734f0](https://github.com/BambooFury/Game-Theme-Song/commit/f6734f021caba191661e48332991cb3b0ee888ff))
* stop on game launch + fix: validate downloaded audio ([ed61e55](https://github.com/BambooFury/Game-Theme-Song/commit/ed61e55bd181f876b140cf12be9aea1fe3634f83))


### Bug Fixes

* normalize edition suffixes in game names for music search ([9540507](https://github.com/BambooFury/Game-Theme-Song/commit/9540507bba7354a502d01eba09403abdcf0a1398))
* toggle settings only by clicking the switch itself ([0bc5326](https://github.com/BambooFury/Game-Theme-Song/commit/0bc5326142d7c0ba5530e280a6ee74923a6ad608))

## Changelog
