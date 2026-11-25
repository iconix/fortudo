# Commit index

The 13 local-only commits use plain Git object IDs. Their objects were available in this clone but did not resolve through the GitHub repository API. Use `git show` in the source clone to inspect them.

GitHub PR membership and Git ancestry answer different questions. The groups below preserve GitHub's 657 memberships. Four repeated memberships account for the difference from the 653 unique branch commits. Main contributes 117 separate commits. The final sections cover 13 objects found through local refs and 75 more found by following force-push ancestry, bringing the distinct total to 858.

[Pull requests](PR-INDEX.md) · [Main history](#main-history) · [Other audited commits](#other-audited-commits) · [Superseded ref history](#superseded-ref-history)

## PR 1

[minimally refactor app to enable testing; add app tests with jest](https://github.com/iconix/fortudo/pull/1) · merged

- [c55f7233](https://github.com/iconix/fortudo/commit/c55f7233d7b8018ff41d2619783fc920816cf789) minimally refactor app to enable testing (pull all js into separate, single file); add app tests via jest
- [37330865](https://github.com/iconix/fortudo/commit/37330865fd7a03a27a6d36c632d2687969fee2d1) add .nvmrc;  configure vscode launch settings for debugging with jest
- [650ac0ff](https://github.com/iconix/fortudo/commit/650ac0ffbdf02cdad0a7afd673da09dc4bdefb6e) fixed bug in auto-rescheduling after late task completion,  which can cause multiple overlapping tasks; updated tasks storage to maintain array references for tests
- [4002811f](https://github.com/iconix/fortudo/commit/4002811f2424b1b7af7bfd99db4ba28b315117d4) bugfixes: ensure completed tasks do not reschedule; ensure updated tasks trigger reschedule cascade if needed
- [9c31e06a](https://github.com/iconix/fortudo/commit/9c31e06a4f68451f9c53bfc82d8f64a9a42be283) feat: add suggested start time functionality and update start time field on form interactions
- [b23c6f88](https://github.com/iconix/fortudo/commit/b23c6f88b5fe27df895835d847c60acc0cdd78e3) refactor: update suggested start time logic to round up to nearest 15 minutes; allow start time to update to suggested time while form is being filled out
- [3879b24e](https://github.com/iconix/fortudo/commit/3879b24ee3550aeeb2d9a3b3940b1e74276eaa2b) 5-minute roundup instead
- [09d09851](https://github.com/iconix/fortudo/commit/09d098511fbe95cdcd57bf6350bce494c6b77dda) feat: set focus on description input field when the page loads
- [2e25cc1b](https://github.com/iconix/fortudo/commit/2e25cc1b3b8cd4f39902f7351861696bab82d5da) cleanup

## PR 2

[&#91;bug&#93; fixes after test refactor](https://github.com/iconix/fortudo/pull/2) · merged

- [c75363cf](https://github.com/iconix/fortudo/commit/c75363cf5d84834cb1a34a5d7e1431a253524da2) fix bug that prevents user from updating start time; fix bug that prevents loading tasks from local storage; refactor tests to improve date and form mocking
- [43a14b20](https://github.com/iconix/fortudo/commit/43a14b205c87f677c8eb190573f400f5f58759ab) missed tasks set
- [8512f57b](https://github.com/iconix/fortudo/commit/8512f57b61e1dc8b5654f5f7a3fd22fdb304fa89) ux tweak

## PR 3

[Nested refactor work](https://github.com/iconix/fortudo/pull/3) · merged

- [b590bdf0](https://github.com/iconix/fortudo/commit/b590bdf023738da9f2856ab5e8fea27612f1b4f3) Jules was unable to complete the task in time. Please review the work done so far and provide feedback for Jules to continue.
- [f3547601](https://github.com/iconix/fortudo/commit/f35476017536678da01ebe2721559f106b4e023b) Refactor: Remove window.fortudo from testing environment
- [9854df21](https://github.com/iconix/fortudo/commit/9854df21e9552ae2eab7ec9d857dbcfce0b277c2) some test fixes
- [73dbcc93](https://github.com/iconix/fortudo/commit/73dbcc93d7fe4f5451e03ad681fcc77fc998ca9a) Fix: Address multiple test failures across unit and integration tests
- [ec970e9a](https://github.com/iconix/fortudo/commit/ec970e9a33cd70cb0e471d07e353b7481282ba45) cursor strikes back
- [4b232b62](https://github.com/iconix/fortudo/commit/4b232b629b4f798d3179ed8b5012d9f12490e901) comment cleanup

## PR 4

[refactor todo comments](https://github.com/iconix/fortudo/pull/4) · merged

- [2a32d5b2](https://github.com/iconix/fortudo/commit/2a32d5b238e02f78fb0b59461147a2d99781265a) Refactor: Address TODOs and complete modularization
- [bc46a83c](https://github.com/iconix/fortudo/commit/bc46a83ca5a2cf46fb23e5940f65ee446ae0190b) I've completed a significant refactoring of the task management application and introduced a suite of unit and integration tests.
- [05c942b0](https://github.com/iconix/fortudo/commit/05c942b0727db126912cc1236fbd6b15520c6ad1) fix test contamination
- [3d5857e4](https://github.com/iconix/fortudo/commit/3d5857e4ab6979bdcd18ad521ba3dc29d0152b99) cleanup
- [48dfb3a7](https://github.com/iconix/fortudo/commit/48dfb3a7a2083298b51c6a5ee73b083eabf42c90) add coverage summary
- [c795890e](https://github.com/iconix/fortudo/commit/c795890e4c2a11f19b77aaf1162d87f298b739d7) app.test.js
- [84a34016](https://github.com/iconix/fortudo/commit/84a34016fbbe9f33e5f074a2a84fe53fb694d213) simple logger and a bit more testability
- [6204a01e](https://github.com/iconix/fortudo/commit/6204a01e5c2491ea1b54addeb618e56d68ea3232) remove alert after clearing tasks
- [11e25e4b](https://github.com/iconix/fortudo/commit/11e25e4b924466fdabe688e9e36fa451690c0ad0) reset start time field after deleting all tasks
- [c1e0a284](https://github.com/iconix/fortudo/commit/c1e0a2844a306842cce019e5696b3931fbb1b575) cleanup
- [dde10914](https://github.com/iconix/fortudo/commit/dde109146afffe888573fa8f52a5b3780db17bf8) start time input field enhancements: force update field whenever schedule structure changes; enhance suggested start time logic
- [17a9ed4f](https://github.com/iconix/fortudo/commit/17a9ed4f33c2804d0f56b5dfd1f1d1ae5acd2056) enhance suggested start time logic further: distinguish between filling gaps in schedule and planning ahead
- [f51c8869](https://github.com/iconix/fortudo/commit/f51c886922b08052019aed8af5a4bd2ca717585f) configure and run eslint and prettier
- [6c4c3183](https://github.com/iconix/fortudo/commit/6c4c31835b4590f1b4907425a792b933d2a45260) add more github workflows for testing and security scanning

## PR 5

[refactor/monolith](https://github.com/iconix/fortudo/pull/5) · merged

- [2dee64db](https://github.com/iconix/fortudo/commit/2dee64dbb5cd8f735d0ea3cda57697ee3b3246bc) broken checkpoint
- [7241a4d6](https://github.com/iconix/fortudo/commit/7241a4d6751cde3c4ee1a969183537a771679903) Nested refactor work (#3)
- [cef7afed](https://github.com/iconix/fortudo/commit/cef7afedfc68e8538ba131e0459da5a7747e79ed) refactor todo comments (#4)
- [9cac48f3](https://github.com/iconix/fortudo/commit/9cac48f3b90738d3e1c97eb80cae533143d35b2d) code review: round 1
- [4462035a](https://github.com/iconix/fortudo/commit/4462035a46bbe41fe2af711837893a30a5c5bcda) fix memory leak in dom event listeners; fix inefficient dom operations
- [99de871a](https://github.com/iconix/fortudo/commit/99de871af507d2f26c3dcf9ad9fcf2f60bac112f) optimizations: implement cache for sorted tasks with version tracking to reduce sorting; cache time calculations and terminate early on overlap detection
- [29fc6bb7](https://github.com/iconix/fortudo/commit/29fc6bb700fc39ccfa4d7bae7392e31a677bd185) feat: if current/active task is running late, switch to yellow text as warning; some cleanup
- [4db8db92](https://github.com/iconix/fortudo/commit/4db8db92931de77923927c815c80228792b87802) update active task color every second
- [81b7bc5d](https://github.com/iconix/fortudo/commit/81b7bc5dd4bfb8a39f8b29af046e9f8c6c21ec3e) prettier
- [b8d7be56](https://github.com/iconix/fortudo/commit/b8d7be564fdba75eb3b221f0bc4857cb72d95e0c) include completed tasks when determining if there's a scheduling gap at the current time
- [a795195b](https://github.com/iconix/fortudo/commit/a795195b27159bfcc3c721ed92f0ef30e0a1f5b1) a single input field has never been so finely tuned as my start time field
- [61d80ad7](https://github.com/iconix/fortudo/commit/61d80ad7160afdd95fa89be5ad560ea146c2e012) simplify delete all tasks impl
- [f8bd1c69](https://github.com/iconix/fortudo/commit/f8bd1c69e8ee1a0865ef7fd23a735fef151b0aac) moar code review: mostly dom-handler.js
- [40b1cb05](https://github.com/iconix/fortudo/commit/40b1cb05ce6894c177e112dacfe3a2c589078c7d) significantly simplify time logic by adding proper date context to tasks (i.e., use datetime instead of just time): this includes ability to migrate old tasks persisted in local storage to new format
- [84daa228](https://github.com/iconix/fortudo/commit/84daa22870fc725f89e8e5c8d23c4a9805f1027d) small review changes
- [70a02c79](https://github.com/iconix/fortudo/commit/70a02c79e152c9b8a1ef0446d44d659feb02e842) little fixes; remove unused typedef

## PR 6

[ci(deps): bump peter-evans/create-pull-request from 5 to 7](https://github.com/iconix/fortudo/pull/6) · merged

- [848a9269](https://github.com/iconix/fortudo/commit/848a9269d9dd93e81dec6def6331c1e08b13f527) ci(deps): bump peter-evans/create-pull-request from 5 to 7
- [6c148c7b](https://github.com/iconix/fortudo/commit/6c148c7b1c190c4b3e9b703b8573723c6ccee63e) replace dependabot reviewers and assignees with CODEOWNERS
- [c9704845](https://github.com/iconix/fortudo/commit/c9704845db84210ce0dd329c01e6e6286ee1271f) remove automated release by gh actions
- [ecff03b4](https://github.com/iconix/fortudo/commit/ecff03b4c8c0e6aa89b05915e8f7ff1b554fb247) Update CODEOWNERS

## PR 7

[ci(deps): bump codecov/codecov-action from 3 to 5](https://github.com/iconix/fortudo/pull/7) · merged

- [af7ed8c3](https://github.com/iconix/fortudo/commit/af7ed8c327156504faabc30f783158da574f626e) ci(deps): bump codecov/codecov-action from 3 to 5
- [2bfaea0c](https://github.com/iconix/fortudo/commit/2bfaea0cdbebc2ae06a652e26f8bf729cfbab8bc) Merge branch 'main' of https://github.com/iconix/fortudo into dependabot/github_actions/codecov/codecov-action-5

## PR 8

[chore(deps-dev): bump the minor-and-patch group with 3 updates](https://github.com/iconix/fortudo/pull/8) · merged

- [fc900671](https://github.com/iconix/fortudo/commit/fc900671ec8f6cc20a5b8a1a171a1c92d2140461) chore(deps-dev): bump the minor-and-patch group with 3 updates
- [b9938731](https://github.com/iconix/fortudo/commit/b9938731ab1e91adadd855d829e143c0628fa23d) Merge branch 'main' of https://github.com/iconix/fortudo into dependabot/npm_and_yarn/minor-and-patch-205b8e6f91

## PR 9

[ci: skip deployments if there are no code changes in a commit](https://github.com/iconix/fortudo/pull/9) · merged

- [7a18b531](https://github.com/iconix/fortudo/commit/7a18b531fba14627db56f00dd80eeef50c55b182) make cicd skip deployments if there are no code changes in a commit
- [cb46a5ac](https://github.com/iconix/fortudo/commit/cb46a5ace16fa65df50f1db479436ebcc6536e57) fix: ensure that changes only within the .github/ directory (or to markdown files, .gitignore, or LICENSE) do not trigger a deployment

## PR 10

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/10) · merged

- [82d695d9](https://github.com/iconix/fortudo/commit/82d695d937660baa7d97e51965d72c41f2e13f98) chore: update dependencies

## PR 11

[Nested refactor work](https://github.com/iconix/fortudo/pull/11) · merged

- [09b29a43](https://github.com/iconix/fortudo/commit/09b29a4305ef0f7841e1be8ca241a1717c936a8d) Jules was unable to complete the task in time. Please review the work done so far and provide feedback for Jules to continue.
- [a0888e3f](https://github.com/iconix/fortudo/commit/a0888e3f03684c29de636cc7393d54cf77976c01) feat: Implement V2 UI HTML and CSS structure
- [35480bc2](https://github.com/iconix/fortudo/commit/35480bc2251aacdc09ec007633f201a8d444768c) feat: Implement V2 UI and core functionality

## PR 12

[&#91;refactor&#93; app v2](https://github.com/iconix/fortudo/pull/12) · merged

- [fdd37535](https://github.com/iconix/fortudo/commit/fdd375356b5b83daecfc153674ff3e0ae2cd363b) add v2 ui mock
- [e5822c49](https://github.com/iconix/fortudo/commit/e5822c49a4324578ff075a480ecdfb255e26a335) Nested refactor work (#11)
- [be656235](https://github.com/iconix/fortudo/commit/be656235a94cf29b6c9ac626867ff97eb5925db4) a much more functional/aesthetic edit
- [f62d6760](https://github.com/iconix/fortudo/commit/f62d6760013ba223659856e9cc73fd57dd40f77d) temp disable all tests to get preview deployed
- [7b3ef366](https://github.com/iconix/fortudo/commit/7b3ef36606d6072a3c6d613701b7eb5cf5cd1f08) make ci pipeline happy with no tests (temp)
- [654d6318](https://github.com/iconix/fortudo/commit/654d631857d65eb1ce56dc4da9d0ae0f8f0bddc8) remove mock ui
- [33db8a6f](https://github.com/iconix/fortudo/commit/33db8a6f95e82679227a0e95602f22a1c360271a) better mobile responsiveness
- [c7974036](https://github.com/iconix/fortudo/commit/c7974036774d1f6be59fc45e6b11bdf0b5f4a965) prettier
- [12c315d3](https://github.com/iconix/fortudo/commit/12c315d3790887bcd0e762bb2386885114f456c0) restore some functionality
- [e15482ec](https://github.com/iconix/fortudo/commit/e15482ecef57b1c6cc9132130a9f7e3a0353d32c) enable clearing only scheduled tasks
- [75f09666](https://github.com/iconix/fortudo/commit/75f09666f4e2b234679184e5e63036733a45992c) enable clearing only completed tasks
- [ae3045bf](https://github.com/iconix/fortudo/commit/ae3045bfaf136a411fbf7232980a7bb11fbc34c7) some cleanup
- [70f48255](https://github.com/iconix/fortudo/commit/70f48255d1e3a46f93be13c6fdd8e722da519ba0) populate scheduling modal with suggested start time; make easier to add multiple tasks of the same type in succession
- [2fd2da4f](https://github.com/iconix/fortudo/commit/2fd2da4ff08b0751fb5c0d310ae11a8eadd10d45) fix scheduled task edit form on mobile devices
- [a62c688d](https://github.com/iconix/fortudo/commit/a62c688d4916cdef87d2c61d1aa42404fa347e56) bugfix: address subtle task form de-sync issue seen on mobile
- [87ca6ded](https://github.com/iconix/fortudo/commit/87ca6ded8bc912c345469755b6c0ae0940bbebfb) bump to redeploy preview link
- [0e82d2b5](https://github.com/iconix/fortudo/commit/0e82d2b58999d38da988c6fbc630d4da089f48c8) bump to redeploy preview link
- [056134d1](https://github.com/iconix/fortudo/commit/056134d1969dad7f9350f7f651f8cabe4ec2e35d) bump preview link to last 28 days
- [933d22ff](https://github.com/iconix/fortudo/commit/933d22ff80d112556bd986c85b99f5269313f917) bump preview link to last 90 days
- [43826f6c](https://github.com/iconix/fortudo/commit/43826f6ccbc1d332adfa55568dca71a8638152dc) Merge branch 'main' of https://github.com/iconix/fortudo into refactor/v2
- [956e6079](https://github.com/iconix/fortudo/commit/956e607911019fcd49e8a1e6b4f86ffc75ea4d58) "expires" flag may not be longer than 30d (boo)
- [c2e6b1de](https://github.com/iconix/fortudo/commit/c2e6b1de0838b24f36e78837e3388a1b83bfb518) fix yaml syntax
- [d8c1dac4](https://github.com/iconix/fortudo/commit/d8c1dac43a7ac3cba207f09b8341219441a9b850) Refactor v2: Complete test coverage, module extraction, and code quality improvements (#28)
- [751a96ae](https://github.com/iconix/fortudo/commit/751a96aed0ac852e6a04f9123cb039d8de4df8cb) test: add comprehensive tests to meet 70% coverage thresholds
- [35b3acfb](https://github.com/iconix/fortudo/commit/35b3acfb853578fa8ca65edc1f6e0a108e0b423e) chore: fix moderate severity vulnerability in js-yaml
- [e89a7bc1](https://github.com/iconix/fortudo/commit/e89a7bc1cb69d16a6075068b1c4d8ab144eb2f5e) fix: check confirmCompleteLate result and flow around locked tasks
- [81e8c12d](https://github.com/iconix/fortudo/commit/81e8c12d880dfc0974cfe6e501e71285381d4a48) feat: add adjust-and-complete for running tasks when adding new task
- [e320a6fc](https://github.com/iconix/fortudo/commit/e320a6fc7f15dfaca2b7eae62ef884ac626b18ad) fix: update task reschedule confirmation now works correctly
- [2b612ab1](https://github.com/iconix/fortudo/commit/2b612ab1ceb3c564cb76858c54d886921125a7de) fix: priority label colors and icons
- [d9e574e2](https://github.com/iconix/fortudo/commit/d9e574e2bd13f10e75ff599fa2a64bb4c621207f) fix: toggle required attribute on start-time input when switching task types

## PR 13

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/13) · merged

- [3f64da00](https://github.com/iconix/fortudo/commit/3f64da00e4888482df1714fee4329bbf5a545561) chore: update dependencies

## PR 14

[chore(deps-dev): bump the minor-and-patch group with 2 updates](https://github.com/iconix/fortudo/pull/14) · closed

- [ebf168a3](https://github.com/iconix/fortudo/commit/ebf168a3a65f6ee30103d566a135c8ffbdc082a8) chore(deps-dev): bump the minor-and-patch group with 2 updates

## PR 15

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates](https://github.com/iconix/fortudo/pull/15) · closed

- [da0f25a3](https://github.com/iconix/fortudo/commit/da0f25a33ed78ae87897e25b4d9756fa6b0b3128) chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates

## PR 16

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 4 updates](https://github.com/iconix/fortudo/pull/16) · closed

- [af4e6c1c](https://github.com/iconix/fortudo/commit/af4e6c1cd3187a130a340797aec7a77c2947ea83) chore(deps-dev): bump the minor-and-patch group across 1 directory with 4 updates

## PR 17

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 6 updates](https://github.com/iconix/fortudo/pull/17) · closed

- [7a4d65e5](https://github.com/iconix/fortudo/commit/7a4d65e599e675081e35ea3da9ef0f114684adb9) chore(deps-dev): bump the minor-and-patch group across 1 directory with 6 updates

## PR 18

[ci(deps): bump actions/download-artifact from 4 to 5](https://github.com/iconix/fortudo/pull/18) · merged

- [a825e47d](https://github.com/iconix/fortudo/commit/a825e47d71025338c7b7023db9ba09e4b78175c6) ci(deps): bump actions/download-artifact from 4 to 5

## PR 19

[ci(deps): bump actions/checkout from 4 to 5](https://github.com/iconix/fortudo/pull/19) · merged

- [2df923dc](https://github.com/iconix/fortudo/commit/2df923dc3769ae7984d77a000e271bd4f4ed340e) ci(deps): bump actions/checkout from 4 to 5

## PR 20

[ci(deps): bump actions/github-script from 7 to 8](https://github.com/iconix/fortudo/pull/20) · merged

- [d7075e3f](https://github.com/iconix/fortudo/commit/d7075e3f03e9ceb8963f87b00135725636249c2d) ci(deps): bump actions/github-script from 7 to 8

## PR 21

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/21) · closed

- [bfd57527](https://github.com/iconix/fortudo/commit/bfd5752763410465c3f52436024731148e1a8ae4) chore: update dependencies

## PR 22

[ci(deps): bump actions/setup-node from 4 to 5](https://github.com/iconix/fortudo/pull/22) · closed

- [a0e1256b](https://github.com/iconix/fortudo/commit/a0e1256bc262da64d78af2f476ed45612a730eee) ci(deps): bump actions/setup-node from 4 to 5

## PR 23

[ci(deps): bump github/codeql-action from 3 to 4](https://github.com/iconix/fortudo/pull/23) · merged

- [78ef6237](https://github.com/iconix/fortudo/commit/78ef6237583ea4128da66ec7c73e0f4d5c190899) ci(deps): bump github/codeql-action from 3 to 4

## PR 24

[ci(deps): bump actions/setup-node from 4 to 6](https://github.com/iconix/fortudo/pull/24) · merged

- [873d928b](https://github.com/iconix/fortudo/commit/873d928bb6b5822835b0eff5558baac92f42a794) ci(deps): bump actions/setup-node from 4 to 6

## PR 25

[chore(deps-dev): bump the minor-and-patch group with 2 updates](https://github.com/iconix/fortudo/pull/25) · closed

- [042f1bc8](https://github.com/iconix/fortudo/commit/042f1bc851e6c246b34562d311b57c83d5f55751) chore(deps-dev): bump the minor-and-patch group with 2 updates

## PR 26

[ci(deps): bump actions/download-artifact from 5 to 6](https://github.com/iconix/fortudo/pull/26) · merged

- [742ac2b8](https://github.com/iconix/fortudo/commit/742ac2b803523a50e5421d32dbc48de82afdd463) ci(deps): bump actions/download-artifact from 5 to 6

## PR 27

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates](https://github.com/iconix/fortudo/pull/27) · closed

- [4061fd24](https://github.com/iconix/fortudo/commit/4061fd24714704db2ceac184555112861a01508f) chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates

## PR 28

[Refactor v2: Complete test coverage, module extraction, and code quality improvements](https://github.com/iconix/fortudo/pull/28) · merged

- [8afd106f](https://github.com/iconix/fortudo/commit/8afd106f061191deba33b75f28011f477ef60473) refactor: improve code quality and enable tests
- [50678abc](https://github.com/iconix/fortudo/commit/50678abca9f4546d2351f6c0416f6c5881c523c2) test: fix legacy test suite for refactored codebase
- [6561f617](https://github.com/iconix/fortudo/commit/6561f617369a9121f8dee83e62e4bb9f8dc939bd) test: fix DOM handler tests for refactored architecture
- [a079121d](https://github.com/iconix/fortudo/commit/a079121de80abb1671c6abfc3dc90526f5c581ba) test: fix time format validation error message
- [4cf2abaa](https://github.com/iconix/fortudo/commit/4cf2abaa7c7ef5890083d8a82d9aae4f97d52f4b) test: fix test infrastructure for refactored architecture
- [7a31a88e](https://github.com/iconix/fortudo/commit/7a31a88e111e19a8a602f2532dbeb560da877860) test: update integration tests to new format and messages
- [17c7b87d](https://github.com/iconix/fortudo/commit/17c7b87d17712920296dee621f3cd28ed15dff05) test: fix all test suites for refactored architecture
- [ea2808e0](https://github.com/iconix/fortudo/commit/ea2808e0a37d0578b8bf114742d264629249833c) refactor: extract focused modules and remove AI slop
- [709a853a](https://github.com/iconix/fortudo/commit/709a853a997f6351b768f76be457f999228d8acc) chore: add .claude to gitignore

## PR 29

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 4 updates](https://github.com/iconix/fortudo/pull/29) · closed

- [ed25974f](https://github.com/iconix/fortudo/commit/ed25974fbc23bd9367abe2c2724400c000eb34b0) chore(deps-dev): bump the minor-and-patch group across 1 directory with 4 updates

## PR 30

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/30) · closed

- [11514272](https://github.com/iconix/fortudo/commit/11514272130014fc233346b8ec6528f08e12a521) chore: update dependencies

## PR 31

[ci(deps): bump peter-evans/create-pull-request from 7 to 8](https://github.com/iconix/fortudo/pull/31) · merged

- [2b671d6f](https://github.com/iconix/fortudo/commit/2b671d6faf2beadfc406eb8562434e5f499d1c59) ci(deps): bump peter-evans/create-pull-request from 7 to 8

## PR 32

[ci(deps): bump actions/checkout from 5 to 6](https://github.com/iconix/fortudo/pull/32) · merged

- [973cbfcb](https://github.com/iconix/fortudo/commit/973cbfcb3188c011c545440ab850ad866adc0650) ci(deps): bump actions/checkout from 5 to 6

## PR 33

[ci(deps): bump actions/upload-artifact from 4 to 6](https://github.com/iconix/fortudo/pull/33) · merged

- [8a3cc171](https://github.com/iconix/fortudo/commit/8a3cc17171a9233e17db61f5d3bb7d5087fca0f6) ci(deps): bump actions/upload-artifact from 4 to 6

## PR 34

[chore(deps-dev): bump the minor-and-patch group with 4 updates](https://github.com/iconix/fortudo/pull/34) · merged

- [6ab78ded](https://github.com/iconix/fortudo/commit/6ab78ded021640bf2593c22e082b84227fdefcbf) chore(deps-dev): bump the minor-and-patch group with 4 updates
- [e28f5f7c](https://github.com/iconix/fortudo/commit/e28f5f7cb18588ab49f0807f601156b98366b7a7) ci: skip deploy preview for dependabot PRs

## PR 35

[fix: resolve multiple UI and scheduling bugs](https://github.com/iconix/fortudo/pull/35) · merged

- [4c6dba7d](https://github.com/iconix/fortudo/commit/4c6dba7daa205e59e29aba015814706dfb413191) fix: resolve multiple UI and scheduling bugs
- [702a4e50](https://github.com/iconix/fortudo/commit/702a4e50a2289cc1f93566ddcb18826823a59072) chore: add coverage check to pre-commit hook

## PR 36

[feat: add Playwright E2E tests](https://github.com/iconix/fortudo/pull/36) · merged

- [9124b82c](https://github.com/iconix/fortudo/commit/9124b82cbc9bf72851090ec13b6ab368e5db8ab3) feat: add Playwright E2E tests for visual, functional, and UI interaction testing
- [bb622299](https://github.com/iconix/fortudo/commit/bb6222995f2a2add49d62978ccbfd8923cdcccf7) fix: move server helper to committed scripts/e2e_server.py

## PR 37

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/37) · merged

- [5255c05f](https://github.com/iconix/fortudo/commit/5255c05f0a1099d3b37e450e6eaaad163ac8ef0a) chore: update dependencies

## PR 38

[refactor: decompose app.js and address architecture weaknesses](https://github.com/iconix/fortudo/pull/38) · merged

- [f6a9b114](https://github.com/iconix/fortudo/commit/f6a9b1141fb7cefb5724d4c23826833ca0466905) refactor: decompose app.js and address architecture weaknesses

## PR 39

[feat: add visual gap indicators between scheduled tasks](https://github.com/iconix/fortudo/pull/39) · merged

- [95b47006](https://github.com/iconix/fortudo/commit/95b470066cc477dd537dc89521f3f464114dcc89) feat: add visual gap indicators between scheduled tasks
- [470089bd](https://github.com/iconix/fortudo/commit/470089bdd13ab7beca8374f5ac745edb505b84d1) test: add Playwright E2E tests for gap indicators
- [318cf37d](https://github.com/iconix/fortudo/commit/318cf37db793a1833f341ee79cc235d92cbf5ba5) feat: add "you are here" boundary markers at schedule edges
- [8039b25a](https://github.com/iconix/fortudo/commit/8039b25a8b82db3f73e88cd29ebe59cea68a3ec7) fix: wait for refresh interval in boundary marker E2E test
- [e1ba7d36](https://github.com/iconix/fortudo/commit/e1ba7d36e8b7a0496731fe123b61e59ece6a626c) fix: use dynamic future times in gap indicator E2E tests
- [a29491fd](https://github.com/iconix/fortudo/commit/a29491fd636e815756466b60937489dc0ce90438) chore: update CI node matrix from 18.x/20.x to 20.x/22.x
- [7422b40b](https://github.com/iconix/fortudo/commit/7422b40b46b6891c1f6ba421d8661190cfbf4326) fix: use non-roundable time in delete-all integration test
- [ee9dec7a](https://github.com/iconix/fortudo/commit/ee9dec7a2a00b60abcc76a1ca018922217fb6af0) fix: use dynamic future times in visual inspection and UI interaction E2E tests

## PR 40

[feat: local-first sync with PouchDB and room codes](https://github.com/iconix/fortudo/pull/40) · merged

- [1f4dd885](https://github.com/iconix/fortudo/commit/1f4dd88525fff1e40964c9bf7b56cd045cf61504) chore: add .worktrees/ to .gitignore
- [a367b258](https://github.com/iconix/fortudo/commit/a367b258c136312fc1fcb95579b8e706258b33b9) refactor: remove dead drag-and-drop reorder code
- [e00c7d0c](https://github.com/iconix/fortudo/commit/e00c7d0c723045c7e7bdd51727fd4da046dfb521) chore: add pouchdb and pouchdb-adapter-memory dev dependencies
- [bb266583](https://github.com/iconix/fortudo/commit/bb26658326ac7fddcfd5914a6744c3de622e6427) feat: rewrite storage.js with PouchDB backend (TDD)
- [b3306c54](https://github.com/iconix/fortudo/commit/b3306c54960bd2880f099bb9289845b9b2af3ce7) refactor: switch task-manager.js to individual storage operations
- [c81eae6f](https://github.com/iconix/fortudo/commit/c81eae6fcab36dc9e064a30acdba9e8ca00169ac) feat: add room code manager for multi-room support
- [d4b308d9](https://github.com/iconix/fortudo/commit/d4b308d99870845c0718e9b6ccbd6f6a7fae9f18) feat: add sync manager for CouchDB replication
- [d6131127](https://github.com/iconix/fortudo/commit/d6131127df8b6175ac4d5c43ee39f658815a2266) feat: wire storage operations to sync manager
- [445bf8d9](https://github.com/iconix/fortudo/commit/445bf8d9ac78fa48d02452601f16676a0f6f4edf) feat: add room code UI and PouchDB CDN integration
- [983fae5f](https://github.com/iconix/fortudo/commit/983fae5febaf29c3b617624ac9ad585c6afe0a51) refactor: extract room UI and sync status from app.js into handler
- [5b39a5f4](https://github.com/iconix/fortudo/commit/5b39a5f4c2379ed177a990148a40aefd5382d354) refactor: move confirmation-helpers.js out of handlers/
- [1807df31](https://github.com/iconix/fortudo/commit/1807df31e26d427b4aa17c11888725ca400a50c4) docs: add dom-handler rename to repo tasks
- [2dbd0725](https://github.com/iconix/fortudo/commit/2dbd0725f24db37bc56d5b8d8b03e85f7ed098bc) test: update E2E tests for room code and PouchDB
- [948e8c41](https://github.com/iconix/fortudo/commit/948e8c41800ce925e6c8a92639cc62f270440f39) fix: auto-manage server lifecycle in E2E test runner
- [3808118b](https://github.com/iconix/fortudo/commit/3808118b165606e0d58cb56d94b43273365d8971) fix: prevent midnight-crossing flakiness in gap indicator E2E tests
- [38176559](https://github.com/iconix/fortudo/commit/38176559eeebacb5121779d9b901c426207d9f1f) fix: resolve CI E2E failure and CodeQL XSS warning
- [50ee4a87](https://github.com/iconix/fortudo/commit/50ee4a870fb6c3bc2ba8358f3e3d03b17c91adcc) fix: address code review issues from v3 sync implementation
- [7e6857ba](https://github.com/iconix/fortudo/commit/7e6857ba19a29c230f421efd50b86c30923b3982) merge: resolve conflicts with origin/main
- [7cfd8bd8](https://github.com/iconix/fortudo/commit/7cfd8bd847dc537a22c8dbc97eb0de4dafd56319) docs: remove Fly.io references, use generic hosting language
- [1752a335](https://github.com/iconix/fortudo/commit/1752a33576f306c513821443876201f7938e77be) feat: wire CouchDB config, update README tasks, add setup docs
- [2921537d](https://github.com/iconix/fortudo/commit/2921537d5cfdaa4389a37a818b475f3842b594a9) fix: use dynamic import for config.js to handle missing file in CI
- [614d5e74](https://github.com/iconix/fortudo/commit/614d5e7485d7f22f67524911541d1f102b10b2a0) fix: add room setup to overlap warnings E2E test
- [c173d12f](https://github.com/iconix/fortudo/commit/c173d12f3c3d3d694c984a0cae0785cb27ba04b5) Update CouchDB setup and CI config
- [40462e3e](https://github.com/iconix/fortudo/commit/40462e3e53c57ced397492208e13f823632307a1) Isolate preview sync data
- [c4d021c0](https://github.com/iconix/fortudo/commit/c4d021c0cb1b2106465446ef6aa9ed3a0967ad97) Fix npm audit via overrides
- [552bf30f](https://github.com/iconix/fortudo/commit/552bf30fa7b7b774f41e881b6d25e520454a80e3) Fix CI config generation and note jsdom upgrade
- [649adc85](https://github.com/iconix/fortudo/commit/649adc8565d8ebc5e920b859f7b339d801a548c3) test: stabilize time-dependent overlap tests
- [9d0c08c0](https://github.com/iconix/fortudo/commit/9d0c08c0f9920da9f160ee464abef49dcd7226c2) chore: enforce LF via gitattributes
- [4c361403](https://github.com/iconix/fortudo/commit/4c361403d5d07faabf6f466859e2dbe77f761010) fix: allow preview CSP for assets
- [513850dc](https://github.com/iconix/fortudo/commit/513850dc1d7ecfc63c3947509c8d04ee01da37d2) test: freeze time in overlap e2e
- [ebd5fa63](https://github.com/iconix/fortudo/commit/ebd5fa6382bd2b7e5e3c02e43ff8c9d92dfd69c9) test: avoid Date.now collisions in overlap e2e

## PR 41

[ci(deps): bump actions/setup-python from 5 to 6](https://github.com/iconix/fortudo/pull/41) · merged

- [1d408e92](https://github.com/iconix/fortudo/commit/1d408e9282de40af132fc4996fa43446048971ca) ci(deps): bump actions/setup-python from 5 to 6
- [b9be913f](https://github.com/iconix/fortudo/commit/b9be913f5b18b5cb396b6cd29675927480229a42) Merge branch 'main' into dependabot/github_actions/actions/setup-python-6

## PR 42

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/42) · merged

- [c941477c](https://github.com/iconix/fortudo/commit/c941477c48a80310c71af5f86606cac7f02d23df) chore: update dependencies
- [30cfdb46](https://github.com/iconix/fortudo/commit/30cfdb461417ef34cd87a45d72d5b0169ce91351) Merge branch 'main' into chore/dependency-updates
- [80e498a5](https://github.com/iconix/fortudo/commit/80e498a5902c34cc13914cead59a8714f5bd8476) Merge branch 'main' into chore/dependency-updates

## PR 43

[feat: schedule tasks in gaps with live overlap warnings](https://github.com/iconix/fortudo/pull/43) · merged

- [1df0eaa4](https://github.com/iconix/fortudo/commit/1df0eaa4c4d8dc9118f0171dbe4724de21757bf2) feat: click schedule gaps to pick unscheduled tasks for scheduling
- [de1d1447](https://github.com/iconix/fortudo/commit/de1d144762c82feb77fd267f7bbe828e790349af) fix: update E2E test 4 to check role=button instead of aria-hidden
- [433ffc49](https://github.com/iconix/fortudo/commit/433ffc4925b03778c0533b7f3893bef9d793d8da) feat: add + icon to gap indicators as visual click affordance
- [6b5ca263](https://github.com/iconix/fortudo/commit/6b5ca263a12f8c1d7bb957e3dbdec732208b0cf7) fix: resolve timezone bug in date extraction and improve gap indicator UX
- [7877a58d](https://github.com/iconix/fortudo/commit/7877a58d7ce0c29fcb15d6145140c8583e71a753) feat: add live end time hint while setting duration
- [0e927148](https://github.com/iconix/fortudo/commit/0e9271484c98647f7861b8b462529e014626283f) feat: add live overlap warnings and skip redundant reschedule confirmation
- [33c8c388](https://github.com/iconix/fortudo/commit/33c8c38815c707313110e5ebb68281c24cad024e) test: add E2E tests for overlap warnings, gap picker, and end-time hints
- [11ac7f17](https://github.com/iconix/fortudo/commit/11ac7f177fa7f9a376416423cc16098a60ae0976) fix: add Enter key support for unscheduled inline edit forms

## PR 44

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/44) · merged

- [43214f0e](https://github.com/iconix/fortudo/commit/43214f0e671272c300b64b79c340b5504d061e3d) chore: update dependencies
- [eb3401c8](https://github.com/iconix/fortudo/commit/eb3401c83fdd382ea3edbb4b81a4d1bab56cd2d2) Merge origin/main into chore/dependency-updates

## PR 45

[ci(deps): bump actions/download-artifact from 7 to 8](https://github.com/iconix/fortudo/pull/45) · merged

- [cc44dd2f](https://github.com/iconix/fortudo/commit/cc44dd2f15f820f9513cb1cf9e34e6f62fa46c03) ci(deps): bump actions/download-artifact from 7 to 8
- [930be701](https://github.com/iconix/fortudo/commit/930be70140f4dfaa188f58c398ec674b88dff611) Merge remote-tracking branch 'origin/main' into dependabot/github_actions/actions/download-artifact-8

## PR 46

[ci(deps): bump actions/upload-artifact from 6 to 7](https://github.com/iconix/fortudo/pull/46) · merged

- [372a9545](https://github.com/iconix/fortudo/commit/372a9545cb120de60b01eddff3fdb00eadbb67fd) ci(deps): bump actions/upload-artifact from 6 to 7
- [869afd70](https://github.com/iconix/fortudo/commit/869afd7081f15d3dbf8487d4a4a52a8f366735aa) Merge remote-tracking branch 'origin/main' into dependabot/github_actions/actions/upload-artifact-7
- [59fb2435](https://github.com/iconix/fortudo/commit/59fb24351217ab33dbcbc78f7747db8e7a364c60) Merge remote-tracking branch 'origin/main' into dependabot/github_actions/actions/upload-artifact-7

## PR 47

[chore: v3 cleanup (dom renderer rename + jest 30)](https://github.com/iconix/fortudo/pull/47) · merged

- [5b9d43e0](https://github.com/iconix/fortudo/commit/5b9d43e0f179fa0f41f7d9d052f660e042db70d6) refactor: rename dom-handler to dom-renderer
- [ba49da73](https://github.com/iconix/fortudo/commit/ba49da7311683026f95b23f481e898cca278c16b) chore: upgrade jest jsdom v30 and remove overrides
- [88adf9e1](https://github.com/iconix/fortudo/commit/88adf9e1ccabc4eb4296c53813653dbb5af79a96) chore: update lockfile after removing overrides

## PR 48

[fix: refresh tasks after non-local changes](https://github.com/iconix/fortudo/pull/48) · merged

- [11417198](https://github.com/iconix/fortudo/commit/114171982debaa9fc33bcfe33c07ee77d435a342) fix: refresh tasks after sync
- [348d0375](https://github.com/iconix/fortudo/commit/348d0375a9dc57a5b678a0cdd5ff1854a5945dac) fix: refresh from storage on non-local changes
- [a97a95df](https://github.com/iconix/fortudo/commit/a97a95df1c9c8b2b2921cf67a71a4a797768e46f) test: cover non-local refresh lifecycle
- [7341ea4b](https://github.com/iconix/fortudo/commit/7341ea4bfb85cace7526b444f56c5b56a6d440cc) fix: avoid re-saving tasks after storage refresh
- [c2575512](https://github.com/iconix/fortudo/commit/c2575512c9bba39efcefb3d1040081adf9940b8d) fix: sync on window focus
- [7ed449a4](https://github.com/iconix/fortudo/commit/7ed449a4b0d09a9a9a65cf3c062c5b631fa9a233) feat: allow manual sync from status button

## PR 49

[fix: polish task scheduling ui flows](https://github.com/iconix/fortudo/pull/49) · merged

- [f888b621](https://github.com/iconix/fortudo/commit/f888b621ba34d0209add54571d9133d2548d1fba) fix: polish task scheduling ui flows
- [69cd8b17](https://github.com/iconix/fortudo/commit/69cd8b1722268e13c13bcf805a1b2d6e43beea78) fix: refine clear actions ui

## PR 50

[ci(deps): bump dorny/paths-filter from 3 to 4](https://github.com/iconix/fortudo/pull/50) · merged

- [26db0644](https://github.com/iconix/fortudo/commit/26db0644c4fac5f3aaf72de3002cab7d518177c8) ci(deps): bump dorny/paths-filter from 3 to 4

## PR 51

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/51) · closed

- [43214f0e](https://github.com/iconix/fortudo/commit/43214f0e671272c300b64b79c340b5504d061e3d) chore: update dependencies
- [eb3401c8](https://github.com/iconix/fortudo/commit/eb3401c83fdd382ea3edbb4b81a4d1bab56cd2d2) Merge origin/main into chore/dependency-updates
- [81a040ad](https://github.com/iconix/fortudo/commit/81a040adf16eee4d4becaa5be572a09d197d04a6) Merge remote-tracking branch 'origin/main' into chore/dependency-updates

## PR 52

[Implement activities groundwork through coordinator phase 1.7](https://github.com/iconix/fortudo/pull/52) · merged

- [bc696414](https://github.com/iconix/fortudo/commit/bc6964145c3af5d0a8d7cf02c441ef662dd1326c) refactor: move task files into tasks/ directory, rename room-ui-handler to room-renderer
- [b0630852](https://github.com/iconix/fortudo/commit/b063085222c634e75a2d0ca00a4e760252344c3c) refactor: move task files into tasks/ directory, rename room-ui-handler to room-renderer
- [9d04bda9](https://github.com/iconix/fortudo/commit/9d04bda923bdd23544b0a7b8d9c346b312da2425) docs: align guidance with tasks reorganization
- [b877c40b](https://github.com/iconix/fortudo/commit/b877c40b9fe324bf7175d7d653ecbe1ff7c4dcaf) feat: add toast-manager for non-blocking notifications (TDD)
- [f2fd485e](https://github.com/iconix/fortudo/commit/f2fd485e2787ea5d4718767701ddfb8a096f969d) test: align toast cleanup with toast-manager spec
- [ab1633c3](https://github.com/iconix/fortudo/commit/ab1633c31c4c3ba7e0f8c9ff04bf5cec3bb95e2e) refactor: migrate non-blocking showAlert calls to showToast
- [5e0abfb5](https://github.com/iconix/fortudo/commit/5e0abfb5542058fc2040b10af8180f1fb2086d45) test: cover toast migrations in task flows
- [61765f2b](https://github.com/iconix/fortudo/commit/61765f2baa349f2cbecbd257c9515e22bc9e203f) feat: add app-coordinator for centralized post-action orchestration (TDD)
- [aa81800e](https://github.com/iconix/fortudo/commit/aa81800e6906854d71005b7f4d22c8782e21e15d) refactor: wire scheduled handlers to app-coordinator
- [481db16c](https://github.com/iconix/fortudo/commit/481db16cc3c22afd37154432a260cf8d22817a97) refactor: wire remaining handlers to app-coordinator
- [470c146a](https://github.com/iconix/fortudo/commit/470c146a2e68d0fc15f415ff5be8f10350034c99) fix: restore unscheduled coordinator success flows
- [0d96d7bc](https://github.com/iconix/fortudo/commit/0d96d7bca9face8344eb5d370bf049b76787b253) feat: add day-boundary detection to 1-second interval
- [e76d0a93](https://github.com/iconix/fortudo/commit/e76d0a93eb55f77cc45a5b2fd9be7a1d2e9aec8f) test: align e2e checks with current clear-task flows
- [a9fa041d](https://github.com/iconix/fortudo/commit/a9fa041ddac11eaeea368102e5f1a5852f32be0f) refactor: remove duplicate start-time updates from coordinator
- [e9c39615](https://github.com/iconix/fortudo/commit/e9c396151d2782a04b002d393143a897e65931e8) refactor: normalize task mutation result contracts
- [7a111669](https://github.com/iconix/fortudo/commit/7a1116692107f432d260611400ea8e0c12f2e127) refactor: make task orchestration boundaries consistent
- [f85f5e79](https://github.com/iconix/fortudo/commit/f85f5e795a100d1d11de4ed8290397c2671780f2) refactor: make local mode config explicit
- [03e70547](https://github.com/iconix/fortudo/commit/03e70547c2bbf1c728c2b0be22120313cc07a1aa) refactor: clarify clear-task control naming
- [9c579fc9](https://github.com/iconix/fortudo/commit/9c579fc9d1a9f286a588972b5ae7905672c781e9) refactor: remove placeholder day-boundary hook
- [deaab75f](https://github.com/iconix/fortudo/commit/deaab75f66eec873e63e24615e37a6bd2283aa8d) docs: clarify future day-rollover behavior
- [faf8ab74](https://github.com/iconix/fortudo/commit/faf8ab744d06550563cb87440d11a1d408e0bbd3) docs: move plans into repo and align agent guidance
- [e250e519](https://github.com/iconix/fortudo/commit/e250e519f5a408f41ef5442b9672e0945adab56c) refactor: harden semantic task coordinator boundary
- [f6c90cb2](https://github.com/iconix/fortudo/commit/f6c90cb2e67d5fc612278ee9a0e35b7ede9e622b) docs: align coordinator architecture notes
- [e8b10590](https://github.com/iconix/fortudo/commit/e8b10590c72f272adae3195c68946683824f07c9) docs: refresh architecture assessment
- [dcb7e824](https://github.com/iconix/fortudo/commit/dcb7e8247c36129b95abc356d17fddab94af096f) test: raise coverage thresholds

## PR 53

[feat: implement activities phase 2 storage](https://github.com/iconix/fortudo/pull/53) · merged

- [e260f70a](https://github.com/iconix/fortudo/commit/e260f70a78b34c00976d3b86f86cf1a24d1065ad) feat: scope loadTasks and saveTasks to docType 'task' (TDD)
- [67956f33](https://github.com/iconix/fortudo/commit/67956f33cf0db4c33242a5cdc7ceabae6fe2432c) fix: respect defined docType in task scoping
- [707745ca](https://github.com/iconix/fortudo/commit/707745ca905afbc29d887d017edc303168111aa7) feat: add idempotent docType migration for legacy documents (TDD)
- [456f158e](https://github.com/iconix/fortudo/commit/456f158eeba511e8167ae873aa4be7c63e7694df) fix: trigger sync after docType migration
- [787e83bc](https://github.com/iconix/fortudo/commit/787e83bc677f829ecdf07dc8e672a7ae385b4492) feat: add activity CRUD storage functions (TDD)
- [219d5143](https://github.com/iconix/fortudo/commit/219d514319ab94d2e835931e0016e308b5486e00) fix: isolate activity rev tracking
- [f7c48205](https://github.com/iconix/fortudo/commit/f7c4820596b3d8ff49ab1f983f8ce7f9d2764f7c) feat: add config document CRUD storage functions (TDD)
- [a80dc9a6](https://github.com/iconix/fortudo/commit/a80dc9a6df9b9342b3abf2f71c2353d835205e60) feat: wire docType migration into app boot sequence
- [b0e19714](https://github.com/iconix/fortudo/commit/b0e19714970f4f9f2b34b121913c22e1bc40c4a2) feat: wire docType migration into app boot sequence
- [c514845f](https://github.com/iconix/fortudo/commit/c514845f9184c47e7389e02fc045f3d1df7bdd83) feat: enforce docType 'task' on putTask
- [05d02d45](https://github.com/iconix/fortudo/commit/05d02d4581d41954ff8854b37b9f368464ee6d38) fix: stamp docType on saveTasks
- [3c529329](https://github.com/iconix/fortudo/commit/3c529329bbaf3abc5017e11e50b193246f6f3b6f) fix: address phase 2 verification issues
- [8544cba1](https://github.com/iconix/fortudo/commit/8544cba1cbfc9976c3dd2a3cfbb6f786a3274c74) docs: add phase 2 storage plan
- [c3f6443a](https://github.com/iconix/fortudo/commit/c3f6443a71dfc65b8371a72caf57afa28029d128) fix: bump flatted lockfile for audit
- [b6f67bb7](https://github.com/iconix/fortudo/commit/b6f67bb7019fb3d3cd0c5e9cd2d3ed814a1b9a38) refactor: streamline typed storage handling
- [2f0bd660](https://github.com/iconix/fortudo/commit/2f0bd660db47079123401eec8a936e21f298673a) Fix preview sync handoff during room switches
- [dcf53f8a](https://github.com/iconix/fortudo/commit/dcf53f8a9c640fa1073e914e04e47c73831bf133) Harden preview Playwright smoke for hosted timing
- [884e32fe](https://github.com/iconix/fortudo/commit/884e32feb7f97dd5a90ac49632e17f4ea668d311) Move roadmap history out of README
- [66d8adab](https://github.com/iconix/fortudo/commit/66d8adab4f4e9f331b27e46d9d23b0bd9e3a99ea) Add synced preview coverage to smoke test
- [921fab07](https://github.com/iconix/fortudo/commit/921fab07288f5d946b3e456c57b636a40b7ecd7b) Polish preview smoke demo and delete flows
- [a9647c7f](https://github.com/iconix/fortudo/commit/a9647c7fbf95a99a68839e20a6116d740f8962ff) Format task form listener cleanup
- [0250e26d](https://github.com/iconix/fortudo/commit/0250e26d6e5b5f9fe48970bd903d43c45808f085) Refine preview smoke demo startup

## PR 54

[chore(deps-dev): bump @babel/preset-env from 7.29.0 to 7.29.2 in the minor-and-patch group across 1 directory](https://github.com/iconix/fortudo/pull/54) · merged

- [df9654f1](https://github.com/iconix/fortudo/commit/df9654f1c126fdeb3f7023b389f30861bddac39e) chore(deps-dev): bump @babel/preset-env in the minor-and-patch group

## PR 55

[chore: automated dependency updates](https://github.com/iconix/fortudo/pull/55) · closed

- [6c613266](https://github.com/iconix/fortudo/commit/6c6132668541966f6902cca941f39c1fb2cb9f95) chore: update dependencies

## PR 56

[feat: implement activities phase 3 settings and categories](https://github.com/iconix/fortudo/pull/56) · merged

- [34dd8739](https://github.com/iconix/fortudo/commit/34dd8739e254245b0871017189b23d1443b6587d) feat: implement activities phase 3 settings and categories
- [0fad12d3](https://github.com/iconix/fortudo/commit/0fad12d39b6cf20c7fc187da4782010e598567f7) docs: add activities phase 3.5 design
- [0e5c34bc](https://github.com/iconix/fortudo/commit/0e5c34bcddf475474dc10bbb84908baa265157d3) docs: refine activities phase 3.5 design
- [202e68e9](https://github.com/iconix/fortudo/commit/202e68e91734a280097496aaa8ea656c157f4be0) docs: add activities phase 3.5 implementation plan
- [3a7ea0f8](https://github.com/iconix/fortudo/commit/3a7ea0f84c984c9bfe3fffeef274f81f870df6b3) feat: add category color family utilities
- [316b9e7e](https://github.com/iconix/fortudo/commit/316b9e7e83c288fd746d9c1a94eca4deef6b31de) fix: harden category color family utilities
- [aefceef8](https://github.com/iconix/fortudo/commit/aefceef81ebd6a610e8cac91fbf6101b391329b4) fix: deep-freeze category color families
- [ceb4e03d](https://github.com/iconix/fortudo/commit/ceb4e03dbb0c848b444f4da9c1ceece3a60324cf) test: cover all category color families
- [de70631d](https://github.com/iconix/fortudo/commit/de70631d5e9a225ddf6195963639dd381d1068db) feat: add phase 3.5 taxonomy manager and migration
- [81de1879](https://github.com/iconix/fortudo/commit/81de18795b8d54064cdfcae027f0b3387701c71e) fix: expose standalone groups to legacy category consumers
- [7f26001d](https://github.com/iconix/fortudo/commit/7f26001d30d63c0db1b255989963386e4b830016) fix: preserve legacy taxonomy compatibility paths
- [51041363](https://github.com/iconix/fortudo/commit/5104136303a7ee7f98d2e84ce57f15c17b3dc411) fix: resolve legacy dropdown indicators for group keys
- [19034a65](https://github.com/iconix/fortudo/commit/19034a653bd91b7966116004bd13e0f8ab9c3c9a) feat: add phase 3.5 groups and linked category settings ui
- [d4ee2029](https://github.com/iconix/fortudo/commit/d4ee20296261c82620750fb02274c90f69153ef1) fix: harden phase 3.5 settings taxonomy refresh
- [c887e746](https://github.com/iconix/fortudo/commit/c887e746ef24866d19e3c4daa28b7d816564254d) feat: wire phase 3.5 taxonomy into dropdowns and badges
- [fd668b4a](https://github.com/iconix/fortudo/commit/fd668b4abd1a2182ed0ac9fafcafc0504ce62ff1) test: cover phase 3.5 taxonomy integration
- [307e2479](https://github.com/iconix/fortudo/commit/307e24791eb6cb5310a2b691c02b6972a334a95c) docs: add phase 3.7 refactor plan guidance
- [786b71d8](https://github.com/iconix/fortudo/commit/786b71d8d5ff3b24709c698b0deed83ecff2502e) refactor: extract taxonomy store and selectors
- [27c51527](https://github.com/iconix/fortudo/commit/27c51527d6973eeb92dfe620ee3db81475f67586) refactor: extract taxonomy mutation operations
- [4adf1549](https://github.com/iconix/fortudo/commit/4adf15499c3fe7285d35099e94aa117a4e015c4b) refactor: extract taxonomy settings module
- [a84bedb2](https://github.com/iconix/fortudo/commit/a84bedb23c9ad27a3ce23d044d571ddb4fbaf8b6) refactor: simplify taxonomy refresh wiring
- [afa52bdf](https://github.com/iconix/fortudo/commit/afa52bdf21190de8b0ea2858cd3d16d90f132216) fix: restore visible taxonomy dropdown nesting
- [d0b97a10](https://github.com/iconix/fortudo/commit/d0b97a100836cd50c75958822627e31b8eef18ea) refactor: streamline taxonomy settings add flow
- [c3babea9](https://github.com/iconix/fortudo/commit/c3babea9fbd8551f081312f92f204059d8196831) style: improve taxonomy badge contrast
- [c6719999](https://github.com/iconix/fortudo/commit/c6719999c360b4184dff0b688ef632bc4f2fd7d3) fix: stabilize preview smoke and unscheduled delete UX

## PR 57

[chore: simplify dependency update automation](https://github.com/iconix/fortudo/pull/57) · merged

- [c1af02e0](https://github.com/iconix/fortudo/commit/c1af02e05dbdb8b6ab04656994b6b6886aa03c07) chore: simplify dependency update automation

## PR 58

[ci(deps): bump codecov/codecov-action from 5 to 6](https://github.com/iconix/fortudo/pull/58) · merged

- [9fa874d3](https://github.com/iconix/fortudo/commit/9fa874d36d711ef74dc1d1577fe44e6d3a770f07) ci(deps): bump codecov/codecov-action from 5 to 6

## PR 59

[Phase 3.9 cleanup: remove taxonomy facade and migrate Activities settings](https://github.com/iconix/fortudo/pull/59) · merged

- [617a221b](https://github.com/iconix/fortudo/commit/617a221be19a643f7c0087c5457fc849711e232f) feat: move renderCategoryBadge to taxonomy-selectors
- [bbdc2672](https://github.com/iconix/fortudo/commit/bbdc2672393b1a71b399823681fa367b44a50fb3) refactor: rewire source imports from facade to taxonomy modules
- [46368385](https://github.com/iconix/fortudo/commit/46368385b242a8c72d8761fd85a18c458b56d6e0) refactor: rewire test imports from facade to taxonomy modules
- [eb694249](https://github.com/iconix/fortudo/commit/eb6942499ced4dc88d71d4d4eed9e502cc8085e3) refactor: delete category-manager.js facade
- [36e8c119](https://github.com/iconix/fortudo/commit/36e8c11963f4624caa1d4847af5969f09471b102) feat: migrate Activities toggle from localStorage to PouchDB
- [c039fcff](https://github.com/iconix/fortudo/commit/c039fcff89f5b553afa6fac0b535cdf2d64d5cf7) feat: wire loadSettings into boot and update callers
- [044fff54](https://github.com/iconix/fortudo/commit/044fff54d91175e8c8618fe816b0ca61b254cab1) docs: add phase 3.9 cleanup implementation plan
- [4c371f6f](https://github.com/iconix/fortudo/commit/4c371f6fde5b96d62e157f534da7154c8d54b132) fix: handle Activities settings persistence failures
- [a38c36f9](https://github.com/iconix/fortudo/commit/a38c36f9c8f061c924fcef43639be6602a0eb605) docs: align activities design with phase 3.9 architecture

## PR 60

[feat: implement phase 4 activity logging](https://github.com/iconix/fortudo/pull/60) · merged

- [a14df3e9](https://github.com/iconix/fortudo/commit/a14df3e9b0e7ff9e906d22d9416127c0fde39b3c) feat: implement phase 4 activity logging
- [0d83617e](https://github.com/iconix/fortudo/commit/0d83617e05551327a3b91933374eb9813da8de1a) docs: add phase 4 activity implementation plans
- [5e8f2a77](https://github.com/iconix/fortudo/commit/5e8f2a77812da82bf82335c084b50ce17b275181) test: cover activity edge cases and auto-log failures
- [9ec539ab](https://github.com/iconix/fortudo/commit/9ec539abf95a337c916189d6b4a5503d5597b92f) refactor: extract activity ui handlers from app
- [08b6182f](https://github.com/iconix/fortudo/commit/08b6182f0a6d8d49fc675bfb85dcd2b830ce23cf) refactor: simplify app coordinator refresh handlers
- [68d342e7](https://github.com/iconix/fortudo/commit/68d342e786918608e6f539bc823f6e3e34984712) refactor: replace activity prompt edits with modal flow
- [e93d7d22](https://github.com/iconix/fortudo/commit/e93d7d22fbb3ba41da9a0da45321c0370dcf47fe) refactor: simplify activity manager and form mode config
- [d51a4e53](https://github.com/iconix/fortudo/commit/d51a4e53566602f58791b8e8104dea8e2fd8a849) fix: harden activity failure handling
- [9b776ff8](https://github.com/iconix/fortudo/commit/9b776ff86e5643faddcf984b7913064c79deebd9) test: add activity preview smoke coverage
- [09e33c26](https://github.com/iconix/fortudo/commit/09e33c26dbb0bbdbd073b94c7af1da1837b431aa) test: fix active-task preview smoke flow
- [61bd79c6](https://github.com/iconix/fortudo/commit/61bd79c67aeb88140fed0bd590e99d930e66754e) test: harden preview smoke timing
- [220673dd](https://github.com/iconix/fortudo/commit/220673ddef35375f92fc58a54ea865496ff48c53) test: wait for activity smoke persistence
- [5d0aacc3](https://github.com/iconix/fortudo/commit/5d0aacc3eb86ed7c20f85b74538eccafadec8254) test: wait for activity edit modal data
- [9dd397de](https://github.com/iconix/fortudo/commit/9dd397dec573fd87a7bb73eac3f0c4b462f5f9de) fix: harden activity edit and smoke coverage
- [778f8621](https://github.com/iconix/fortudo/commit/778f8621f69f0366375886e789a8581929898e95) feat: add inline activity editing
- [cd3ed07b](https://github.com/iconix/fortudo/commit/cd3ed07bd00bd841a4a4db4704b4c55ebe896972) docs: align activity phase plans with implementation
- [7cd2389f](https://github.com/iconix/fortudo/commit/7cd2389f9218edf01b889f46f939f244bf449fe4) docs: move task category parity to phase 4.7

## PR 61

[chore: refresh audited transitive dependencies](https://github.com/iconix/fortudo/pull/61) · merged

- [58f039de](https://github.com/iconix/fortudo/commit/58f039de075c94a1f8c69f11c249fca7880b0039) chore: refresh audited transitive dependencies

## PR 62

[feat: add activity timer workflow](https://github.com/iconix/fortudo/pull/62) · merged

- [48052ffe](https://github.com/iconix/fortudo/commit/48052ffee8ea4971060459f76c9d9880beb7d93d) feat: add activity timer workflow
- [8973ce5d](https://github.com/iconix/fortudo/commit/8973ce5d85a28f6db100aa978c67e31d131a8a31) refactor: extract activity timer modules
- [ab9c07ac](https://github.com/iconix/fortudo/commit/ab9c07acaae10c6e59200844a5091a53b63436c1) test: cover activity timer ui edge cases
- [7972cbab](https://github.com/iconix/fortudo/commit/7972cbab310f0bf4ad25cb3bda1424ca0fa5be4e) wip: checkpoint activity form layout iteration
- [d7da89e0](https://github.com/iconix/fortudo/commit/d7da89e037bd8b11712fbd644aebfddfcae98e81) fix: harden activity timer replacement flow
- [9a74068b](https://github.com/iconix/fortudo/commit/9a74068b3d46479ea1cb06b9c8891cc7d341863f) test: strengthen activities preview smoke coverage
- [2400a6b7](https://github.com/iconix/fortudo/commit/2400a6b7f4d8a1ac69d538c4d0072bbed81d5ab6) fix: stack timer actions on mobile
- [a139d792](https://github.com/iconix/fortudo/commit/a139d7924aaa27d85538268ac172ed6711647722) fix: align activity empty state
- [6b1e7ac1](https://github.com/iconix/fortudo/commit/6b1e7ac1a8ca7765e15a5ae46fb68e35ef5c2a8a) feat: seed activity start time from latest log
- [6ef03987](https://github.com/iconix/fortudo/commit/6ef039875fd1a97beed98ea051ead154372c74cd) feat: add activity category summary bar
- [373424df](https://github.com/iconix/fortudo/commit/373424df700a54be553670838be4f1142376482f) feat: separate next activity timer staging
- [e45f6bc7](https://github.com/iconix/fortudo/commit/e45f6bc7466cccf97c64a612d792fc75feae8561) fix: restore activity mode when timer resumes
- [74c99079](https://github.com/iconix/fortudo/commit/74c990797dd03d4c5df7119819e252ba2678ebb5) fix: polish activity form interactions
- [512691d6](https://github.com/iconix/fortudo/commit/512691d69b8dbb7559eaf3848ce78cf1e74cbb00) feat: show newest activities first
- [1ab2b78d](https://github.com/iconix/fortudo/commit/1ab2b78d06ca47ba5ba5d563d8f776590ee92575) feat: promote unscheduled tasks into current activity
- [b2f718c0](https://github.com/iconix/fortudo/commit/b2f718c0d180153197032781cca89ccb7390050d) docs: add activity summary expansion design
- [cf7ae1d4](https://github.com/iconix/fortudo/commit/cf7ae1d44f1087dc1e4bf7ccc725cfbfb7bc919f) feat: expand activity summary by parent group
- [8ba839d8](https://github.com/iconix/fortudo/commit/8ba839d804a70d122c28f6428959e8554e0a4825) test: stub jsdom alert fallback in app suite
- [cdd31f7a](https://github.com/iconix/fortudo/commit/cdd31f7a18c67e124502925683d2443bf8b47b87) fix: support touch expansion in activity summary
- [fe0bd4ea](https://github.com/iconix/fortudo/commit/fe0bd4ea9badda5cbe6701930a00bade819d5775) fix: refine activity summary unspecified labels
- [6111fb12](https://github.com/iconix/fortudo/commit/6111fb12783ca3b9f70aafb53e24db88d0d87bf0) feat: enrich activity breakdown counts
- [68b50b06](https://github.com/iconix/fortudo/commit/68b50b062e258663d772c134d717e9e2a3ee0724) feat: include live timer in activity breakdown
- [441a04b3](https://github.com/iconix/fortudo/commit/441a04b3a55a74709d9d0a6d76b040225a2476e1) fix: stop running timers at midnight
- [e49b291a](https://github.com/iconix/fortudo/commit/e49b291a07dcc1f77df3fd04846feefd62ed246b) fix: resync timer ui after storage refresh
- [e91e7adc](https://github.com/iconix/fortudo/commit/e91e7adcd2affed499d2e5f6b92bee014a6ddfd6) fix: require confirmation for activity delete
- [729ab2be](https://github.com/iconix/fortudo/commit/729ab2be6fd931736456db8c345b6797cd61ab55) fix: show category dots on activity forms
- [3519e6a2](https://github.com/iconix/fortudo/commit/3519e6a25b665fb4492b1fd7f6f623c83a43a67a) fix: guard duplicate activity edit saves
- [9f64b191](https://github.com/iconix/fortudo/commit/9f64b1916f652ce12966fc65fc6fedb289d33c73) test: make room code coverage deterministic
- [1f090cab](https://github.com/iconix/fortudo/commit/1f090cab0a9c64a4e8fe5b26916e57850ee1edf8) docs: note activities onboarding and PWA follow-up
- [722ffc3e](https://github.com/iconix/fortudo/commit/722ffc3e0e081688a44a6d05c2d8303642469671) refactor: move timer task consumption to handlers
- [5182e8d5](https://github.com/iconix/fortudo/commit/5182e8d57eb422bff3ae8ecaaaf8dfead6ba578f) refactor: extract activity app wiring
- [4f2db1b2](https://github.com/iconix/fortudo/commit/4f2db1b21caa70fd82c8d45867a82e9d37ab6837) refactor: extract activity summary selectors
- [05e0926f](https://github.com/iconix/fortudo/commit/05e0926f21b2a4f3431f1fce103c3e7f1532612e) refactor: consolidate activity ui state
- [c2fec848](https://github.com/iconix/fortudo/commit/c2fec8487145d00ba690f3a3b4c7c8cc4cc18902) refactor: split smoke room scenarios
- [7e514b35](https://github.com/iconix/fortudo/commit/7e514b357e7746a8163e4529849a5d1d8bc3c060) refactor: extract app room session lifecycle
- [840dbae6](https://github.com/iconix/fortudo/commit/840dbae6a15fd8bc3cebcf70d11a7dfa2a98a868) refactor: split activities smoke scenario
- [12414671](https://github.com/iconix/fortudo/commit/1241467136f9b2b2055d3ce4da062d7cb928421d) fix: align timer updates to second boundaries
- [9182188d](https://github.com/iconix/fortudo/commit/9182188d2f55f60f38443e1734ceeead60f0c623) fix: refresh ui after midnight timer stop
- [f2816ef7](https://github.com/iconix/fortudo/commit/f2816ef7475a441a0438c0f2f03f7370ab738843) chore: add timer skew diagnostics
- [db54e656](https://github.com/iconix/fortudo/commit/db54e65658e108ecc6651267691ad3dcae8f720c) chore: replace timer logs with debug helper
- [0744ccb5](https://github.com/iconix/fortudo/commit/0744ccb5891405af923eb5f293f1fc98f3233134) chore: add server-corrected timer debug snapshot
- [4b7a3a55](https://github.com/iconix/fortudo/commit/4b7a3a5564cd1b0709e21acb2d43f40de70f1e12) test: cover timer debug helper fallbacks
- [63bfc9df](https://github.com/iconix/fortudo/commit/63bfc9df1a093849b7dd64f440b50a1c693b49a8) feat: correct timer display for device clock skew
- [6bdf022d](https://github.com/iconix/fortudo/commit/6bdf022df28b7e667064e1ded42582957483179b) docs: note coordinator naming cleanup

## PR 63

[ci(deps): bump actions/github-script from 8 to 9](https://github.com/iconix/fortudo/pull/63) · merged

- [6bd49184](https://github.com/iconix/fortudo/commit/6bd49184e086395279bf8d051b44cc5ae68d2b60) ci(deps): bump actions/github-script from 8 to 9

## PR 64

[chore(deps-dev): bump prettier from 3.8.1 to 3.8.2 in the minor-and-patch group](https://github.com/iconix/fortudo/pull/64) · merged

- [70dc2d73](https://github.com/iconix/fortudo/commit/70dc2d73f99204af3fe7fb8555785e8ca482b943) chore(deps-dev): bump prettier in the minor-and-patch group

## PR 65

[ci: separate production and dev security audits](https://github.com/iconix/fortudo/pull/65) · merged

- [e3597467](https://github.com/iconix/fortudo/commit/e35974678e6bb212ea16fc4e9bc4d60988ca99c1) ci: separate production and dev security audits
- [3c8a5a48](https://github.com/iconix/fortudo/commit/3c8a5a48102cc5e0eba8ddd628a15178b8da6128) ci: surface dev audit as neutral check

## PR 66

[chore(deps-dev): bump prettier from 3.8.2 to 3.8.3 in the minor-and-patch group](https://github.com/iconix/fortudo/pull/66) · closed

- [31bc68d2](https://github.com/iconix/fortudo/commit/31bc68d27a9a7e4c7fbdae3c399d3482d0dedfc6) chore(deps-dev): bump prettier in the minor-and-patch group

## PR 67

[Add category editing parity for tasks](https://github.com/iconix/fortudo/pull/67) · merged

- [8b590db9](https://github.com/iconix/fortudo/commit/8b590db93342fbb6a8c64634c48a7fac6402273d) Add category editing parity for tasks
- [fe6c9211](https://github.com/iconix/fortudo/commit/fe6c921144f9fac550881665565b4c1f31b2a42b) Extract shared category form utilities
- [992318fd](https://github.com/iconix/fortudo/commit/992318fd2ae81e9f364951fa5fd095a4af58005d) Expand preview smoke category edit coverage
- [ca1ef84e](https://github.com/iconix/fortudo/commit/ca1ef84e2def81d0ab9c7a20934db14fd9c7f6fe) Expand preview smoke timer coverage

## PR 68

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 2 updates](https://github.com/iconix/fortudo/pull/68) · closed

- [7c97511e](https://github.com/iconix/fortudo/commit/7c97511ee814c9ed6dce6521250f070e2087abe5) chore(deps-dev): bump the minor-and-patch group across 1 directory with 2 updates

## PR 69

[ci(deps): bump actions/dependency-review-action from 4 to 5](https://github.com/iconix/fortudo/pull/69) · merged

- [79c29370](https://github.com/iconix/fortudo/commit/79c293707579e5c9c4ab10003485deea1f9aab7b) ci(deps): bump actions/dependency-review-action from 4 to 5

## PR 70

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 5 updates](https://github.com/iconix/fortudo/pull/70) · closed

- [79f12bc8](https://github.com/iconix/fortudo/commit/79f12bc8cf409a0f8cd8e2974ee8b119605887ec) chore(deps-dev): bump the minor-and-patch group across 1 directory with 5 updates

## PR 71

[Add Phase 5 activities insights view](https://github.com/iconix/fortudo/pull/71) · merged

- [b42c1c51](https://github.com/iconix/fortudo/commit/b42c1c51f508fb13a2ec1e3e2f415668cf9b2d4d) feat: add activity insights model selectors
- [75342a5f](https://github.com/iconix/fortudo/commit/75342a5fcf6fbb1c04af5ffdd6810859bdc89083) fix: normalize running activity insights
- [b0fd023f](https://github.com/iconix/fortudo/commit/b0fd023fbef46e873f828e7d8c635877982176cd) fix: sort activity log by completion time
- [a8245c31](https://github.com/iconix/fortudo/commit/a8245c31f25ad5a4a148bf4444a0344ee75b1c73) Fix running timer insights normalization
- [bebbdb1d](https://github.com/iconix/fortudo/commit/bebbdb1d5e7f0bb7cc2c4f17203e4441c14f2d6d) Fix insights midnight crossing buckets
- [7cd0d95f](https://github.com/iconix/fortudo/commit/7cd0d95f43bc9a4199f0927e78e3056d635cedbe) feat: add activities insights view shell
- [d0891fcf](https://github.com/iconix/fortudo/commit/d0891fcf3d2134d3cd7b99fc943cc9c5ff36240c) Align test DOM clear controls layout
- [1967fac9](https://github.com/iconix/fortudo/commit/1967fac96e8afb7ffc461d8e4423ad92ce4b66bc) feat: add activities tasks-insights view toggle
- [dcd3312f](https://github.com/iconix/fortudo/commit/dcd3312f662373b1893c9a698e71800ffb5f850e) test: cover activity view toggle spec gaps
- [108cf1cf](https://github.com/iconix/fortudo/commit/108cf1cfe3a59736cc558cb6ff847100a5ffb51a) Fix activity view toggle regressions
- [c9b1b6f5](https://github.com/iconix/fortudo/commit/c9b1b6f53c85ea5500892d3cf1da2b00d1473931) feat: render activities insights summary and timeline
- [775b5059](https://github.com/iconix/fortudo/commit/775b505964b53400a6203a39ee6fa0009fb8081f) Fix insights renderer code quality issues
- [d2a62366](https://github.com/iconix/fortudo/commit/d2a62366882d8da2cdf7ab3aa23e17c9cafa18d4) Add semantic role to insights timeline blocks
- [30863493](https://github.com/iconix/fortudo/commit/30863493195763e5eca5a8d218077a05e48e1730) feat: reuse activity log editing inside insights
- [4ee796aa](https://github.com/iconix/fortudo/commit/4ee796aa4af1881a8cd5106b9a6c59ea69af971c) feat: show activity data issues inline in activity log
- [56a600c0](https://github.com/iconix/fortudo/commit/56a600c017ec155df00ce642d7866397088eb253) Fix insights activity issue merging
- [9e2a0fe1](https://github.com/iconix/fortudo/commit/9e2a0fe189e0622244ad046712a1aefe2cf5eb89) feat: add lightweight trends to activity insights
- [8d241fa0](https://github.com/iconix/fortudo/commit/8d241fa088db012c573dd9cf4ac53ec765b1afcc) Fix activity insights chart geometry
- [6e7b2c73](https://github.com/iconix/fortudo/commit/6e7b2c734811ceb721f678d97f1cb0249af9f703) Preserve insights trends open state
- [16bf089a](https://github.com/iconix/fortudo/commit/16bf089af8abbc7614fcfbb3292b03d1da2bd769) feat: keep active insights view refreshed
- [797da6ce](https://github.com/iconix/fortudo/commit/797da6cebdaaea332e01b060a3b4f40120f4a510) Refresh insights after timer edits
- [134ee8ec](https://github.com/iconix/fortudo/commit/134ee8ec2a84f800fc6963b949a34c277923f783) test: add phase 5 insights smoke coverage
- [9b4fe2fd](https://github.com/iconix/fortudo/commit/9b4fe2fdabe28768c03a9771677fc0e5df911961) docs: add phase 5 insights implementation plan
- [d43fc953](https://github.com/iconix/fortudo/commit/d43fc953501d59b8dcd41ae7c9ccdab9e93935f3) Fix insights activity issue badges
- [486a2dba](https://github.com/iconix/fortudo/commit/486a2dbaeb8173f9c9eed36662e95a225f5b66a0) Refactor activities insights helpers
- [df865aea](https://github.com/iconix/fortudo/commit/df865aeaf269c53d29eabdbf0646b7dbe0cf8546) chore: refresh phase 5 preview
- [e614eb2c](https://github.com/iconix/fortudo/commit/e614eb2c8801e3d316d9098285d031ee8ff76352) Fix stale restored activity timer cleanup
- [9e2b9747](https://github.com/iconix/fortudo/commit/9e2b9747bc286ec217c4ccef9907976938a532d2) Hide taxonomy settings until activities reload
- [18a4913f](https://github.com/iconix/fortudo/commit/18a4913f9afabe55221386dafd38792bea0ab618) Clarify activities reload taxonomy message
- [134ece39](https://github.com/iconix/fortudo/commit/134ece39d0fa1fa1664e101de5f49ac0d7bf285b) Scope insights model to selected day
- [c3593bc9](https://github.com/iconix/fortudo/commit/c3593bc9f31507a63db60b2fedf74c030a80e325) Render selectable insight trend days
- [afc275be](https://github.com/iconix/fortudo/commit/afc275bea36e92804673b1ce1ee2721d21f12796) Wire insight trend day selection
- [38df9cee](https://github.com/iconix/fortudo/commit/38df9cee61f30cf3495a2c5abffa7125f1fa736b) Focus insights timeline on selected day
- [64216e78](https://github.com/iconix/fortudo/commit/64216e7806476cbead1fee3b107041367d58b834) Scope insights activity log to selected day
- [6abda996](https://github.com/iconix/fortudo/commit/6abda996c3bd346e4ab17bc55e2e9d5704d3cca2) Cover responsive insight trend days
- [cfd9cc0e](https://github.com/iconix/fortudo/commit/cfd9cc0e1506420580de005d909e7bea6d730767) Document day-focused insights plan
- [aa18743a](https://github.com/iconix/fortudo/commit/aa18743affca378b319dd1cf9566585f839d6c0c) Align trends UI with day-focused mock
- [f0f0e130](https://github.com/iconix/fortudo/commit/f0f0e1303f973470866a942c35ae7ba93a6d5ac8) Keep trends day cards horizontally scrollable
- [a76431cb](https://github.com/iconix/fortudo/commit/a76431cbe4f3b58fdf3970104d5d234de3daeb42) Polish insights trends defaults
- [9bb2115b](https://github.com/iconix/fortudo/commit/9bb2115b6d1d79ffee4378d83b91899cbecdc8bb) Move selected day context above insight details
- [84c351bc](https://github.com/iconix/fortudo/commit/84c351bcbafb59303b5bc35f456ae93947765a2c) Ignore displayed-adjacent activity overlaps
- [ca904ca4](https://github.com/iconix/fortudo/commit/ca904ca4408775be0f09d8f51325420c7e7a2844) Scroll selected trend day into view
- [449035f2](https://github.com/iconix/fortudo/commit/449035f2e4a0615347bd7d96de0d130cac030f48) Prevent duplicate timer stop activities
- [3e099d4c](https://github.com/iconix/fortudo/commit/3e099d4cdcbfd2bf44b44ed9258e75e03c7d9370) Fix insights trend scroll alignment
- [2285a83f](https://github.com/iconix/fortudo/commit/2285a83fe027bbc9b580e914ca142b34e77c0718) Hide insights trend scrollbar
- [3e9f7950](https://github.com/iconix/fortudo/commit/3e9f7950a67733457368edab77b96752827fefe2) Expand phase 5 preview smoke coverage
- [8a53edbf](https://github.com/iconix/fortudo/commit/8a53edbf67cdf59e0d86ae7b43df07c579cf97b9) Update activities plan for phase 5 PR state

## PR 72

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 6 updates](https://github.com/iconix/fortudo/pull/72) · closed

- [6a8d685e](https://github.com/iconix/fortudo/commit/6a8d685ee56d253c9c91c732ca68b09406447225) chore(deps-dev): bump the minor-and-patch group across 1 directory with 6 updates

## PR 73

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 7 updates](https://github.com/iconix/fortudo/pull/73) · merged

- [b4732de5](https://github.com/iconix/fortudo/commit/b4732de57acc925f9d0968522049b0379569569b) chore(deps-dev): bump the minor-and-patch group across 1 directory with 7 updates

## PR 74

[ci(deps): bump codecov/codecov-action from 6 to 7](https://github.com/iconix/fortudo/pull/74) · merged

- [7c686ce6](https://github.com/iconix/fortudo/commit/7c686ce671c93ec4d8e7035437a0b4c156edda6e) ci(deps): bump codecov/codecov-action from 6 to 7

## PR 75

[ci(deps): bump actions/checkout from 6 to 7](https://github.com/iconix/fortudo/pull/75) · merged

- [cae4e8c4](https://github.com/iconix/fortudo/commit/cae4e8c4f5fdf59faf58320248b60fe9224095cc) ci(deps): bump actions/checkout from 6 to 7

## PR 76

[chore(deps-dev): bump prettier from 3.8.3 to 3.9.1 in the minor-and-patch group across 1 directory](https://github.com/iconix/fortudo/pull/76) · merged

- [fac4c110](https://github.com/iconix/fortudo/commit/fac4c110027699921340b146ef801d2f82246ef1) chore(deps-dev): bump prettier

## PR 77

[Polish activity sync and taxonomy settings](https://github.com/iconix/fortudo/pull/77) · merged

- [425c9edf](https://github.com/iconix/fortudo/commit/425c9edfdd6bd0309192dca37fad25211b744b93) Polish activity sync and taxonomy settings
- [33a52286](https://github.com/iconix/fortudo/commit/33a522860d23bfad0c4ca8ddc6e79f62a74cd893) Scope main schedule to today
- [6e0f3718](https://github.com/iconix/fortudo/commit/6e0f3718043ce8a7a21fd976e58c8f729e2e27db) Cover day-scoped schedule in preview smoke
- [38a6ea14](https://github.com/iconix/fortudo/commit/38a6ea14686c378b22ec7c50555d0eea4d7b6f79) Clarify current gap countdown label

## PR 78

[Add do-now scheduled task action](https://github.com/iconix/fortudo/pull/78) · merged

- [fe3c651d](https://github.com/iconix/fortudo/commit/fe3c651dbb421517ea15b17b581565260eee19f8) Add make next scheduled task action
- [c8665d0c](https://github.com/iconix/fortudo/commit/c8665d0c27032a7b162f8cbc087826ab455b7495) Merge remote-tracking branch 'origin/main' into track2-make-next
- [f8988698](https://github.com/iconix/fortudo/commit/f89886985d805dc60724b828d618e263896ffffd) Refine make-next actions menu
- [86598910](https://github.com/iconix/fortudo/commit/86598910dfd33b9ef94ab374ec83ea7ffb7b4537) Add unscheduled task actions menu
- [1661e78e](https://github.com/iconix/fortudo/commit/1661e78e09afad1fabf19a0214694765ad185847) Keep delete confirmation menus open
- [601714bd](https://github.com/iconix/fortudo/commit/601714bdbe044fd74a7fbda6bcb9f07e4430f144) Update preview smoke for task action menus
- [47d81243](https://github.com/iconix/fortudo/commit/47d812432f946b47e358dad69613e1bbfe4dbc77) Update E2E tests for task action menus
- [02d1f0d3](https://github.com/iconix/fortudo/commit/02d1f0d35b382beb964b6bed57cf72bf05700d1c) Fix task action menu stacking
- [18c0c961](https://github.com/iconix/fortudo/commit/18c0c9610c2b6689cc8aa6a375b6b1289322941a) Rename task action to do now
- [dc582f23](https://github.com/iconix/fortudo/commit/dc582f23685fd5ffce5b913987cf57731dc0aa92) Clarify lock action labels
- [2d4edc89](https://github.com/iconix/fortudo/commit/2d4edc89a27c2e8491a769e4f02bb614bbe11a9c) Show fixed-time badge for locked tasks
- [0d428739](https://github.com/iconix/fortudo/commit/0d428739c6f5a65321d0b994179d6070e564d65f) Refine locked task visual indicator
- [05647ec3](https://github.com/iconix/fortudo/commit/05647ec33eb9777a77daffaa745985f626e83376) Clarify locked time tooltip

## PR 79

[Fix running timer display after sync](https://github.com/iconix/fortudo/pull/79) · merged

- [24b7bb0e](https://github.com/iconix/fortudo/commit/24b7bb0edd67751bec9ef3f4b6b728227f10f6c4) Refresh running timer display after sync
- [ef5ae64e](https://github.com/iconix/fortudo/commit/ef5ae64e30e804c48576ad79c891d749fef2d4b5) Avoid auto-focusing task menu actions
- [263fc565](https://github.com/iconix/fortudo/commit/263fc5657063b0af2fa7f03807ffac689b888bb0) Log start timer exceptions
- [1acec301](https://github.com/iconix/fortudo/commit/1acec3011a7c44b78f84fd8ac057a6cd0bd508dc) Pin Firebase deploy CLI version
- [1a4b5665](https://github.com/iconix/fortudo/commit/1a4b566520aa9311bd4f6c3aa3c86db466153394) Handle Firebase preview retry success

## PR 80

[Harden production Firebase deploy retries](https://github.com/iconix/fortudo/pull/80) · merged

- [deb79c52](https://github.com/iconix/fortudo/commit/deb79c524f6d66fb522559ea5207dcc689215115) Harden production Firebase deploy retries

## PR 81

[Phase 6A/B: polish transitions and mobile timeline](https://github.com/iconix/fortudo/pull/81) · merged

- [b3d5505e](https://github.com/iconix/fortudo/commit/b3d5505ea679950284de2e7c417497a1f51c9fe8) Add reduced motion and transition polish
- [e1ef80bc](https://github.com/iconix/fortudo/commit/e1ef80bc41d4f0e6c074dd2b60360ca5c79aadeb) Adapt insights timeline for mobile
- [5165ffe4](https://github.com/iconix/fortudo/commit/5165ffe4ccedc942e503c6f8dc149e89ad257f0c) Use parent labels for direct group activities
- [f361d2a2](https://github.com/iconix/fortudo/commit/f361d2a2ab75694e775934503e4b5c814567a7d7) Preserve scheduled edit drafts across refreshes
- [ab2a83b0](https://github.com/iconix/fortudo/commit/ab2a83b02b172ca79be95ec71ff4ac4fc612d369) Print Firebase preview URLs in deploy logs

## PR 82

[Phase 6C: add Activities onboarding polish](https://github.com/iconix/fortudo/pull/82) · closed

- [f2111671](https://github.com/iconix/fortudo/commit/f211167139f38151c55500f170d9ef1df228e074) Add Escape handling for custom modals
- [5c1ecba6](https://github.com/iconix/fortudo/commit/5c1ecba6b3456328de854fa163f80e32c1ef4bcd) Add one-time Activities whats new modal
- [070e1a4a](https://github.com/iconix/fortudo/commit/070e1a4ad8112d3b96697a7bb5432314f5396339) Add room-scoped Activities onboarding

## PR 83

[Phase 6D: add persistence E2E coverage](https://github.com/iconix/fortudo/pull/83) · merged

- [caa16ffd](https://github.com/iconix/fortudo/commit/caa16ffd4262a16b8c77976b578a59a250a79e7c) Add Phase 6 persistence E2E coverage
- [faf62569](https://github.com/iconix/fortudo/commit/faf62569fbb7b817da6a5ab428098f4a4daacf3d) ci: run phase6 pytest e2e suite

## PR 84

[Phase 6C: add Activities onboarding polish](https://github.com/iconix/fortudo/pull/84) · merged

- [37dc86f3](https://github.com/iconix/fortudo/commit/37dc86f3ebc23fc118a7095fcb7f1679c1a5d0d1) Add Escape handling for custom modals
- [1eda903c](https://github.com/iconix/fortudo/commit/1eda903c2fd81efddbcf5854b3ccec256c80aea9) Add one-time Activities whats new modal
- [281946c6](https://github.com/iconix/fortudo/commit/281946c6dd8a1d487c7fd84acfe09c16ff71fc38) Add room-scoped Activities onboarding
- [d0daac13](https://github.com/iconix/fortudo/commit/d0daac1341a7bf4cd620174d43fbeb91025574b4) Add onboarding reminder snooze
- [610fd585](https://github.com/iconix/fortudo/commit/610fd5854b6f56a8f9cef862ece175e96b2c07ed) Sequence whats-new before onboarding
- [827a9830](https://github.com/iconix/fortudo/commit/827a98303a5dd3bd75d748887be46f756146d7a3) Rescope activities announcement flow
- [c3bfda7d](https://github.com/iconix/fortudo/commit/c3bfda7d54a3998461854652946ed9180f6fc40c) Keep announcement flag outside deploy config
- [0d6b6ea2](https://github.com/iconix/fortudo/commit/0d6b6ea22ff098f243e704d2e9eaabebd05e3da9) Prepare UI during activity onboarding
- [5490e84d](https://github.com/iconix/fortudo/commit/5490e84d0449cda2d70ded3f7fe3601e921f1e1f) Highlight activity onboarding targets
- [ca007b47](https://github.com/iconix/fortudo/commit/ca007b47ff410d7dbc7f1dec5c868ea1b7986d25) Format activities announcement modal
- [ff06db1d](https://github.com/iconix/fortudo/commit/ff06db1d0477e8cd7f41561b6c09ca3ee0e4e6ac) Cover activity onboarding in Phase 6 E2E

## PR 85

[Fix timeline block label overflow](https://github.com/iconix/fortudo/pull/85) · merged

- [90460a34](https://github.com/iconix/fortudo/commit/90460a34c3fde01e12474dffac32e0adecddf405) Fix timeline block label overflow
- [833c8d1c](https://github.com/iconix/fortudo/commit/833c8d1c3d8442025c1bf51ffb1a0da269c6daef) Avoid preview channel collisions
- [508201f3](https://github.com/iconix/fortudo/commit/508201f30716134a522192bf11628cb51df6d2e6) Handle existing preview channels
- [128b4f76](https://github.com/iconix/fortudo/commit/128b4f762ca31e6742e6cd25d42bc9c76f72261d) Redeploy stale preview channels

## PR 86

[chore(deps-dev): bump prettier from 3.9.1 to 3.9.4 in the minor-and-patch group](https://github.com/iconix/fortudo/pull/86) · merged

- [89792cc1](https://github.com/iconix/fortudo/commit/89792cc1bbcf3fe77fb4bd3c8aabb334958d9467) chore(deps-dev): bump prettier in the minor-and-patch group

## PR 87

[Consolidate E2E suites and preview smoke structure](https://github.com/iconix/fortudo/pull/87) · merged

- [0e52e52e](https://github.com/iconix/fortudo/commit/0e52e52edaba9aba5d53c5a5c59dc32f7009a0a2) test: add pytest e2e scaffold and move phase6 suite
- [d33cea94](https://github.com/iconix/fortudo/commit/d33cea94a73867ffdd15f225558cdbd9ae827cda) test: add pytest e2e fixture and helpers
- [d81affc7](https://github.com/iconix/fortudo/commit/d81affc75870ab1aba5f260b779820f112a12f79) test: import phase6 e2e helpers from shared module
- [26708755](https://github.com/iconix/fortudo/commit/2670875598747ba73d1d7df42b49dd3e005f907a) refactor: consolidate e2e suites under pytest
- [d6d5288a](https://github.com/iconix/fortudo/commit/d6d5288af1af3b2f4e5944a53120572e222e479f) test: remove e2e collection side effects
- [679ceda0](https://github.com/iconix/fortudo/commit/679ceda05fd21c229a64e575611b19b2fec4f77d) test: rename e2e suites by product area
- [4e2918bd](https://github.com/iconix/fortudo/commit/4e2918bd996f667ea1fa35fadc6299ea346a15f9) test: split phase-era e2e coverage by product area
- [f05f91b7](https://github.com/iconix/fortudo/commit/f05f91b798ee28dc7f2ccad44be6913a82843156) test: move preview smoke code into package
- [f8724e75](https://github.com/iconix/fortudo/commit/f8724e757ce872bbb5be945cae3c7ff4f5676026) test: require local pouchdb asset for e2e
- [06151896](https://github.com/iconix/fortudo/commit/061518960bb601f9621f92c4db0bfda8d974295c) test: clean preview smoke helper whitespace

## PR 88

[docs: close Activities implementation plan](https://github.com/iconix/fortudo/pull/88) · merged

- [e1c31045](https://github.com/iconix/fortudo/commit/e1c31045452f56fa8d0d643e922e7bebe96a7b5d) docs: close activities implementation plan

## PR 89

[Fix completed unscheduled tasks and activity overlaps](https://github.com/iconix/fortudo/pull/89) · merged

- [3f3abf51](https://github.com/iconix/fortudo/commit/3f3abf512b39778243cdc1205b551ac52e2f34ea) Fix completed unscheduled task cleanup and actions
- [3aaf9fd5](https://github.com/iconix/fortudo/commit/3aaf9fd563d54b28bb007774f64017f7d522e3f4) Add activity overlap truncation action
- [4f52c9c3](https://github.com/iconix/fortudo/commit/4f52c9c3bbbc49b56189e01855dfd7450d879311) Complete day rollover task cleanup
- [4ae6d5b8](https://github.com/iconix/fortudo/commit/4ae6d5b8018a2b43b364557d341b08945d690361) Share scheduled-to-backlog conversion
- [01f5dca6](https://github.com/iconix/fortudo/commit/01f5dca62903023e0f13a86d64ed4d52a46f2750) Add insights day issue indicators
- [c5234d7c](https://github.com/iconix/fortudo/commit/c5234d7c24851b546440af9924147fbdc67758cf) Refine insights day issue icon
- [588aaf22](https://github.com/iconix/fortudo/commit/588aaf22e06734eed2276814054d590cdf7854a9) Clarify day rollover roadmap item

## PR 90

[feat: add installable PWA shell](https://github.com/iconix/fortudo/pull/90) · merged

- [127f0979](https://github.com/iconix/fortudo/commit/127f0979287d4d53e989a9e3c4b8a41c181790f4) feat: add PWA icon set generated from brand emoji
- [42b10c95](https://github.com/iconix/fortudo/commit/42b10c9519622c366d6c72dcc9182aec92a5eee4) feat: add web app manifest
- [8d024899](https://github.com/iconix/fortudo/commit/8d0248997a00110f1a52c572bd860d3db834899c) feat: vendor PouchDB locally, retire CDN route interception
- [5314c3fc](https://github.com/iconix/fortudo/commit/5314c3fc08e4de06dc0ae1a48bbd7de2d1f3b6d1) feat: add service worker precache generator with committed output
- [61778f1c](https://github.com/iconix/fortudo/commit/61778f1ce52db53b5c748dab9812072bdc1cf36e) feat: add hand-rolled service worker and registration
- [ae7814fa](https://github.com/iconix/fortudo/commit/ae7814faa04407293bedbcbfbf7b324def3421a7) test: guard service worker precache freshness
- [1f5f1d76](https://github.com/iconix/fortudo/commit/1f5f1d760ca5f92a38f744e6b8d42e9ef0901265) fix: harden service worker updates and PouchDB vendoring
- [6effdc07](https://github.com/iconix/fortudo/commit/6effdc0751329371e1ae9df27c101054cfadcc2a) fix: make precache hashing cross-platform
- [459deb53](https://github.com/iconix/fortudo/commit/459deb534444756e5fdeb82f1c1be209e227f192) ci: update Codecov coverage input

## PR 91

[feat: make PWA assets offline-capable](https://github.com/iconix/fortudo/pull/91) · merged

- [d73dbff7](https://github.com/iconix/fortudo/commit/d73dbff75ef868403746f65cfaec9c26b36274ae) feat: build Tailwind statically, drop CDN runtime
- [4774cdda](https://github.com/iconix/fortudo/commit/4774cdda1a3eec82cf86a4d733c1280c2e0d8193) feat: vendor Font Awesome, tighten CSP to self
- [fa5396db](https://github.com/iconix/fortudo/commit/fa5396db2f4d13da492ea481998858a2d6466651) feat: surface service worker updates via reload toast
- [8a0a6e04](https://github.com/iconix/fortudo/commit/8a0a6e0426ae0f2c4225d9ec5c86faf30d267c90) fix: preserve vendored Font Awesome bytes

## PR 92

[feat: polish offline PWA experience](https://github.com/iconix/fortudo/pull/92) · merged

- [0d91a70a](https://github.com/iconix/fortudo/commit/0d91a70a5f084cde8d610e27c9b21d2f9d9643bc) feat: distinct offline sync status and reconnect sync
- [72b20a7c](https://github.com/iconix/fortudo/commit/72b20a7c033806afdd511335de37ee55b0651c6c) feat: request persistent storage at boot
- [24e38485](https://github.com/iconix/fortudo/commit/24e3848573750962f9942140faf9de4de16ccdcf) test: add PWA manifest, service worker, and offline e2e coverage
- [be2664cf](https://github.com/iconix/fortudo/commit/be2664cf1b89acfada120dc0e07aaadacecb4703) docs: document PWA build and test surfaces
- [f36656b9](https://github.com/iconix/fortudo/commit/f36656b9c5b1e9453e2bf994460dda8aa06a3e1b) docs: note discoverable PWA install prompt
- [1f1e6211](https://github.com/iconix/fortudo/commit/1f1e6211d80e7e77ec734ff186c7a145d2d7833b) docs: mark PWA roadmap milestone complete

## PR 93

[chore(deps-dev): bump prettier from 3.9.4 to 3.9.5 in the minor-and-patch group](https://github.com/iconix/fortudo/pull/93) · merged

- [29909177](https://github.com/iconix/fortudo/commit/299091773f085c017a6706ca0e1e7a0678d0abad) chore(deps-dev): bump prettier in the minor-and-patch group

## PR 94

[Use slate background for PWA icons](https://github.com/iconix/fortudo/pull/94) · merged

- [ff1a3033](https://github.com/iconix/fortudo/commit/ff1a30336d594f5f8c617dae7dc1a9a1f650f040) Use slate background for PWA icons

## PR 95

[ci: restore preview URL PR comment](https://github.com/iconix/fortudo/pull/95) · merged

- [318eddad](https://github.com/iconix/fortudo/commit/318eddadd4d7f2ae229ae45c30e41ddddb667d04) docs: design preview deployment PR comment
- [05c73cb0](https://github.com/iconix/fortudo/commit/05c73cb0a7e2113e2e3cfd0d23275b31e021e70e) ci: restore preview URL PR comment
- [5967a72a](https://github.com/iconix/fortudo/commit/5967a72ae4d5764b0288ff2516978e077baf75bf) docs: record preview comment verification path
- [c0713372](https://github.com/iconix/fortudo/commit/c07133722508343ab9f30ae3941238b66217725b) docs: match legacy preview comment content
- [4f926b45](https://github.com/iconix/fortudo/commit/4f926b4504c218a87191069e0d3d99411121667f) docs: plan legacy preview comment content
- [1d1d91d4](https://github.com/iconix/fortudo/commit/1d1d91d438d2cddf28173c9b50f991123a8a5b38) ci: match legacy preview comment content
- [930efbcd](https://github.com/iconix/fortudo/commit/930efbcd280d1097f2e61ff26f0fae874cd121e2) docs: remove stale preview comment metadata
- [60fb30e7](https://github.com/iconix/fortudo/commit/60fb30e70d8bb8596a2f2055ad1fc8b87cad4bbf) docs: plan preview comment metadata cleanup
- [ee61bc87](https://github.com/iconix/fortudo/commit/ee61bc87d34b0d0772ed68607702632ea0782c8c) ci: remove stale preview comment metadata

## PR 96

[Add manual ordering for unscheduled tasks](https://github.com/iconix/fortudo/pull/96) · merged

- [5d773ea3](https://github.com/iconix/fortudo/commit/5d773ea3cd14f7168bb463586216341b78d0c3d5) docs: design unscheduled manual ordering
- [191a27e2](https://github.com/iconix/fortudo/commit/191a27e2d07051de57c26ee9a4af9a344bc6d4b2) docs: plan unscheduled manual ordering
- [0cb8076d](https://github.com/iconix/fortudo/commit/0cb8076d38e0c8db2dcb83d8e6450dc9b600f5c9) docs: deepen unscheduled ordering architecture
- [220c211d](https://github.com/iconix/fortudo/commit/220c211df56ec198a26b836352314cc1130e9fe1) feat: add structured task batch writes
- [1ff8ec02](https://github.com/iconix/fortudo/commit/1ff8ec0207124e1d705a465d37395938d11e4e9c) test: strengthen task batch adapter coverage
- [92ec3aa4](https://github.com/iconix/fortudo/commit/92ec3aa463d51b3b78d46492199e4fe52262233e) feat: add unscheduled sequence projection
- [c47c8e96](https://github.com/iconix/fortudo/commit/c47c8e96528d56ef7cabc832320e852a840f997b) fix: preserve legacy unscheduled projection semantics
- [aa94901f](https://github.com/iconix/fortudo/commit/aa94901fcaf690f67fe8ebdc2beea9c136f5a238) feat: transact unscheduled sequence moves
- [27a0d46f](https://github.com/iconix/fortudo/commit/27a0d46f110e83f8dfabf18ab9003e51bff0472e) fix: serialize unscheduled sequence recovery
- [4ab225dd](https://github.com/iconix/fortudo/commit/4ab225dd214ee1bcc80fcb807ce5a2e975a20af1) refactor: deepen unscheduled sequence ownership
- [83dbab5d](https://github.com/iconix/fortudo/commit/83dbab5ddb33bf14fbfb878a7c018de0bab82599) test: prove manager sequence recovery
- [67257872](https://github.com/iconix/fortudo/commit/672578726265bb3761acd226b92bb13676595998) fix: scope unscheduled moves to manager state
- [841639df](https://github.com/iconix/fortudo/commit/841639dfee5bd32d63966c07a7d6db2d04d93605) refactor: deepen unscheduled list UI
- [1b54f9ec](https://github.com/iconix/fortudo/commit/1b54f9ec438ff2f08c117ff8cda6e549f3371da5) test: prove unscheduled mode restoration
- [2ab769f2](https://github.com/iconix/fortudo/commit/2ab769f20942752051fce9a568bf526ea84918fd) fix: preserve unscheduled list compatibility
- [aacdb0d1](https://github.com/iconix/fortudo/commit/aacdb0d1473272f241a720235ed016c3120cc6e9) feat: move unscheduled tasks accessibly
- [b973e93a](https://github.com/iconix/fortudo/commit/b973e93a0af217c9476b38b640df1a5b1c090754) fix: retain accessible move feedback
- [17a88f31](https://github.com/iconix/fortudo/commit/17a88f318bb673a3f5e3815700b54c7c9594f0a2) fix: preserve move control focus
- [cd9d215f](https://github.com/iconix/fortudo/commit/cd9d215f26ca1dc1bc728f328055b4e12639d167) feat: drag unscheduled sequence by handle
- [50596cf7](https://github.com/iconix/fortudo/commit/50596cf7f2ecc64b4120ccfa27aa4278a3289354) fix: harden unscheduled drag state
- [1f139131](https://github.com/iconix/fortudo/commit/1f139131e7ec218cf87eda36ced9368704caa7ce) refactor: route unscheduled UI through one seam
- [54953f59](https://github.com/iconix/fortudo/commit/54953f59369beb0f4a3b1bddf20918ebc1f2044f) fix: keep unscheduled session wiring singular
- [fec38a2d](https://github.com/iconix/fortudo/commit/fec38a2d847726cbbf91c3d5a7c368c21ab2c4d3) test: verify unscheduled manual ordering
- [c0677052](https://github.com/iconix/fortudo/commit/c0677052c44d81988f329c6ef62f8ec37b18479e) fix: refresh synced task revisions
- [973918e8](https://github.com/iconix/fortudo/commit/973918e838574b293e7e48c878e2f4286ff4cacf) feat: animate live unscheduled reordering
- [03ce6703](https://github.com/iconix/fortudo/commit/03ce6703b75af761ec8a15c0c3e234bf74feee25) refactor: isolate unscheduled order persistence
- [df320ca2](https://github.com/iconix/fortudo/commit/df320ca2d597d600ea56a574815a76ea8c06e0b8) test: harden preview sequence sync coverage
- [38c5f2ac](https://github.com/iconix/fortudo/commit/38c5f2acbf461750ebbc4f785e2ff1828b86fb82) docs: record sequence architecture acceptance
- [f7e2aa0f](https://github.com/iconix/fortudo/commit/f7e2aa0f47c778f253d62f446e2cd90ee560ee68) test: cover multi-client sequence lifecycle races
- [e8cdbd0a](https://github.com/iconix/fortudo/commit/e8cdbd0a48b562130e9053881b2ca46644a48811) ci: reuse stable Firebase preview channels
- [acff536c](https://github.com/iconix/fortudo/commit/acff536cac19b2763a2c503178cd594bdce96f8b) fix: make task persistence authoritative
- [f9e6ff99](https://github.com/iconix/fortudo/commit/f9e6ff999717797c6669f7842a402955de244b85) fix: preserve task editors across sync refreshes
- [9448a11c](https://github.com/iconix/fortudo/commit/9448a11c82fec5f9abca59e0945f0d62e3be016f) test: harden preview sync release gate
- [b4216a11](https://github.com/iconix/fortudo/commit/b4216a11064959de6a3284f304eea51bf186f30f) test: align delete helper state model

## PR 97

[Rebrand Fortudo in violet and polish the Android PWA](https://github.com/iconix/fortudo/pull/97) · merged

- [21864f0b](https://github.com/iconix/fortudo/commit/21864f0bb5b91ea81d85580552a9c291df5e0b0b) fix: align Android chrome and wrap long task URLs
- [aefa3f59](https://github.com/iconix/fortudo/commit/aefa3f594232360d7e3f7c283200714f4d6084b8) fix: remove hidden insights from scroll layout
- [523d9d96](https://github.com/iconix/fortudo/commit/523d9d962e8ea55d93b5611962c72c96d5194e3d) feat: apply violet brand system
- [cda6dcf8](https://github.com/iconix/fortudo/commit/cda6dcf8824ef262fda7916abbcca577b27aadb0) style: apply unified crisp task accents
- [0989e082](https://github.com/iconix/fortudo/commit/0989e0825953c8275065d789a19b3a9d80caf94b) fix: polish mobile layout and toast hierarchy
- [814c3000](https://github.com/iconix/fortudo/commit/814c30003dc4e2c14b6b51a4b036b07fe6b554fb) style: add Jelly dedication heart
- [6bf515a8](https://github.com/iconix/fortudo/commit/6bf515a809080cb89d3db2360444e8fed4a52e5e) style: address violet rebrand review
- [514256e7](https://github.com/iconix/fortudo/commit/514256e7f4b0c7052ea760b6adc44034d678d695) style: refine violet brand restraint
- [4779fafa](https://github.com/iconix/fortudo/commit/4779fafabd8c0dba9e50ac68289252b4d99a1fdb) fix: align color semantics and settings UX
- [f6f81769](https://github.com/iconix/fortudo/commit/f6f8176993b5073c1c31e05301ef7dc9c12197f2) Merge remote-tracking branch 'origin/main' into fix/android-pwa-theme-url-wrap
- [b4413898](https://github.com/iconix/fortudo/commit/b44138984b866120b6e4b9fa9c1a022a10db0154) style: refine task type semantics and actions
- [4577f72b](https://github.com/iconix/fortudo/commit/4577f72b87ce873dc87fcd72fd06f34bd2796a24) polish settings taxonomy hierarchy
- [338c2971](https://github.com/iconix/fortudo/commit/338c2971164e55b1d5cb5e4f751bee8f1ce2eace) refine settings organization hierarchy
- [4c484509](https://github.com/iconix/fortudo/commit/4c4845099fd97bad0f00835b4e38b0f98bb06b76) fix theme semantics test coverage
- [39326212](https://github.com/iconix/fortudo/commit/39326212e23bf14d9de222add9267a0b2af7c1c7) document Windows agent debugging
- [2f4cde21](https://github.com/iconix/fortudo/commit/2f4cde2126ecc753929bb02e54fd51c9cfccd0f1) fix contextual Tint+ actions

## PR 98

[test: establish reproducible test boundaries](https://github.com/iconix/fortudo/pull/98) · merged

- [2eb9f913](https://github.com/iconix/fortudo/commit/2eb9f913c061011330a93e7dec5f15fbf2899e83) test: establish reproducible test boundaries

## PR 99

[Update release announcement and hide overlap repair](https://github.com/iconix/fortudo/pull/99) · merged

- [2092c671](https://github.com/iconix/fortudo/commit/2092c671e572c5427ec05d554743e2c21e4b5588) Update what's new announcement
- [8c215b5b](https://github.com/iconix/fortudo/commit/8c215b5bdaf9afdf8b36587fa9566a1cac6fdbf2) Temporarily hide overlap repair action
- [169dc6c2](https://github.com/iconix/fortudo/commit/169dc6c2bb45feb012520d93891e27a06a58967b) Polish and enable release announcement
- [26d09ee7](https://github.com/iconix/fortudo/commit/26d09ee7d96f1b56323d24d772e5870d8cae44f1) Add emoji accents to release announcement
- [f57d5bea](https://github.com/iconix/fortudo/commit/f57d5beafce47d5ec66502a5f167d0e9d1400951) Clarify activity tracking setup
- [5e523060](https://github.com/iconix/fortudo/commit/5e523060e4cd9992d139984fd62b6f61433f5139) Refine activity tracking announcement copy

## PR 100

[ci(deps): bump actions/setup-python from 6 to 7](https://github.com/iconix/fortudo/pull/100) · merged

- [8ad11b10](https://github.com/iconix/fortudo/commit/8ad11b10bd56b380d957d0919fcd9649ffd8b50e) ci(deps): bump actions/setup-python from 6 to 7

## PR 101

[ci(deps): bump actions/setup-node from 6 to 7](https://github.com/iconix/fortudo/pull/101) · merged

- [7aa85fb8](https://github.com/iconix/fortudo/commit/7aa85fb8445270cd817b5eeff9ed571e466d2a10) ci(deps): bump actions/setup-node from 6 to 7
- [edd8facb](https://github.com/iconix/fortudo/commit/edd8facb2f0c961761cce54176ac8d31f5d490b3) Update setup-node workflow guards

## PR 102

[Fix activity timer elapsed counter](https://github.com/iconix/fortudo/pull/102) · merged

- [1482428d](https://github.com/iconix/fortudo/commit/1482428d271f6b10e0a54a55a37567fbcd43f298) Fix activity timer elapsed counter
- [c5bc4964](https://github.com/iconix/fortudo/commit/c5bc496426929ec77b0f8c5b5f89e524c464cdcb) Merge remote-tracking branch 'origin/main' into codex/fix-activity-timer-elapsed

## PR 103

[Harden entity and taxonomy identity](https://github.com/iconix/fortudo/pull/103) · merged

- [8b572426](https://github.com/iconix/fortudo/commit/8b57242630b4e53840c1af4fb2918c47393f1657) Harden entity and taxonomy identity
- [01455a8c](https://github.com/iconix/fortudo/commit/01455a8c1980ce44253292f2aa60de07ce56d354) Refresh settings before synced state

## PR 104

[Harden document contracts and migration recovery](https://github.com/iconix/fortudo/pull/104) · merged

- [18b07397](https://github.com/iconix/fortudo/commit/18b073973ad5283adac20ed77c693d7ddecefaf0) Harden document contracts and migration recovery
- [e0224b10](https://github.com/iconix/fortudo/commit/e0224b1075f5c15f456aabd9a42a1c0ab2b63514) Close document contract review gaps
- [0b22407e](https://github.com/iconix/fortudo/commit/0b22407e99280219df7015eb86d729d127779e2d) Bind migration completion to S1 state
- [8da180ef](https://github.com/iconix/fortudo/commit/8da180efe3289f214355f761357870a4e5971f40) Stabilize hidden task type control in preview tests

## PR 105

[Fix document contract operations CLI entry point](https://github.com/iconix/fortudo/pull/105) · merged

- [1fd44e18](https://github.com/iconix/fortudo/commit/1fd44e189b6eff9428a61c4af309f5f7029e31f9) Fix document contract operations CLI entry point

## PR 106

[Record temporary unencrypted backup override](https://github.com/iconix/fortudo/pull/106) · merged

- [a815436f](https://github.com/iconix/fortudo/commit/a815436fafca7335560eb60aeca0a2fec007f2fb) Record temporary unencrypted backup override
- [bb7d5b3d](https://github.com/iconix/fortudo/commit/bb7d5b3d89ca6c9e0bd6d922de83a69c3875681e) Clean up expired Firebase preview channels
- [e9964f7c](https://github.com/iconix/fortudo/commit/e9964f7ccc0b71893235981ec58d531e8788e3df) Gate Firebase deploys on public output

## PR 107

[Harden Cloudant target state binding](https://github.com/iconix/fortudo/pull/107) · merged

- [58cfa40f](https://github.com/iconix/fortudo/commit/58cfa40fef0bdde355e09aa42c905502ae2f873d) Harden Cloudant target state binding

## PR 108

[Remove premature Cloudant backup tooling](https://github.com/iconix/fortudo/pull/108) · merged

- [8c996c2c](https://github.com/iconix/fortudo/commit/8c996c2cd6b74e8cbd09086fb9c2df8372358288) refactor: remove premature backup tooling
- [59ebdf58](https://github.com/iconix/fortudo/commit/59ebdf58ea9ff2aa164413227a7ef4131c48d218) clarify read-only planner scope

## PR 109

[Add minimal Cloudant quarantine migration](https://github.com/iconix/fortudo/pull/109) · merged

- [3f4f8daa](https://github.com/iconix/fortudo/commit/3f4f8daad1f98a8f621ed679531e98513fcdfe51) Add minimal Cloudant quarantine migration

## PR 110

[Bind Cloudant capture to verified preflight](https://github.com/iconix/fortudo/pull/110) · merged

- [7a3472e4](https://github.com/iconix/fortudo/commit/7a3472e46cc294fbfe16541ba034f992116a4992) Bind Cloudant capture to verified preflight

## PR 111

[Separate reusable Cloudant migration boundaries](https://github.com/iconix/fortudo/pull/111) · merged

- [f8199f67](https://github.com/iconix/fortudo/commit/f8199f674c21f0f1813f0789f53688208554c8bb) docs: capture taxonomy manager UX point of view
- [0fc869f6](https://github.com/iconix/fortudo/commit/0fc869f6cc61cb10eb0a8351f282e2179ebb9959) refactor: separate Cloudant migration boundaries
- [b0857d10](https://github.com/iconix/fortudo/commit/b0857d107244ba3644844cba2083b104bcb735fa) docs: scope room-specific migration runbook
- [186a296c](https://github.com/iconix/fortudo/commit/186a296c97a8687c044ef2057840efb8c4cc19ef) docs: organize repository documentation
- [1a6bf979](https://github.com/iconix/fortudo/commit/1a6bf9799ae6cde76545417f6f05dc4b73eded23) docs: correct Cloudant setup guidance

## PR 112

[chore(deps-dev): bump prettier from 3.9.5 to 3.9.6 in the minor-and-patch group](https://github.com/iconix/fortudo/pull/112) · merged

- [b61f0d5c](https://github.com/iconix/fortudo/commit/b61f0d5c471c8eac2a7a75e41c74241e8433dd8a) chore(deps-dev): bump prettier in the minor-and-patch group

## PR 113

[Make synced startup immediately usable](https://github.com/iconix/fortudo/pull/113) · merged

- [a10c83b5](https://github.com/iconix/fortudo/commit/a10c83b59d49c599d2f5d01f2c156353b6187670) Use cached state safely during synced startup
- [7b748e29](https://github.com/iconix/fortudo/commit/7b748e29c1e3144af3f908b1dd51e89200209de3) Regenerate frontend assets

## PR 114

[Make scheduled task actions reliable on mobile](https://github.com/iconix/fortudo/pull/114) · merged

- [6778b312](https://github.com/iconix/fortudo/commit/6778b3120c5b8ba675898ce5b86e7aca169e8982) Fix mobile task actions
- [6af38a4e](https://github.com/iconix/fortudo/commit/6af38a4e7aa5887eaf3afa7c1a5605bc09912680) Merge remote-tracking branch 'origin/main' into codex/scheduled-actions-mobile
- [1c0497aa](https://github.com/iconix/fortudo/commit/1c0497aa4792425b16d8fad9a569a5584274fee9) Keep two-tap task deletion stable on mobile

## PR 115

[Show data issues in today's activities](https://github.com/iconix/fortudo/pull/115) · merged

- [4fdc00c1](https://github.com/iconix/fortudo/commit/4fdc00c1cb54c10d3938fe65cdb4614848363a24) Show data issues in today's activities
- [4d5e6241](https://github.com/iconix/fortudo/commit/4d5e6241a8a4ff224d60bc9f4155eaa42a4fe097) Merge remote-tracking branch 'origin/main' into codex/today-data-warning
- [daf47f8b](https://github.com/iconix/fortudo/commit/daf47f8b3113c33aaebeb2c5a9d3240aedfbe2bd) Tone down activity data issue cards
- [a76c9a46](https://github.com/iconix/fortudo/commit/a76c9a46913d434421ba1876897305b813cd265f) Refresh generated activity warning styles

## PR 116

[Harden overlap repair with an exact preview](https://github.com/iconix/fortudo/pull/116) · merged

- [c3029f3e](https://github.com/iconix/fortudo/commit/c3029f3e9630ae472c40ed87287c795227e92626) Harden overlap repair preview
- [6f687e62](https://github.com/iconix/fortudo/commit/6f687e6204ef393614870e311aef2440e1605084) Merge branch 'main' into codex/overlap-repair-preview
- [c54dbde2](https://github.com/iconix/fortudo/commit/c54dbde2eec25d1322942a66088eaf98373c9b06) Harden activity overlap repair
- [d8e112a7](https://github.com/iconix/fortudo/commit/d8e112a7a56e89e769f331789480f0eff3eceba2) Polish overlap repair review

## PR 117

[Improve taxonomy visibility and color choices](https://github.com/iconix/fortudo/pull/117) · merged

- [66898fe9](https://github.com/iconix/fortudo/commit/66898fe9b6094df584185c9a486ee4f07ca9678c) Improve taxonomy visibility and colors
- [266a2761](https://github.com/iconix/fortudo/commit/266a276161861697a46c4139a9d2ca4e77a6b595) Refine taxonomy visibility and tone cycling
- [6cb92929](https://github.com/iconix/fortudo/commit/6cb92929267fae53acd8c8256cdaca9e36c029f0) Merge remote-tracking branch 'origin/main' into codex/taxonomy-visibility-colors

## PR 118

[Show category colors on activity timers](https://github.com/iconix/fortudo/pull/118) · merged

- [63bbb1e3](https://github.com/iconix/fortudo/commit/63bbb1e36fa01634fe287497fd8a1bf474540c7c) Show category colors on activity timers

## PR 119

[Surface overlap repair in Today](https://github.com/iconix/fortudo/pull/119) · merged

- [d8d12dfd](https://github.com/iconix/fortudo/commit/d8d12dfde3fa150dc570e719814f428d763bb926) Surface overlap repair in Today
- [1eb74bcc](https://github.com/iconix/fortudo/commit/1eb74bcc9806d9d1ed8bd8e4b76ed2b371c8da4a) Stabilize live overlap E2E timing

## PR 120

[Repair overlaps against the current timer](https://github.com/iconix/fortudo/pull/120) · merged

- [62376a99](https://github.com/iconix/fortudo/commit/62376a99e81cbec9273bdde3d9bc81f76633d4ac) Repair overlaps against the current timer
- [6d1dcc7e](https://github.com/iconix/fortudo/commit/6d1dcc7e9f1dd127de5e0bdf45ed8143de88cc60) Make timer preview test timezone independent
- [07a3fdf9](https://github.com/iconix/fortudo/commit/07a3fdf9fa43b986ee9953c300f730f43d36a492) Normalize truncated preview channel slugs

## PR 121

[chore(deps-dev): bump the minor-and-patch group with 3 updates](https://github.com/iconix/fortudo/pull/121) · closed

- [c5d19d98](https://github.com/iconix/fortudo/commit/c5d19d98d7c7e6e2a4b54ff3fa175c12ec2bb9b9) chore(deps-dev): bump the minor-and-patch group with 3 updates

## PR 122

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 5 updates](https://github.com/iconix/fortudo/pull/122) · closed

- [93979cec](https://github.com/iconix/fortudo/commit/93979cec160552536ce24fb18967fdac21de8684) chore(deps-dev): bump the minor-and-patch group across 1 directory with 5 updates

## PR 123

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 6 updates](https://github.com/iconix/fortudo/pull/123) · merged

- [b24c7ff2](https://github.com/iconix/fortudo/commit/b24c7ff2f4c2387c4d4d2db67c0d40430d4b0d18) chore(deps-dev): bump the minor-and-patch group across 1 directory with 6 updates

## PR 124

[Make startup edits and sync recovery safe and resumable](https://github.com/iconix/fortudo/pull/124) · merged

- [f5fab0d7](https://github.com/iconix/fortudo/commit/f5fab0d75cf3c392c4760ac26933e0ba5b24fa55) fix: keep startup usable when app files fail to load
- [73a0aaac](https://github.com/iconix/fortudo/commit/73a0aaaca470be3a0a38ea0d5f02ab3756424b18) feat: enable safe local editing and guided sync recovery
- [f33e5f81](https://github.com/iconix/fortudo/commit/f33e5f81e5024444af86d7aaff85ed7aaa7a65e8) docs: document sync safety and refresh offline assets
- [04f91c55](https://github.com/iconix/fortudo/commit/04f91c55bb85f082513b8e086f206cee91beeaf3) fix: show a stopped state when room repair fails

## PR 125

[Freeze the v1 document contract and export a verified artifact](https://github.com/iconix/fortudo/pull/125) · merged

- [192e7af9](https://github.com/iconix/fortudo/commit/192e7af9695cd62859cfb03e2399e21aba203ab1) Freeze v1 document contract and export a verified operational artifact
- [d401c4ea](https://github.com/iconix/fortudo/commit/d401c4ea777e082585fb0733e53145470c595ed2) Restore hashing in orphan audit and cleanup reporting
- [1f984312](https://github.com/iconix/fortudo/commit/1f984312532db0231ea294a8d118d896df94e160) Merge main into immutable document contract v1
- [82404487](https://github.com/iconix/fortudo/commit/8240448794dfc5cdf9429840e2671783612d9828) Sanitize malformed Unicode in contract artifacts

## PR 126

[Pace Cloudant bulk reads and prevent fallback bursts](https://github.com/iconix/fortudo/pull/126) · closed

- [2929306b](https://github.com/iconix/fortudo/commit/2929306baadaca66bcedab019e0286f298768d51) Handle Cloudant throttling without bulk-read fallback bursts
- [6d4e9f95](https://github.com/iconix/fortudo/commit/6d4e9f95f8e2cfed0374402dc787e7f96ccc3fe2) Pace bulk downloads under shared Cloudant read capacity

## PR 127

[chore(deps-dev): bump @babel/core from 7.29.7 to 7.29.13 in the minor-and-patch group](https://github.com/iconix/fortudo/pull/127) · closed

- [9f6b17d3](https://github.com/iconix/fortudo/commit/9f6b17d306d241d939ade41f0ec21c671e43b20e) chore(deps-dev): bump @babel/core

## PR 128

[Repair legacy cloud recovery without replaying obsolete deletions](https://github.com/iconix/fortudo/pull/128) · merged

- [2929306b](https://github.com/iconix/fortudo/commit/2929306baadaca66bcedab019e0286f298768d51) Handle Cloudant throttling without bulk-read fallback bursts
- [6d4e9f95](https://github.com/iconix/fortudo/commit/6d4e9f95f8e2cfed0374402dc787e7f96ccc3fe2) Pace bulk downloads under shared Cloudant read capacity
- [fc5cda39](https://github.com/iconix/fortudo/commit/fc5cda3915a886e83c1f56894d78ce753aa2b6fb) Fix legacy cloud repair and preserve deletion history
- [a9ff1d34](https://github.com/iconix/fortudo/commit/a9ff1d342ce22d9b0d949af356cf1980c99b5c8e) Fix legacy priority reads and split conflict revision downloads
- [50c50f7c](https://github.com/iconix/fortudo/commit/50c50f7c246cfaa99ab210e98dc19e717369220e) Shorten room-specific recovery review brief

## PR 129

[Prevent checkpoint-write bursts during sync](https://github.com/iconix/fortudo/pull/129) · merged

- [75c2d4eb](https://github.com/iconix/fortudo/commit/75c2d4eb3a4ccd56feda154664e9243edab4f76a) Pace checkpoint writes and confirm ambiguous acknowledgements
- [0865e047](https://github.com/iconix/fortudo/commit/0865e047d3790f6bd2602a1ca0551a178deb0171) Handle bootstrap checkpoint writes without silent throttling

## PR 130

[Show recovery progress and explain repair waits](https://github.com/iconix/fortudo/pull/130) · merged

- [2cbaef88](https://github.com/iconix/fortudo/commit/2cbaef88f66f40a14d1ca1924a92a82a567ecf25) Show recovery progress and explain repair waits
- [5ef44c48](https://github.com/iconix/fortudo/commit/5ef44c489d1d4ab39915ee9d101014c16fdf97ff) Fix retry feedback lifecycle and retain repair diagnostics

## PR 131

[Handle expired deletion markers without blocking rooms](https://github.com/iconix/fortudo/pull/131) · merged

- [693b424f](https://github.com/iconix/fortudo/commit/693b424fb12da8a299e5e05978711680ca2c4ff8) Handle expired cloud deletion markers without blocking rooms
- [8c657719](https://github.com/iconix/fortudo/commit/8c657719b6f99911eead0a325a9c9177d502e5a0) Retry live recreations skipped by an in-flight sync

## PR 132

[chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates](https://github.com/iconix/fortudo/pull/132) · merged

- [63696175](https://github.com/iconix/fortudo/commit/63696175a6cef8bd80a75490705c0b9c376b8923) chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates

## PR 133

[Fix inline task editor layout overflow](https://github.com/iconix/fortudo/pull/133) · merged

- [6e0d4481](https://github.com/iconix/fortudo/commit/6e0d448114c7cd3d83e5e5e5a71ff7aec63b27c8) Fix inline task editor layout overflow
- [cb603e0b](https://github.com/iconix/fortudo/commit/cb603e0b55b056fe521c42814901752f99aea572) Regenerate Tailwind CSS for the task editor fix
- [88d7f364](https://github.com/iconix/fortudo/commit/88d7f3642e22230df5ac3ba709ac83eebf7ce71d) Check generated Tailwind CSS during verification

## PR 134

[Make inline editors consistent across tasks and activities](https://github.com/iconix/fortudo/pull/134) · merged

- [ccb689d4](https://github.com/iconix/fortudo/commit/ccb689d463e08fa792d43b82830968fabd52c88c) Make inline editors consistent across tasks and activities
- [c37c0748](https://github.com/iconix/fortudo/commit/c37c0748f86eee58befc064f4136956e0d1da1dd) Document inline editor design decisions
- [1e3618b7](https://github.com/iconix/fortudo/commit/1e3618b7e0d1d8d0f7b71ca7aebb9947911c6be9) Keep unscheduled editor on one row across fonts
- [e2b8eaf0](https://github.com/iconix/fortudo/commit/e2b8eaf0891c397c2ad438e5c09a43c2e0862d67) Retrigger CI for editor breakpoint fix

## PR 135

[Verify long task descriptions in the browser](https://github.com/iconix/fortudo/pull/135) · open

- [2644e326](https://github.com/iconix/fortudo/commit/2644e3269b717cd29cfc0812a2cf6b9f049e896b) Verify long task layout through browser geometry

## PR 136

[Keep room codes out of HTML parsing](https://github.com/iconix/fortudo/pull/136) · open

- [d27a61b3](https://github.com/iconix/fortudo/commit/d27a61b36ffda17c72f67ca5ae72a01301ea47ea) Enforce DOM-only rendering for room controls

## PR 137

[Give room entry controls one handler per action](https://github.com/iconix/fortudo/pull/137) · open

- [bd066090](https://github.com/iconix/fortudo/commit/bd06609002a2096c0687c60d206faacb969f93af) Give room entry controls one handler per action

## PR 138

[Release the sync slot before retrying a recreated revision](https://github.com/iconix/fortudo/pull/138) · open

- [840cce07](https://github.com/iconix/fortudo/commit/840cce07c29e89ff54f06991a3f4482f2b3d98a9) Model sync recreation schedules against IndexedDB replicas
- [bdb0f510](https://github.com/iconix/fortudo/commit/bdb0f5100fed708a0afe7c610c5557be107dafe5) Release the sync slot before dispatching pending work

## PR 139

[Verify the suggested start time after Clear All](https://github.com/iconix/fortudo/pull/139) · open

- [98baf960](https://github.com/iconix/fortudo/commit/98baf9609f41bf21425defcfa912c3e3a6e6aa10) Exercise the suggested start time after Clear All

## PR 140

[Detect inline scripts in hosted pages](https://github.com/iconix/fortudo/pull/140) · open

- [2add3790](https://github.com/iconix/fortudo/commit/2add37907ca6c7a58fee0405fe7f84b826a9bfd0) Check hosted pages for scripts blocked by the hosting policy

## PR 141

[Model lost checkpoint acknowledgements across throttled retries](https://github.com/iconix/fortudo/pull/141) · open

- [5d69c789](https://github.com/iconix/fortudo/commit/5d69c78936838ae38d294049c28d9757fb169438) Check bounded acknowledgement outcomes for checkpoint writes

## Main history

The first seven commits precede PR #1. Later squash-merge OIDs are separate from their PR branch OIDs. [Browse main at this snapshot](https://github.com/iconix/fortudo/tree/7a9a7c7)

- [f4a8c09a](https://github.com/iconix/fortudo/commit/f4a8c09a21f8de9574c401e619fe84845f03f58a) attempt 1
- [2e9023cf](https://github.com/iconix/fortudo/commit/2e9023cf893cfc42fed11a31c70c89ad15474e19) attempt 2 (makereal)
- [5a4e0e3e](https://github.com/iconix/fortudo/commit/5a4e0e3e207ce7678c778e69f5416f3d5a24ce6a) firebase init
- [aa436820](https://github.com/iconix/fortudo/commit/aa4368203311caa061ae3dd1d156a1b02f998980) distribute real app
- [f49cbdf3](https://github.com/iconix/fortudo/commit/f49cbdf3f7a237298d2afeaabfb50012866f608a) improve mobile layout
- [56d8c00b](https://github.com/iconix/fortudo/commit/56d8c00b8265ddb217cdf66e4d91e01896c7565c) prevent click on disabled checkboxes
- [28d37a7f](https://github.com/iconix/fortudo/commit/28d37a7fce0cea909c88bcb7dd1ac11f2409984e) remove hardcoded tasks; slight language update
- [8c6a826a](https://github.com/iconix/fortudo/commit/8c6a826ab4a5ee0b118a07381be2672544831b80) minimally refactor app to enable testing; add app tests with jest (#1)
- [93d26646](https://github.com/iconix/fortudo/commit/93d26646a3795c3cbefbeb5c2d02750dcf1c4a65) &#91;bug&#93; fixes after test refactor (#2)
- [3f7cb960](https://github.com/iconix/fortudo/commit/3f7cb960e881f78e8dffedcefe12858ef809635f) refactor/monolith (#5)
- [ff326c74](https://github.com/iconix/fortudo/commit/ff326c745d818cd3224fec4f7abba69ae44fab50) ci(deps): bump peter-evans/create-pull-request from 5 to 7 (#6)
- [3d0e24e6](https://github.com/iconix/fortudo/commit/3d0e24e691301da90ae7c6325f4b869a7e9707f5) ci(deps): bump codecov/codecov-action from 3 to 5 (#7)
- [bdbe84b0](https://github.com/iconix/fortudo/commit/bdbe84b0fe3fe9d67c72d0522aabd5d1861cc7db) chore(deps-dev): bump the minor-and-patch group with 3 updates (#8)
- [0921cd24](https://github.com/iconix/fortudo/commit/0921cd2449141474327b63d6ca78d3a2a398ec98) ci: skip deployments if there are no code changes in a commit (#9)
- [40b77951](https://github.com/iconix/fortudo/commit/40b779516fdc4ef6bf2777b4e49ae4376d2340d7) chore: update dependencies (#10)
- [29f31bcf](https://github.com/iconix/fortudo/commit/29f31bcfa9bbb8bc26963afbe457cbe7857fce8f) chore: update dependencies (#13)
- [c5f50f32](https://github.com/iconix/fortudo/commit/c5f50f3208f101d52bb0d47f717dadb869c5b35f) ci(deps): bump actions/download-artifact from 4 to 5 (#18)
- [d83c7109](https://github.com/iconix/fortudo/commit/d83c710990dddd8164d6c928847f37b3d6a108b2) ci(deps): bump actions/checkout from 4 to 5 (#19)
- [995ce65e](https://github.com/iconix/fortudo/commit/995ce65e0a655026dd3cfcb3abbf67dbe4d5145a) ci(deps): bump actions/github-script from 7 to 8 (#20)
- [408f6ef2](https://github.com/iconix/fortudo/commit/408f6ef281a0d44184460e0e6bfc46ea147ca7af) &#91;refactor&#93; app v2 (#12)
- [80a1ae32](https://github.com/iconix/fortudo/commit/80a1ae32fc84546a0b3bb144c1f2ff1a4b8eee55) ci(deps): bump actions/download-artifact from 5 to 6 (#26)
- [38cc3ba8](https://github.com/iconix/fortudo/commit/38cc3ba8f683a793dcbbf76ac8bf3b9f932369ad) ci(deps): bump actions/setup-node from 4 to 6 (#24)
- [9aa4ea2b](https://github.com/iconix/fortudo/commit/9aa4ea2b2cf5c06cbf87cf18d37efc957cf08631) ci(deps): bump github/codeql-action from 3 to 4 (#23)
- [40467ece](https://github.com/iconix/fortudo/commit/40467ece36fe705ac9e7e0fa3f499ea0cc9efd9c) fix: resolve multiple UI and scheduling bugs (#35)
- [bdd5a4b2](https://github.com/iconix/fortudo/commit/bdd5a4b2181905078c0ca272d55f275210002b95) ci(deps): bump peter-evans/create-pull-request from 7 to 8 (#31)
- [86b3e64c](https://github.com/iconix/fortudo/commit/86b3e64c11c0d809d03803b09fcf3a8264357fc1) ci(deps): bump actions/checkout from 5 to 6 (#32)
- [a2b6dbed](https://github.com/iconix/fortudo/commit/a2b6dbedb1abdc49fd5352029224691ba71cfe98) ci(deps): bump actions/upload-artifact from 4 to 6 (#33)
- [9908703b](https://github.com/iconix/fortudo/commit/9908703b9d12aca715672591755a988e41521c18) chore(deps-dev): bump the minor-and-patch group with 4 updates (#34)
- [07ba2ee6](https://github.com/iconix/fortudo/commit/07ba2ee669916aec7bd5219138f8621cf8eaea1a) feat: add Playwright E2E tests (#36)
- [cb466509](https://github.com/iconix/fortudo/commit/cb466509ed9d5e2f6da75a024a8884d1cf6fb66c) chore: update dependencies (#37)
- [c1433401](https://github.com/iconix/fortudo/commit/c1433401f40eb7a2a6274739660d8e8c25af649d) refactor: decompose app.js and address architecture weaknesses (#38)
- [8442377b](https://github.com/iconix/fortudo/commit/8442377b0d1d172cf6de9dda8406a4c8e5185213) feat: add visual gap indicators between scheduled tasks (#39)
- [800390e1](https://github.com/iconix/fortudo/commit/800390e1f13c872bdb7ad175bacc36703af3a4e9) feat: schedule tasks in gaps with live overlap warnings (#43)
- [b801c152](https://github.com/iconix/fortudo/commit/b801c15263309c4d6896462d7935f5c3ad724834) ci(deps): bump actions/setup-python from 5 to 6 (#41)
- [fd4e7707](https://github.com/iconix/fortudo/commit/fd4e7707df6af1466a7bde9a289cd7dafa5f3019) chore: update dependencies (#42)
- [53fd3896](https://github.com/iconix/fortudo/commit/53fd389655e011ae23046f0c3917380e3098c720) feat: local-first sync with PouchDB and room codes (#40)
- [f6e06d4d](https://github.com/iconix/fortudo/commit/f6e06d4d4271ddffe8da8402a32152d9c6ff23b6) chore: v3 cleanup (dom renderer rename + jest 30) (#47)
- [0fa4f05d](https://github.com/iconix/fortudo/commit/0fa4f05dc12867e91045ab583a98c41a996bfe7e) ci(deps): bump actions/download-artifact from 7 to 8 (#45)
- [97d74218](https://github.com/iconix/fortudo/commit/97d74218b1fc1e4840397dcc387c86a4797377d6) chore: update dependencies (#44)
- [b83c0734](https://github.com/iconix/fortudo/commit/b83c07341aaf44add25cdc1b0a691792a6290440) ci(deps): bump actions/upload-artifact from 6 to 7 (#46)
- [4533f1fb](https://github.com/iconix/fortudo/commit/4533f1fb197417b46559914bd8fe54981c875770) fix: refresh tasks after non-local changes (#48)
- [cf679104](https://github.com/iconix/fortudo/commit/cf6791044c3dbc98938cba1b63440e31afac67ff) fix: polish task scheduling ui flows (#49)
- [e5b177a3](https://github.com/iconix/fortudo/commit/e5b177a37b850077e18ce54e512b49d6bf877f85) Implement activities groundwork through coordinator phase 1.7 (#52)
- [c3bafd1e](https://github.com/iconix/fortudo/commit/c3bafd1e838266a94ecf2d51eb2ce5939d6a2f6f) ci(deps): bump dorny/paths-filter from 3 to 4 (#50)
- [1f1e67b7](https://github.com/iconix/fortudo/commit/1f1e67b79a12e6d182c403c4f84d62cf350ca87a) feat: implement activities phase 2 storage (#53)
- [dd534879](https://github.com/iconix/fortudo/commit/dd534879c75a06d452782b270e3e021541d5f320) docs: update activities design after phase 2
- [7ae2689a](https://github.com/iconix/fortudo/commit/7ae2689a24cc9b1ebbb34046830c0447e3d5004e) feat: implement activities phase 3 settings and categories (#56)
- [10cd0001](https://github.com/iconix/fortudo/commit/10cd0001da62ac7833e65f751ed2b9a3f3b5f55f) chore: simplify dependency update automation (#57)
- [82b1c544](https://github.com/iconix/fortudo/commit/82b1c5448dfc8d8feb8ab9462dd45d26abb27e86) chore(deps-dev): bump @babel/preset-env in the minor-and-patch group (#54)
- [2f037adc](https://github.com/iconix/fortudo/commit/2f037adc73d936e9e53b4114058ec0f3726317dc) ci(deps): bump codecov/codecov-action from 5 to 6 (#58)
- [229627a9](https://github.com/iconix/fortudo/commit/229627a921c51166a98ce561b67638249f03bdec) Phase 3.9 cleanup: remove taxonomy facade and migrate Activities settings (#59)
- [cb90a823](https://github.com/iconix/fortudo/commit/cb90a823733fb66d9d7329e2923933e5dce9b4af) feat: implement phase 4 activity logging (#60)
- [df0a59a6](https://github.com/iconix/fortudo/commit/df0a59a67bad76f255e51d1cc31ee0b0014c6e7a) chore: refresh audited transitive dependencies (#61)
- [520195a6](https://github.com/iconix/fortudo/commit/520195a6c3404190bdbc401289792fd9e7ccd6f6) feat: add activity timer workflow (#62)
- [42a3dfbc](https://github.com/iconix/fortudo/commit/42a3dfbc2dd9c97092cebf65fef9348c69325b4f) ci(deps): bump actions/github-script from 8 to 9 (#63)
- [3c25a29a](https://github.com/iconix/fortudo/commit/3c25a29a637a37b662c7c0bd630382b16d9ae3de) chore(deps-dev): bump prettier in the minor-and-patch group (#64)
- [78365038](https://github.com/iconix/fortudo/commit/78365038367b5cafcb2f15e1a1c1a16dd9c80ac4) ci: separate production and dev security audits (#65)
- [48e8df0d](https://github.com/iconix/fortudo/commit/48e8df0d275bd63dcc40fdba7ebac4bb5d9659cb) Add category editing parity for tasks (#67)
- [e77806d3](https://github.com/iconix/fortudo/commit/e77806d3e72c87351df2553c4f988acc01a85887) Add Phase 5 activities insights view (#71)
- [65074809](https://github.com/iconix/fortudo/commit/65074809e84c3dc114269d01dd0db72ecc2f2f52) ci(deps): bump actions/dependency-review-action from 4 to 5 (#69)
- [8dcae5a4](https://github.com/iconix/fortudo/commit/8dcae5a40769a7fb7992fed53650e77603bb5332) chore(deps-dev): bump the minor-and-patch group across 1 directory with 7 updates (#73)
- [df64fa1a](https://github.com/iconix/fortudo/commit/df64fa1a9e61afc2612cda57cba43b0150999523) ci(deps): bump codecov/codecov-action from 6 to 7 (#74)
- [df76a65f](https://github.com/iconix/fortudo/commit/df76a65fe8e3eae48396a3b382fe30861cff7878) Polish activity sync and taxonomy settings (#77)
- [fa057de5](https://github.com/iconix/fortudo/commit/fa057de5e884e8ec25d984889db959b3f9bfd130) Add do-now scheduled task action (#78)
- [933f1fdb](https://github.com/iconix/fortudo/commit/933f1fdb7b8faefa249cc78e02c2383e322089e8) chore(deps-dev): bump prettier from 3.8.3 to 3.9.1 (#76)
- [89f477de](https://github.com/iconix/fortudo/commit/89f477deaebec8e4d80ee40d8a4663020c8b76ab) ci(deps): bump actions/checkout from 6 to 7 (#75)
- [cd0390cf](https://github.com/iconix/fortudo/commit/cd0390cfac000e7e756aef8582ebbfb69b1e9746) Fix running timer display after sync (#79)
- [6b6a37df](https://github.com/iconix/fortudo/commit/6b6a37df399822c0471f7630fcc40c849644df3b) Harden production Firebase deploy retries (#80)
- [c926296f](https://github.com/iconix/fortudo/commit/c926296f845556a43c0af21a84821b5683a37f21) Phase 6A/B: polish transitions and mobile timeline (#81)
- [2b085337](https://github.com/iconix/fortudo/commit/2b085337617ad30d9e7cd8d05b08ee027100bbb1) Fix timeline block label overflow (#85)
- [ec85e931](https://github.com/iconix/fortudo/commit/ec85e9310ce60be6864696a14823bd749363fad8) Phase 6C: add Activities onboarding polish (#84)
- [60025f17](https://github.com/iconix/fortudo/commit/60025f1762517e27eb2ad5928868403b5741cc72) Phase 6D: add persistence E2E coverage (#83)
- [83e9213f](https://github.com/iconix/fortudo/commit/83e9213f8460a9045a05c1e6c8ec2e7900e13744) Consolidate E2E suites and preview smoke structure
- [cc1aec15](https://github.com/iconix/fortudo/commit/cc1aec15f92dbe9bc8fb4ba2d78f319ac8195b50) chore(deps-dev): bump prettier from 3.9.1 to 3.9.4
- [f894a11f](https://github.com/iconix/fortudo/commit/f894a11fef79b7a7f1dab28da09729b122057de0) docs: close activities implementation plan (#88)
- [ae99fa0b](https://github.com/iconix/fortudo/commit/ae99fa0bfc210be6470569a55b2550270531ff53) Fix completed unscheduled tasks and activity overlaps (#89)
- [c0efd2ab](https://github.com/iconix/fortudo/commit/c0efd2ab628b1b8678c301cf66fa395569701746) feat: add installable PWA shell (#90)
- [038af3e3](https://github.com/iconix/fortudo/commit/038af3e38f209592b3c84f993eb60a8573b739d5) feat: make PWA assets offline-capable (#91)
- [e5b4ce64](https://github.com/iconix/fortudo/commit/e5b4ce646afaab29e8c3b244c814f290631a515c) feat: polish offline PWA experience (#92)
- [524a7019](https://github.com/iconix/fortudo/commit/524a7019274c85c8a7764b20f0422edff2aecde9) Use slate background for PWA icons (#94)
- [73a586aa](https://github.com/iconix/fortudo/commit/73a586aa223215affec4e71b8f58c537023889a1) ci: restore preview URL PR comment (#95)
- [d1c7b694](https://github.com/iconix/fortudo/commit/d1c7b694718fac02d385f4aabfc1d2ba1b4896a5) chore(deps-dev): bump prettier in the minor-and-patch group (#93)
- [69e3a37b](https://github.com/iconix/fortudo/commit/69e3a37b3fc1b64c0f58618e5faeef8f31559fd2) Add manual ordering for unscheduled tasks (#96)
- [9d220623](https://github.com/iconix/fortudo/commit/9d22062398e9b44d7a70d44070a9e463a352ed50) test: establish reproducible test boundaries (#98)
- [6941649c](https://github.com/iconix/fortudo/commit/6941649c8d1cf3687dfc30b1ce843ddfbf00b064) Rebrand Fortudo in violet and polish the Android PWA (#97)
- [00dedc88](https://github.com/iconix/fortudo/commit/00dedc887903f453b3a028089cf7736e8712e4d5) Update release announcement and hide overlap repair (#99)
- [d26c246e](https://github.com/iconix/fortudo/commit/d26c246e2b69d17e8301dbff5d9926f5b848e15d) ci(deps): bump actions/setup-python from 6 to 7 (#100)
- [8d4ab1a2](https://github.com/iconix/fortudo/commit/8d4ab1a267b8c0c3ca5e927de000fe3dcd3943e3) ci(deps): bump actions/setup-node from 6 to 7 (#101)
- [2d936380](https://github.com/iconix/fortudo/commit/2d9363808338f164c56dd9bf5b97f216369355fd) Fix activity timer elapsed counter (#102)
- [bf9c6460](https://github.com/iconix/fortudo/commit/bf9c6460cc72c546051200f7ed1b2f199fab29a8) Harden entity and taxonomy identity (#103)
- [ffe086d6](https://github.com/iconix/fortudo/commit/ffe086d64059948d5e574b3d7ce80524054a46de) Harden document contracts and migration recovery (#104)
- [eaf2447e](https://github.com/iconix/fortudo/commit/eaf2447e16ab2d734cb010d1f55f926638e0c484) Fix document contract operations CLI entry point (#105)
- [c77ce635](https://github.com/iconix/fortudo/commit/c77ce6357d751da5facde63e931e9508dff45218) Record temporary unencrypted backup override (#106)
- [1eff7b34](https://github.com/iconix/fortudo/commit/1eff7b341422aac6044cb9d28a994e5f21147c07) Harden Cloudant target state binding (#107)
- [e4c7cfcd](https://github.com/iconix/fortudo/commit/e4c7cfcd74d2a0ee02db3a530c706f8704726846) Remove premature Cloudant backup tooling (#108)
- [e0c33d6d](https://github.com/iconix/fortudo/commit/e0c33d6d42644534791b0bd0a49954adb07df0b8) Add minimal Cloudant quarantine migration (#109)
- [eed17965](https://github.com/iconix/fortudo/commit/eed179657055fe828c9ac66054bedcf1f0728c45) Bind Cloudant capture to verified preflight (#110)
- [a315f959](https://github.com/iconix/fortudo/commit/a315f95934f20ed3e85daf139b0bd67c430854dc) Separate reusable Cloudant migration boundaries (#111)
- [c467859e](https://github.com/iconix/fortudo/commit/c467859ef05793cc812230d1a184a7a79d3f198e) Make synced startup immediately usable (#113)
- [353047fd](https://github.com/iconix/fortudo/commit/353047fde06fe7ee8d2992c3a70433f95fafb038) Show category colors on activity timers (#118)
- [f9a0bdb0](https://github.com/iconix/fortudo/commit/f9a0bdb09847df3928eda028119563fa5269224c) Improve taxonomy visibility and color choices (#117)
- [4f97d234](https://github.com/iconix/fortudo/commit/4f97d23480c252d26a269364c855c731b908b900) Show data issues in today's activities (#115)
- [704ebc2f](https://github.com/iconix/fortudo/commit/704ebc2fbd022e6152e831e3a7ecfafaa609cbce) Make scheduled task actions reliable on mobile (#114)
- [1ff49375](https://github.com/iconix/fortudo/commit/1ff49375347e678cb4e5597a258fa08050fe405e) chore(deps-dev): bump prettier in the minor-and-patch group (#112)
- [2cf91205](https://github.com/iconix/fortudo/commit/2cf9120572c32268f9f5a3cc99812b0f90f35f91) Harden overlap repair with an exact preview (#116)
- [411609c5](https://github.com/iconix/fortudo/commit/411609c5af21afbd785bab99dbea9231f18e4eed) Surface overlap repair in Today (#119)
- [9f124a11](https://github.com/iconix/fortudo/commit/9f124a119f370c14d41c0fc76dced5b39797e2c0) Repair overlaps against the current timer (#120)
- [d934d9e5](https://github.com/iconix/fortudo/commit/d934d9e5ade6e419a55508de452d540ae5e1ca90) chore(deps-dev): bump the minor-and-patch group across 1 directory with 6 updates (#123)
- [9bc2e216](https://github.com/iconix/fortudo/commit/9bc2e2164b4319d622301727a41eb1ff43e0675f) Make startup edits and sync recovery safe and resumable (#124)
- [79855f85](https://github.com/iconix/fortudo/commit/79855f8523bb84b6c29f37ccdac79c9d3b62316e) Repair legacy cloud recovery without replaying obsolete deletions (#128)
- [2a459dc9](https://github.com/iconix/fortudo/commit/2a459dc995d965552f9de86b741af029d32326d4) Prevent checkpoint-write bursts during sync (#129)
- [a2a2fef6](https://github.com/iconix/fortudo/commit/a2a2fef653a64b6ab0df78dc12be992a0bd9bbf4) Show recovery progress and explain repair waits (#130)
- [71a6c51c](https://github.com/iconix/fortudo/commit/71a6c51ce9dc1e2552489543bcd66e374d9e82c5) Handle expired deletion markers without blocking rooms (#131)
- [a9ffc72a](https://github.com/iconix/fortudo/commit/a9ffc72a7a06fe32df9292385ada6862381a7e85) Fix inline task editor layout overflow (#133)
- [685353c1](https://github.com/iconix/fortudo/commit/685353c1e0c14187d24e1e59171f6be77a13753e) Make inline editors consistent across tasks and activities (#134)
- [8dceb3cd](https://github.com/iconix/fortudo/commit/8dceb3cd9749c3fac5af11ce279bb0cf74e3419d) Freeze the v1 document contract and export a verified artifact (#125)
- [7a9a7c7f](https://github.com/iconix/fortudo/commit/7a9a7c7f843ee4fbfd571c170e5c15c49ab0d2ab) chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates (#132)

## Other audited commits

The identifiers below can be resolved from the audit checkout. GitHub can display archived objects only while its service retains them.

- `5054172b` Local merge adding the seventh guard branch and refreshing the combined stamps.
- `049778f0` Local merge combining six independently published guard branches.
- `24727346` Same stable patch as #105 1fd44e1.
- `e09c18be` Intermediate #91 update-toast variant with conflict markers in the worker.
- `2b608ba9` Intermediate #91 asset variant with conflict markers and package-script indentation differences.
- `b302b8c5` Intermediate #91 Tailwind variant with conflict markers. Original worker failed the registration E2E.
- `da5bd441` Same stable patch as #92 be2664c.
- `77d7a865` Same stable patch as #92 24e3848.
- `ae6970b2` Same source and tests as #92 72b20a7; generated stamps differ.
- `5d332d88` Same source and tests as #92 0d91a70; generated stamps differ.
- `133d7fda` Same source and tests as #91 fa5396d; generated stamps differ.
- `a39cd1c7` Same source and tests as #91 4774cdd; generated stamps differ.
- `0d85e38e` Same source and tests as #91 d73dbff; generated stamps differ.

## Superseded ref history

The timeline recorded 68 head and four base force pushes. Both endpoints of every event resolved. Listed below are the 75 additional ancestors found beyond the 783 other audited objects. Numbers identify the PRs whose force-push history reached the commit.

- [b90888bb](https://github.com/iconix/fortudo/commit/b90888bb2931c413b09d0ffa6fff3676c56c4187) chore(deps-dev): bump the minor-and-patch group with 3 updates ([#8](https://github.com/iconix/fortudo/pull/8)).
- [2e1c7e95](https://github.com/iconix/fortudo/commit/2e1c7e956d800f4e5789c4c788bde45e3a2f2ec3) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [451fbcf6](https://github.com/iconix/fortudo/commit/451fbcf61b5000e05912966d037fa815d2103a95) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [455d895e](https://github.com/iconix/fortudo/commit/455d895eeffcc28326ad3ce579f73d2d9f025abe) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [508a0729](https://github.com/iconix/fortudo/commit/508a07296c2abf28d4f8c26d293503e32ad47af0) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [56f9f6c3](https://github.com/iconix/fortudo/commit/56f9f6c359173a4740fe4031a2290ae31b6a5a51) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [636e625e](https://github.com/iconix/fortudo/commit/636e625e06e2117178f119e73f18bb4f8f6fad85) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [6e22a4ce](https://github.com/iconix/fortudo/commit/6e22a4ce1b87712ef2fe9fe1f50cead199f56a32) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [7baeb202](https://github.com/iconix/fortudo/commit/7baeb202a58658bbe00b1ef3f2e3228b147a676b) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [8abd990f](https://github.com/iconix/fortudo/commit/8abd990fc8bae8c7c79a2c7ee81bc33e956279f3) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [aa6ac965](https://github.com/iconix/fortudo/commit/aa6ac965ea752533d47ba0c3179cbb0f93e3a24d) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [c328e4f8](https://github.com/iconix/fortudo/commit/c328e4f86b07de4fb98f3cc6c9a5586e6af6e951) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [cdc95098](https://github.com/iconix/fortudo/commit/cdc9509858d523957296587cfbc6a4f43c4a1b8c) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [e4a94b8c](https://github.com/iconix/fortudo/commit/e4a94b8c556457763ba76ff670d494380b813e63) chore: update dependencies ([#13](https://github.com/iconix/fortudo/pull/13)).
- [274b0b87](https://github.com/iconix/fortudo/commit/274b0b87031abd87d637605cc94a4a1c91b1b3f2) ci(deps): bump actions/download-artifact from 4 to 5 ([#18](https://github.com/iconix/fortudo/pull/18)).
- [222d872b](https://github.com/iconix/fortudo/commit/222d872b82e19a5c65dd83c73048daad18620c3f) ci(deps): bump actions/checkout from 4 to 5 ([#19](https://github.com/iconix/fortudo/pull/19)).
- [32b72495](https://github.com/iconix/fortudo/commit/32b72495e7dd6699036944b738fc5ec08720a184) ci(deps): bump actions/github-script from 7 to 8 ([#20](https://github.com/iconix/fortudo/pull/20)).
- [1e8a4c08](https://github.com/iconix/fortudo/commit/1e8a4c08cf2f54158f89f1cb6bed6b92df8aac51) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [209f5282](https://github.com/iconix/fortudo/commit/209f528227e69cb7fb06ef38df75c0b5abe0ac7d) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [35f8e8cd](https://github.com/iconix/fortudo/commit/35f8e8cda4fac3a98234e600fe8c96253cc8b3ee) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [4b7ec876](https://github.com/iconix/fortudo/commit/4b7ec876d979ff2c45632cd07c6ee0033536a5c3) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [5d46158a](https://github.com/iconix/fortudo/commit/5d46158a3a268fe8864e796539345ce8a393324b) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [6306f8df](https://github.com/iconix/fortudo/commit/6306f8df9c85fa859774a2d5cf2bcf20a7da2ec2) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [7e342dbc](https://github.com/iconix/fortudo/commit/7e342dbc102116567e75f412d9efaa0a0fcaca2e) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [9abd87f4](https://github.com/iconix/fortudo/commit/9abd87f4ed0132e90ea11482095d74f752ed8e80) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [9d0e2c01](https://github.com/iconix/fortudo/commit/9d0e2c01ad9af47e9f67734d87eb47803b579a4c) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [9f336b0f](https://github.com/iconix/fortudo/commit/9f336b0f677c6a828404f6b46c230e9e175e87c4) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [d2142a06](https://github.com/iconix/fortudo/commit/d2142a060d6c107a1f174454b19408f52eb2c255) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [d6be3324](https://github.com/iconix/fortudo/commit/d6be332434656c6a283fdd0f9c550d96090f3369) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [e166e562](https://github.com/iconix/fortudo/commit/e166e56210eeda0a3e34c5c230f322865fffdb7d) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [f32c6bbc](https://github.com/iconix/fortudo/commit/f32c6bbc6171f4f0d1721ab5ee2d23a04d6f5626) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [f387be38](https://github.com/iconix/fortudo/commit/f387be3854a0c861e26067be77b2914272cef65d) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [f7bf1a61](https://github.com/iconix/fortudo/commit/f7bf1a612e6a7260be35726fbaf8c6f443dd7084) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [fa866f9a](https://github.com/iconix/fortudo/commit/fa866f9aa15b0e7d23fd954ae1634e7fc6475bf7) chore: update dependencies ([#21](https://github.com/iconix/fortudo/pull/21)).
- [9049b1a3](https://github.com/iconix/fortudo/commit/9049b1a318f53aa9302a5dd3ee709873fee876b6) ci(deps): bump github/codeql-action from 3 to 4 ([#23](https://github.com/iconix/fortudo/pull/23)).
- [1a488e05](https://github.com/iconix/fortudo/commit/1a488e05be1c6efacf4f1316692957c00d98b635) ci(deps): bump actions/setup-node from 4 to 6 ([#24](https://github.com/iconix/fortudo/pull/24)).
- [b7a7b710](https://github.com/iconix/fortudo/commit/b7a7b710d998aa4ae5986e8bdc66f9f08a7f3d29) ci(deps): bump actions/download-artifact from 5 to 6 ([#26](https://github.com/iconix/fortudo/pull/26)).
- [cf9e6a61](https://github.com/iconix/fortudo/commit/cf9e6a610aa3d7e7b79543987e7fe25a749fa538) chore(deps-dev): bump the minor-and-patch group across 1 directory with 4 updates ([#29](https://github.com/iconix/fortudo/pull/29)).
- [53c46005](https://github.com/iconix/fortudo/commit/53c46005ac79db486a8f8f093a581f4b459f0c83) chore: update dependencies ([#30](https://github.com/iconix/fortudo/pull/30)).
- [7e68769a](https://github.com/iconix/fortudo/commit/7e68769a71f6d7d354b289ed0a1f2af5c4dba389) chore: update dependencies ([#30](https://github.com/iconix/fortudo/pull/30)).
- [498c2f25](https://github.com/iconix/fortudo/commit/498c2f250a5cedd8edd1a7990a6a92dd56cc28cd) chore(deps-dev): bump the minor-and-patch group with 4 updates ([#34](https://github.com/iconix/fortudo/pull/34)).
- [0941820e](https://github.com/iconix/fortudo/commit/0941820eba80647acf22012a1e5259e6cba8f0db) chore: update dependencies ([#44](https://github.com/iconix/fortudo/pull/44)).
- [8e778c65](https://github.com/iconix/fortudo/commit/8e778c653c760339af5859b714345183265300c6) chore: update dependencies ([#44](https://github.com/iconix/fortudo/pull/44)).
- [f9794eae](https://github.com/iconix/fortudo/commit/f9794eae14bf3430b5675e3e8031a3fb3494d056) ci(deps): bump actions/download-artifact from 7 to 8 ([#45](https://github.com/iconix/fortudo/pull/45)).
- [dadd6a45](https://github.com/iconix/fortudo/commit/dadd6a45ca6077741fa020dab0a2915b9ba60014) ci(deps): bump actions/upload-artifact from 6 to 7 ([#46](https://github.com/iconix/fortudo/pull/46)).
- [7f04ebeb](https://github.com/iconix/fortudo/commit/7f04ebeb4b29a56909505d0e9b948b33fb9f6289) chore: update dependencies ([#51](https://github.com/iconix/fortudo/pull/51)).
- [9793a732](https://github.com/iconix/fortudo/commit/9793a732035eebcbfd666424a2c37333757f6401) chore(deps-dev): bump @babel/preset-env in the minor-and-patch group ([#54](https://github.com/iconix/fortudo/pull/54)).
- [f516a60c](https://github.com/iconix/fortudo/commit/f516a60c4cfc54f55b50c63d9ca72c4edbdbacec) chore(deps-dev): bump prettier in the minor-and-patch group ([#76](https://github.com/iconix/fortudo/pull/76)).
- [5a748b69](https://github.com/iconix/fortudo/commit/5a748b69da3bc41349f752e71f7d0e60bbaa4663) Add Escape handling for custom modals ([#82](https://github.com/iconix/fortudo/pull/82), [#83](https://github.com/iconix/fortudo/pull/83)). Compared with [37dc86f3](https://github.com/iconix/fortudo/commit/37dc86f3ebc23fc118a7095fcb7f1679c1a5d0d1).
- [87418b6a](https://github.com/iconix/fortudo/commit/87418b6acfd354bd5f9cf69f31f549cccc87e37a) Add Escape handling for custom modals ([#82](https://github.com/iconix/fortudo/pull/82), [#83](https://github.com/iconix/fortudo/pull/83)). Compared with [37dc86f3](https://github.com/iconix/fortudo/commit/37dc86f3ebc23fc118a7095fcb7f1679c1a5d0d1).
- [2d9d7b5d](https://github.com/iconix/fortudo/commit/2d9d7b5d4bdb1bc18cc2b143f961b3db3b16a697) Add one-time Activities whats new modal ([#82](https://github.com/iconix/fortudo/pull/82), [#83](https://github.com/iconix/fortudo/pull/83)). Compared with [1eda903c](https://github.com/iconix/fortudo/commit/1eda903c2fd81efddbcf5854b3ccec256c80aea9).
- [8ff07259](https://github.com/iconix/fortudo/commit/8ff072594fcd86f52a5bdd7989500c83524199e2) Add one-time Activities whats new modal ([#82](https://github.com/iconix/fortudo/pull/82), [#83](https://github.com/iconix/fortudo/pull/83)). Compared with [1eda903c](https://github.com/iconix/fortudo/commit/1eda903c2fd81efddbcf5854b3ccec256c80aea9).
- [380750ed](https://github.com/iconix/fortudo/commit/380750ed36cd2dd1b692f451a00e94fb29eca874) Add room-scoped Activities onboarding ([#82](https://github.com/iconix/fortudo/pull/82), [#83](https://github.com/iconix/fortudo/pull/83)). Compared with [281946c6](https://github.com/iconix/fortudo/commit/281946c6dd8a1d487c7fd84acfe09c16ff71fc38).
- [d23ba568](https://github.com/iconix/fortudo/commit/d23ba5683bf8a8e3bf2547be661c31201b432c00) Add room-scoped Activities onboarding ([#82](https://github.com/iconix/fortudo/pull/82), [#83](https://github.com/iconix/fortudo/pull/83)). Compared with [281946c6](https://github.com/iconix/fortudo/commit/281946c6dd8a1d487c7fd84acfe09c16ff71fc38).
- [2a0f0902](https://github.com/iconix/fortudo/commit/2a0f0902d098ec93b906a79d486049cf80cafd07) Add Escape handling for custom modals ([#83](https://github.com/iconix/fortudo/pull/83), [#84](https://github.com/iconix/fortudo/pull/84)). Compared with [37dc86f3](https://github.com/iconix/fortudo/commit/37dc86f3ebc23fc118a7095fcb7f1679c1a5d0d1).
- [2c097b5f](https://github.com/iconix/fortudo/commit/2c097b5ff454c0cb2ec25d5fc28edb11f27cb62f) Add Phase 6 persistence E2E coverage ([#83](https://github.com/iconix/fortudo/pull/83)). Compared with [caa16ffd](https://github.com/iconix/fortudo/commit/caa16ffd4262a16b8c77976b578a59a250a79e7c).
- [548853ad](https://github.com/iconix/fortudo/commit/548853adfbacaa8091f0f097698cf1b189a93d10) Add Phase 6 persistence E2E coverage ([#83](https://github.com/iconix/fortudo/pull/83)). Compared with [caa16ffd](https://github.com/iconix/fortudo/commit/caa16ffd4262a16b8c77976b578a59a250a79e7c).
- [5d932df4](https://github.com/iconix/fortudo/commit/5d932df4901db20e729b694f84bfbb1b6ce36943) Add Phase 6 persistence E2E coverage ([#83](https://github.com/iconix/fortudo/pull/83)). Compared with [caa16ffd](https://github.com/iconix/fortudo/commit/caa16ffd4262a16b8c77976b578a59a250a79e7c).
- [6460ca90](https://github.com/iconix/fortudo/commit/6460ca9029645c2afd15b4f86aa7190ac5c6f03d) Add Phase 6 persistence E2E coverage ([#83](https://github.com/iconix/fortudo/pull/83)). Compared with [caa16ffd](https://github.com/iconix/fortudo/commit/caa16ffd4262a16b8c77976b578a59a250a79e7c).
- [c942aaf0](https://github.com/iconix/fortudo/commit/c942aaf017be5405787e0d9cf5be9b14afe0bc8b) Add Phase 6 persistence E2E coverage ([#83](https://github.com/iconix/fortudo/pull/83)). Compared with [caa16ffd](https://github.com/iconix/fortudo/commit/caa16ffd4262a16b8c77976b578a59a250a79e7c).
- [ffd76291](https://github.com/iconix/fortudo/commit/ffd76291c566c3104341687c8e0e5bca2ebc3837) Add Phase 6 persistence E2E coverage ([#83](https://github.com/iconix/fortudo/pull/83)). Compared with [caa16ffd](https://github.com/iconix/fortudo/commit/caa16ffd4262a16b8c77976b578a59a250a79e7c).
- [2d9a8949](https://github.com/iconix/fortudo/commit/2d9a894960d88a31cef31ae03a45e96a21ae2733) Add one-time Activities whats new modal ([#83](https://github.com/iconix/fortudo/pull/83), [#84](https://github.com/iconix/fortudo/pull/84)). Compared with [1eda903c](https://github.com/iconix/fortudo/commit/1eda903c2fd81efddbcf5854b3ccec256c80aea9).
- [1af78b71](https://github.com/iconix/fortudo/commit/1af78b7126de45c3b988bd1aea8857444cf8cdbf) Add room-scoped Activities onboarding ([#83](https://github.com/iconix/fortudo/pull/83), [#84](https://github.com/iconix/fortudo/pull/84)). Compared with [281946c6](https://github.com/iconix/fortudo/commit/281946c6dd8a1d487c7fd84acfe09c16ff71fc38).
- [1c5eb109](https://github.com/iconix/fortudo/commit/1c5eb1099862da1656e0a5d53f8e5cad49c85107) docs: close activities implementation plan ([#88](https://github.com/iconix/fortudo/pull/88)). Compared with [e1c31045](https://github.com/iconix/fortudo/commit/e1c31045452f56fa8d0d643e922e7bebe96a7b5d).
- [7f5e3c0d](https://github.com/iconix/fortudo/commit/7f5e3c0d80f232487993092c8e03112e2166aa7b) docs: close activities implementation plan ([#88](https://github.com/iconix/fortudo/pull/88)). Compared with [e1c31045](https://github.com/iconix/fortudo/commit/e1c31045452f56fa8d0d643e922e7bebe96a7b5d).
- [d8049536](https://github.com/iconix/fortudo/commit/d804953651d7247b911037d855ad10727c3a9e7d) docs: close activities implementation plan ([#88](https://github.com/iconix/fortudo/pull/88)). Compared with [e1c31045](https://github.com/iconix/fortudo/commit/e1c31045452f56fa8d0d643e922e7bebe96a7b5d).
- [ddd56ccb](https://github.com/iconix/fortudo/commit/ddd56ccbf85573df71d8a570da48b93b6e649558) docs: close activities implementation plan ([#88](https://github.com/iconix/fortudo/pull/88)). Compared with [e1c31045](https://github.com/iconix/fortudo/commit/e1c31045452f56fa8d0d643e922e7bebe96a7b5d).
- [658451b4](https://github.com/iconix/fortudo/commit/658451b40acf39cf3bc46f2a2ab94176a7266237) Add activity overlap truncation action ([#89](https://github.com/iconix/fortudo/pull/89)). Compared with [3aaf9fd5](https://github.com/iconix/fortudo/commit/3aaf9fd563d54b28bb007774f64017f7d522e3f4).
- [a8cc5f92](https://github.com/iconix/fortudo/commit/a8cc5f92b8c3169526e63f7f51cae020a1821d0c) Add activity overlap truncation action ([#89](https://github.com/iconix/fortudo/pull/89)). Compared with [3aaf9fd5](https://github.com/iconix/fortudo/commit/3aaf9fd563d54b28bb007774f64017f7d522e3f4).
- [308597ef](https://github.com/iconix/fortudo/commit/308597efa07ec76842c5dcb5a443c28a1c900bc3) Fix completed unscheduled task cleanup and actions ([#89](https://github.com/iconix/fortudo/pull/89)). Compared with [3f3abf51](https://github.com/iconix/fortudo/commit/3f3abf512b39778243cdc1205b551ac52e2f34ea).
- [30e12206](https://github.com/iconix/fortudo/commit/30e122064db16a45cebbb2e4c4bd689d96c0399b) Fix completed unscheduled task cleanup and actions ([#89](https://github.com/iconix/fortudo/pull/89)). Compared with [3f3abf51](https://github.com/iconix/fortudo/commit/3f3abf512b39778243cdc1205b551ac52e2f34ea).
- [56ed6168](https://github.com/iconix/fortudo/commit/56ed61688d0b80c54be364db41bb0014a5de0eac) chore(deps-dev): bump prettier in the minor-and-patch group ([#112](https://github.com/iconix/fortudo/pull/112)).
- [75ada4cd](https://github.com/iconix/fortudo/commit/75ada4cd41186d1059461e09ce5f146bdd53943d) chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates ([#132](https://github.com/iconix/fortudo/pull/132)).
- [e82ab264](https://github.com/iconix/fortudo/commit/e82ab264b4a885f947ae4ff4e80b7bbebd7309d1) chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates ([#132](https://github.com/iconix/fortudo/pull/132)).
- [ffbea014](https://github.com/iconix/fortudo/commit/ffbea0144b6e85a47781f7f4539a9030f8fbc61b) chore(deps-dev): bump the minor-and-patch group across 1 directory with 3 updates ([#132](https://github.com/iconix/fortudo/pull/132)).
