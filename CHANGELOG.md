# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.1.44](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.43...mcp-server-azure-devops-v0.1.44) (2026-01-31)


### Features

* add azure devops url resolver ([47a3d23](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/47a3d23491987d4b72d09dd95da67bf8720c8c06))
* add pat support to setup script ([63715de](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/63715defd87f66c277d07039dd36692e5e2aa7b9))
* add server auth guards ([62f0f59](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/62f0f59ae68be17279dea7475f55661a9ecc6414))
* add server-aware search urls ([92f716d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/92f716daae3d461ca43eba80f5cffb453db28f35))
* **pi:** add test-watch extension ([10b37be](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/10b37be030d5de99f36d81e6aec5382ff50a01e3))
* **skills:** add skill-creator and azure-devops-rest-api skills with automated sync ([#268](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/268)) ([06cefa3](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/06cefa3b78b24152ff36adef12adb85fef82663e))
* support server wiki base urls ([3b99374](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/3b9937452307dff1967b0dc7abc43d8491799211))


### Bug Fixes

* **build:** avoid Node16 import extension requirement in schemas tests ([4c1f908](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/4c1f9081d2f04cd086eb82428704e1395ae94e22))
* **search:** stop injecting placeholder defaults ([c30767b](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/c30767b47b4c7284ce816127365b014b6ee5cb32))

## [0.1.43](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.42...mcp-server-azure-devops-v0.1.43) (2025-11-19)


### Features

* - adding a pullRequestId filter in  - adding source and target … ([#12](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/12)) ([f33e557](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/f33e5575a5069713c81d01dca46176e485cfe612))
* add publishing configuration ([c058e59](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/c058e59b96991f47a91ee3494fd3dfed8c02edd5))
* add pull request checks tool ([#11](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/11)) ([6c1dfd5](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6c1dfd540bd7493b497076d302f591ffcfa49ccf))
* add repository tree and branch/commit tools ([a95e6f2](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/a95e6f2630e7728b796afc0ba5491414b1e3634c))
* added prepack script to ensure the binary is built and marked executable before publishing ([757fea8](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/757fea8e35e33f1300bda3d2b12d49eb2053711f))
* improve commit workflow and add branch commit listing tool ([#7](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/7)) ([867bbc8](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/867bbc8383ee87f110f772531d9099ab588e126d))
* include file diffs in pull request changes ([#3](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/3)) ([0335c68](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/0335c685a2acff6712220e5d6ad87ff13553a7d0))
* provide simpler search/replace functionality for the create_commit tool ([1d1ec3f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/1d1ec3f621d1d9677bb6aab94aadf9020fd9f66a))
* version bump to 0.1.45 ([67e7a3d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/67e7a3d99a9bb0b0198173e13159854249aa24a8))


### Bug Fixes

* **ci:** update workflow to use pull_request_target and latest checkout action ([fb109a7](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/fb109a7614662ce6b32453f1f195b3496326c659))
* clarify instruction on how to use the create_commit tool ([bd82c00](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/bd82c000d79d1a514b946701abb11fadbb2eb869))
* clarify instruction on how to use the create_commit tool ([167893e](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/167893e23da37e8070c00e15b85395617edd0c7a))
* **deps:** address high vulnerability without breaking changes ([#4](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/4)) ([cb20e2d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/cb20e2de1835b87408a3e09d85bcc9b2c9d6e85d))
* **pull-requests:** include diff content in pull request changes ([#6](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/6)) ([d48aacc](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/d48aacc24b0f748159b60e792feb9bd5d17e692f))

## [0.1.42](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.41...mcp-server-azure-devops-v0.1.42) (2025-07-15)


### Features

* implement human-readable string enums for Azure DevOps API responses ([8168bcb](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/8168bcbe8e4957e9632927f57ecbe9632c911735))

## [0.1.41](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.40...mcp-server-azure-devops-v0.1.41) (2025-07-14)


### Features

* **pull-requests:** enhance get_pull_request_comments response with … ([#229](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/229)) ([6997a04](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6997a04e92b4fe453354b8fd9f0f25c974fcad2b))


### Bug Fixes

* **work-items:** make expand enum compatible with Gemini CLI ([#240](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/240)) ([ac1dcac](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/ac1dcace4cd6f63d5decd4820307b52a4d0d431d))

## [0.1.40](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.39...mcp-server-azure-devops-v0.1.40) (2025-06-20)


### Bug Fixes

* simplify listWikiPages API by removing unused parameters ([fff7238](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/fff72384f69433942ee8439de0dda90d7fc85c38))

## [0.1.39](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.38...mcp-server-azure-devops-v0.1.39) (2025-06-03)


### Features

* add listWikiPages functionality to Azure DevOps wiki client ([bb9ddc0](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/bb9ddc077e80be0caeda106a7e75dc336a62c9ae))
* implement create_wiki_page feature for Azure DevOps wiki API integration ([#225](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/225)) ([7e3294d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/7e3294d1f1b6e82d5ca34cf86f3eaa51579dad02))


### Bug Fixes

* enhanced the get-pull-request-comments tool to include path and line number ([f6017e5](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/f6017e5dd352b63b189e761c9cf27d103dd24b9d))
* remove uuid() validator to resolve unknown format error ([b251252](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/b251252c7c455ee11d8076380b70a546ebf40a6e))

## [0.1.38](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.37...mcp-server-azure-devops-v0.1.38) (2025-05-25)


### Bug Fixes

* improve org name extraction from url ([496abc7](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/496abc7a9c5fd0867cf8484f8c33c47a3cc42edf))

## [0.1.37](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.36...mcp-server-azure-devops-v0.1.37) (2025-05-14)


### Bug Fixes

* get_me support for visualstudio.com urls ([ffd3c8a](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/ffd3c8a34bcee1856911e5eed7b719d524c25fef))

## [0.1.36](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.35...mcp-server-azure-devops-v0.1.36) (2025-05-07)


### Bug Fixes

* implement pagination for list-pull-requests to prevent infinite loop ([#196](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/196)) ([e3d7f32](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/e3d7f321f11241bd7b45a4f0e6810509cc8c01c1))

## [0.1.35](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.34...mcp-server-azure-devops-v0.1.35) (2025-05-07)


### Bug Fixes

* update creatorId and reviewerId to require UUIDs instead of allowing emails ([09e82ef](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/09e82ef5e7dfdcd07d1851450ea8c488ea8bb82a))
* use default project for code search when no projectId is specified ([#202](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/202)) ([3bf118f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/3bf118f45b4222bbfaf888deb67d546b87afc2fe))

## [0.1.34](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.33...mcp-server-azure-devops-v0.1.34) (2025-05-02)


### Features

* add update-pull-request tool to tool-definitions and implement reviewer management ([b7b5398](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/b7b539813baadb84e15022fdb93d24f440491d94))

## [0.1.33](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.32...mcp-server-azure-devops-v0.1.33) (2025-04-28)


### Bug Fixes

* add guidance for HTML formatting in multi-line text fields ([#188](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/188)) ([25751cd](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/25751cd0d7cb8919a7bca80d0796784935f0fbed)), closes [#179](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/179)

## [0.1.32](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.31...mcp-server-azure-devops-v0.1.32) (2025-04-26)


### Features

* add get_pull_request_comments ([2b7fb3a](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/2b7fb3a885466c633d2d2dfdd8906cc9573483d9))
* add_pull_request_comment ([1df6161](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/1df616161835e11c0039bc344ccdc57742f79507))

## [0.1.31](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.30...mcp-server-azure-devops-v0.1.31) (2025-04-23)


### Features

* **pull-requests:** implement list-pull-requests functionality ([3f8cac4](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/3f8cac448e2adacaddeb069bc0116b8526577624))
* **wikis:** add create and update wiki functionalities ([27edd6d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/27edd6d7786748548f4a0123ff19be43b30265c4))


### Bug Fixes

* **pull-requests:** update repository name environment variable ([d2fde5f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/d2fde5f94280f08056f94b613a673d4bbe9c0192))

## [0.1.30](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.29...mcp-server-azure-devops-v0.1.30) (2025-04-21)


### Features

* **wikis:** implement `get_wiki_page` tool ([7ba5fd7](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/7ba5fd7830fefa17c014aa2b80f0bad04d8fcbf7))
* **wikis:** implement `get_wikis` tool ([3120479](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/3120479b5c31bfaeb50a507791056066f33b6534))

## [0.1.29](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.28...mcp-server-azure-devops-v0.1.29) (2025-04-19)


### Features

* **pipelines:** implement trigger-pipeline functionality ([e9ba71b](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/e9ba71bfeb2c3a2dc0e1e314698a453d5995d099))

## [0.1.28](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.27...mcp-server-azure-devops-v0.1.28) (2025-04-17)


### Features

* **pipeline:** implement get-pipeline functionality ([#166](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/166)) ([e307340](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/e3073401e141b566191be16ed4f9b7925c2849eb))

## [0.1.27](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.26...mcp-server-azure-devops-v0.1.27) (2025-04-16)


### Features

* **pipeline:** implement list-pipelines ([#161](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/161)) ([89ce473](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/89ce4732ba754632540ffb45ceae323f9675c023)), closes [#94](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/94)

## [0.1.26](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.25...mcp-server-azure-devops-v0.1.26) (2025-04-15)


### Features

* **getWorkItem:** enhance get_work_item to include all available fields ([3810660](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/38106600f04842a44e5e5b6e824716ebb6f69e61))
* support default project and organization in all tools ([5beca06](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/5beca063057bdbc2dd869c865fb01e0d311c8917))


### Bug Fixes

* return actual field information from get_project_details tool ([64a030a](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/64a030a8c14fd1f9e7f871ae409f0dded23dbe98))

## [0.1.25](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.24...mcp-server-azure-devops-v0.1.25) (2025-04-11)


### Features

* create pull request ([ab9c255](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/ab9c2554ea82a497dead8131a6479ba6fe7c5ba8))

## [0.1.24](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.23...mcp-server-azure-devops-v0.1.24) (2025-04-10)


### Bug Fixes

* add missing minimatch module ([ee1ffa3](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/ee1ffa34afb0da9cdac31da140c17dbd9c589c2b))

## [0.1.23](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.22...mcp-server-azure-devops-v0.1.23) (2025-04-10)


### Features

* **repositories:** add get_all_repositories_tree tool for viewing multi-repository file structure ([adbe206](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/adbe206300d55ba06063c675492b3a8153b688f7))
* support default project and organization in all tools ([96d61bd](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/96d61bd1098146dfafd1faf7dade1a37725cd7b7))

## [0.1.22](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.21...mcp-server-azure-devops-v0.1.22) (2025-04-08)


### Bug Fixes

* allow parameterless tools to be called without arguments ([9ce88c3](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/9ce88c3afd4454b8a65392a98e7e2ffb45192584))

## [0.1.21](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.20...mcp-server-azure-devops-v0.1.21) (2025-04-08)


### Features

* add get-file-content feature to access repository content ([a282f75](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/a282f75383ffc362e5b2d1ecbccebb0047e21571))
* restore get_file_content tool and update documentation ([f71013a](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/f71013a962fb5fbe5d121eaf7f1901e58cf70482))

## [0.1.20](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.19...mcp-server-azure-devops-v0.1.20) (2025-04-06)


### Bug Fixes

* add explicit permissions to workflow file ([ae85b95](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/ae85b953d2467538e42d8c6853b93e1af3c8ed51))
* refine WIQL query in integration test ([eb32e43](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/eb32e43a9064485d29661bcae99a987e3b863464))
* remove schema validation for parameterless tools ([031a71d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/031a71d71083649216e5b67eb6d67c18c78702bd))

## [0.1.19](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.18...mcp-server-azure-devops-v0.1.19) (2025-04-05)


### Bug Fixes

* package.json & package-lock.json to reduce vulnerabilities ([2fb1e72](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/2fb1e725120edc75c9897bc81f57381c20ad880a))

## [0.1.18](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.17...mcp-server-azure-devops-v0.1.18) (2025-04-05)


### Bug Fixes

* getMe profile bug ([ceca909](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/ceca909beaa74b0dd150ce1688a498281fd0b9e8))

## [0.1.17](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.16...mcp-server-azure-devops-v0.1.17) (2025-04-05)


### Features

* implement get_me tool ([2a3849d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/2a3849da063f6ce0877dd672992a8bc19f88230e))

## [0.1.16](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.15...mcp-server-azure-devops-v0.1.16) (2025-04-05)


### Features

* limit search results to 10 when includeContent is true ([827e4e6](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/827e4e65be353125f5ae595b7e68d80f614f8c07))
* make projectId optional in search features for organization-wide search ([1ca1e0e](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/1ca1e0e146bf880d367078b02a2ddaebf6f54a2a))


### Bug Fixes

* correct [Object Object] display in search_code includeContent ([bdabd6b](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/bdabd6bbeb3f60347c37499bdcb621f5c206dfe0))
* resolve parameter conflict in getItemContent function ([38d624c](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/38d624c10dcfad26bab6d04a9290ad05097f5052))
* simplify content handling in search_code to properly process ReadableStream ([136a90a](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/136a90a94f446e2c4227d87286b8d71ef8223212))


### Performance Improvements

* optimize git hooks with lint-staged ([ba953d8](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/ba953d84706893d56a82573c8d9e8ecdf3b09591))

## [0.1.15](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.14...mcp-server-azure-devops-v0.1.15) (2025-04-02)


### Bug Fixes

* search_work_items authentication with Azure Identity ([cdb2e72](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/cdb2e722ee3abf6be465adcad7dc294f7c623103))

## [0.1.14](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.13...mcp-server-azure-devops-v0.1.14) (2025-04-02)


### Bug Fixes

* add zod-to-json-schema dependency and remove unused packages from package-lock.json ([c9c117f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/c9c117fd388e228c1116d9249698d931557877b7))

## [0.1.13](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.12...mcp-server-azure-devops-v0.1.13) (2025-04-02)


### Features

* add 'expand' option to get_work_item ([6bee365](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6bee365d9b37f7e197eaff03065e713ab0ee1c5f))
* Add npm publish to release.yml ([50d0368](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/50d0368c090adc39a9b3ece67d198cabcd18c6ce))
* add pre-commit hook for prettier and eslint ([1b4ddff](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/1b4ddff90e3c3ab9954d041398d224f03c632f63))
* enhance GitHub release notes with changelog content ([2fb275d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/2fb275d38acbc9c092584573a549466ccd5482bc))
* implement automated release workflow ([9e5a5df](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/9e5a5dfacdd87ca933ed02efbd0aa8035239332d))
* implement get_project_details core functionality ([6d93d98](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6d93d9820c4bd3ce8bc257d05ff04b39d1370a19)), closes [#101](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/101)
* implement get_repository_details core functionality ([dcef80b](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/dcef80b922ef338f6d3704ab30f59c1b126c70ee))
* implement manage work item link handler ([72cd641](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/72cd6419cf804eb0d72d5ba7763ad5b46bc35650))
* implement search_wiki handler with tests ([286598c](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/286598c47052ade3b6a524938046b3e3b9341b3a))
* implement search_work_items handler with tests ([e244658](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/e2446587e6f82fb7e2dbfe47d2d034ecfdfc3189))
* **search:** add code search functionality for Azure DevOps repos ([0680102](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/068010236b10d8ed444ec01bd6820b27c5c9dcdc))


### Bug Fixes

* add bin field to make package executable with npx ([2d3d5fa](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/2d3d5fa31a9ba741c4a85d7ef21d72ff46270695))
* add build step to workflow and ensure dist files are included in package ([6e12d3c](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6e12d3ca666937c7b24c7c5d8b161fbb8e34798c))
* add parent-child relationship support for createWorkItem ([31d5efe](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/31d5efef49c162772e64eabd1e4012d8143dc270))
* add tag_name parameter to GitHub release action ([68cfa43](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/68cfa43839c5975cdf9c2ec8a5348ace6138d1c2))
* improve cross-platform CLI compatibility for Windows ([0f6ed3f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/0f6ed3fe7c72ba63ec5485047ce52e06278457ab))
* make AZURE_DEVOPS_AUTH_METHOD parameter case-insensitive ([9bbf53f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/9bbf53ffcc1a9170e6ba038fee182da0621be777))
* only request max 200 by default ([296de35](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/296de3584346bd05c14dec3b39dff9a5ec0036a5))
* resolve npm publish authentication and package content issues ([96e91d0](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/96e91d04ec620ad77fc35fea31c2b7795fb73d9e))
* restore tests/setup.ts to fix test suite ([5e23eab](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/5e23eab1228f3949c431f1b8509ad5fbf829e528))
* revert to direct execution of index.js to fix main module detection ([82efa90](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/82efa90852f56db3a0b028ec50eb5230072da88a))
* Typo in release.yaml workflow ([e0de15f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/e0de15fd220ef2141466cf0530383921ed99253d))

## [0.1.12](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/mcp-server-azure-devops-v0.1.11...mcp-server-azure-devops-v0.1.12) (2025-04-02)


### Features

* add 'expand' option to get_work_item ([6bee365](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6bee365d9b37f7e197eaff03065e713ab0ee1c5f))
* Add npm publish to release.yml ([50d0368](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/50d0368c090adc39a9b3ece67d198cabcd18c6ce))
* add pre-commit hook for prettier and eslint ([1b4ddff](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/1b4ddff90e3c3ab9954d041398d224f03c632f63))
* enhance GitHub release notes with changelog content ([2fb275d](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/2fb275d38acbc9c092584573a549466ccd5482bc))
* implement automated release workflow ([9e5a5df](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/9e5a5dfacdd87ca933ed02efbd0aa8035239332d))
* implement get_project_details core functionality ([6d93d98](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6d93d9820c4bd3ce8bc257d05ff04b39d1370a19)), closes [#101](https://github.com/Tiberriver256/mcp-server-azure-devops/issues/101)
* implement get_repository_details core functionality ([dcef80b](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/dcef80b922ef338f6d3704ab30f59c1b126c70ee))
* implement manage work item link handler ([72cd641](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/72cd6419cf804eb0d72d5ba7763ad5b46bc35650))
* implement search_wiki handler with tests ([286598c](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/286598c47052ade3b6a524938046b3e3b9341b3a))
* implement search_work_items handler with tests ([e244658](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/e2446587e6f82fb7e2dbfe47d2d034ecfdfc3189))
* **search:** add code search functionality for Azure DevOps repos ([0680102](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/068010236b10d8ed444ec01bd6820b27c5c9dcdc))


### Bug Fixes

* add bin field to make package executable with npx ([2d3d5fa](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/2d3d5fa31a9ba741c4a85d7ef21d72ff46270695))
* add build step to workflow and ensure dist files are included in package ([6e12d3c](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6e12d3ca666937c7b24c7c5d8b161fbb8e34798c))
* add parent-child relationship support for createWorkItem ([31d5efe](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/31d5efef49c162772e64eabd1e4012d8143dc270))
* add tag_name parameter to GitHub release action ([68cfa43](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/68cfa43839c5975cdf9c2ec8a5348ace6138d1c2))
* improve cross-platform CLI compatibility for Windows ([0f6ed3f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/0f6ed3fe7c72ba63ec5485047ce52e06278457ab))
* make AZURE_DEVOPS_AUTH_METHOD parameter case-insensitive ([9bbf53f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/9bbf53ffcc1a9170e6ba038fee182da0621be777))
* only request max 200 by default ([296de35](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/296de3584346bd05c14dec3b39dff9a5ec0036a5))
* resolve npm publish authentication and package content issues ([96e91d0](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/96e91d04ec620ad77fc35fea31c2b7795fb73d9e))
* restore tests/setup.ts to fix test suite ([5e23eab](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/5e23eab1228f3949c431f1b8509ad5fbf829e528))
* revert to direct execution of index.js to fix main module detection ([82efa90](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/82efa90852f56db3a0b028ec50eb5230072da88a))
* Typo in release.yaml workflow ([e0de15f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/e0de15fd220ef2141466cf0530383921ed99253d))

### [0.1.11](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/v0.1.10...v0.1.11) (2025-04-01)


### Features

* **search:** add code search functionality for Azure DevOps repos ([0680102](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/068010236b10d8ed444ec01bd6820b27c5c9dcdc))

### [0.1.10](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/v0.1.9...v0.1.10) (2025-04-01)


### Features

* add 'expand' option to get_work_item ([6bee365](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/6bee365d9b37f7e197eaff03065e713ab0ee1c5f))


### Bug Fixes

* only request max 200 by default ([296de35](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/296de3584346bd05c14dec3b39dff9a5ec0036a5))

### [0.1.9](https://github.com/Tiberriver256/mcp-server-azure-devops/compare/v0.1.8...v0.1.9) (2025-03-31)


### Features

* add pre-commit hook for prettier and eslint ([1b4ddff](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/1b4ddff90e3c3ab9954d041398d224f03c632f63))
* implement manage work item link handler ([72cd641](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/72cd6419cf804eb0d72d5ba7763ad5b46bc35650))


### Bug Fixes

* add parent-child relationship support for createWorkItem ([31d5efe](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/31d5efef49c162772e64eabd1e4012d8143dc270))
* make AZURE_DEVOPS_AUTH_METHOD parameter case-insensitive ([9bbf53f](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/9bbf53ffcc1a9170e6ba038fee182da0621be777))
* restore tests/setup.ts to fix test suite ([5e23eab](https://github.com/Tiberriver256/mcp-server-azure-devops/commit/5e23eab1228f3949c431f1b8509ad5fbf829e528))

### [0.1.8](https://github.com/Tiberriver256/azure-devops-mcp/compare/v0.1.7...v0.1.8) (2025-03-26)


### Bug Fixes

* revert to direct execution of index.js to fix main module detection ([82efa90](https://github.com/Tiberriver256/azure-devops-mcp/commit/82efa90852f56db3a0b028ec50eb5230072da88a))

### [0.1.7](https://github.com/Tiberriver256/azure-devops-mcp/compare/v0.1.6...v0.1.7) (2025-03-26)


### Bug Fixes

* add build step to workflow and ensure dist files are included in package ([6e12d3c](https://github.com/Tiberriver256/azure-devops-mcp/commit/6e12d3ca666937c7b24c7c5d8b161fbb8e34798c))

### [0.1.6](https://github.com/Tiberriver256/azure-devops-mcp/compare/v0.1.5...v0.1.6) (2025-03-26)


### Bug Fixes

* improve cross-platform CLI compatibility for Windows ([0f6ed3f](https://github.com/Tiberriver256/azure-devops-mcp/commit/0f6ed3fe7c72ba63ec5485047ce52e06278457ab))

### [0.1.5](https://github.com/Tiberriver256/azure-devops-mcp/compare/v0.1.4...v0.1.5) (2025-03-26)


### Bug Fixes

* add bin field to make package executable with npx ([2d3d5fa](https://github.com/Tiberriver256/azure-devops-mcp/commit/2d3d5fa31a9ba741c4a85d7ef21d72ff46270695))

### [0.1.4](https://github.com/Tiberriver256/azure-devops-mcp/compare/v0.1.3...v0.1.4) (2025-03-26)


### Bug Fixes

* resolve npm publish authentication and package content issues ([96e91d0](https://github.com/Tiberriver256/azure-devops-mcp/commit/96e91d04ec620ad77fc35fea31c2b7795fb73d9e))

### [0.1.3](https://github.com/Tiberriver256/azure-devops-mcp/compare/v0.1.2...v0.1.3) (2025-03-26)


### Features

* Add npm publish to release.yml ([50d0368](https://github.com/Tiberriver256/azure-devops-mcp/commit/50d0368c090adc39a9b3ece67d198cabcd18c6ce))


### Bug Fixes

* Typo in release.yaml workflow ([e0de15f](https://github.com/Tiberriver256/azure-devops-mcp/commit/e0de15fd220ef2141466cf0530383921ed99253d))

### [0.1.2](https://github.com/Tiberriver256/azure-devops-mcp/compare/v0.1.1...v0.1.2) (2025-03-26)


### Bug Fixes

* add tag_name parameter to GitHub release action ([68cfa43](https://github.com/Tiberriver256/azure-devops-mcp/commit/68cfa43839c5975cdf9c2ec8a5348ace6138d1c2))

### 0.1.1 (2025-03-26)


### Features

* enhance GitHub release notes with changelog content ([2fb275d](https://github.com/Tiberriver256/azure-devops-mcp/commit/2fb275d38acbc9c092584573a549466ccd5482bc))
* implement automated release workflow ([9e5a5df](https://github.com/Tiberriver256/azure-devops-mcp/commit/9e5a5dfacdd87ca933ed02efbd0aa8035239332d))

## 0.1.0 (2025-03-26)


### Features

* enhance GitHub release notes with changelog content ([dcaf554](https://github.com/Tiberriver256/azure-devops-mcp/commit/dcaf5542fc08cbb9bd665623d305ae7879758f4e))
* implement automated release workflow ([6fbf41e](https://github.com/Tiberriver256/azure-devops-mcp/commit/6fbf41e5a52c4db054355d4aced33744f6b1a6eb))
