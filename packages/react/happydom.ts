import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()
// React act() flag outside testing-library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
