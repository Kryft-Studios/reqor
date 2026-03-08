[Read Docs](https://briklab.pages.dev/packages/reqor/introduction)
[Github Repository](https://github.com/Kryft-Studios/reqor)

# @briklab/reqor

`@briklab/reqor` is a small wrapper for the `fetch` function which lets you easily use fetch without any complexity.

## Install

Follow the [common installation tutorial](/packages/common-installation-tutorial)

## Quick Start

```js
import reqor from "@briklab/reqor"
const url = "https://google.com" // or your own url. this url is just a placeholder
const response = await reqor(url).retry(5).get() // get with 5 retries
console.log(response)
```

## API

### Exported:
#### Functions:
- [reqor](https://briklab.pages.dev/packages/reqor/functions/reqor.md)

### Other (Not Exported but used in reqor internally):
#### Classes:
- [Reqor](https://briklab.pages.dev/packages/reqor/classes/reqor.md)

#### Types:
- [ReqorGetOptions](https://briklab.pages.dev/packages/reqor/types/reqorgetoptions)
- [ReqorLocalMiddlewareInput](https://briklab.pages.dev/packages/reqor/types/reqorlocalmiddlewareinput)
- [ReqorMiddleware](https://briklab.pages.dev/packages/reqor/types/reqormiddleware)
- [ReqorMiddlewareContext](https://briklab.pages.dev/packages/reqor/types/reqormiddleware)
- [ReqorRetryConfig](https://briklab.pages.dev/packages/reqor/types/reqorretryconfig)
- [ReqorPostOptions](https://briklab.pages.dev/packages/reqor/types/reqorpostoptions)
- [ReqorSub](https://briklab.pages.dev/packages/reqor/types/reqorsub)
- [ReqorTimeoutConfig](https://briklab.pages.dev/packages/reqor/types/reqortimeoutconfig)
- [ReqorTotalTimeoutConfig](https://briklab.pages.dev/packages/reqor/types/reqortotaltimeoutconfig)

#### Namespaces:
- [Reqor (merged into [Reqor](classes/reqor.md))](https://briklab.pages.dev/packages/reqor/namespaces/reqor.md)


## Tutorials

- [Installation](https://briklab.pages.dev/packages/reqor/tutorial/installation)
- [Getting Started](https://briklab.pages.dev/packages/reqor/tutorial/getting-started)
- [Examples](https://briklab.pages.dev/packages/reqor/tutorial/examples)
- [Advanced](https://briklab.pages.dev/packages/reqor/tutorial/advanced)