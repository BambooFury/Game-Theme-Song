# Changelog

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
