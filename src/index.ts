// @ts-check
//#region Defining JSTC handler
import JSTC from "@briklab/lib/jstc";
JSTC.addCustomHandler("checkurl", (string: any) => {
  if (typeof string !== "string") return false;
  if (!/^[a-zA-Z]+:\/\/[^\s]+$/.test(string)) return false;
  return true;
});
//#endregion Defining JSTC handler

const REQOR_ARRAY_INDEX_GET = Symbol("reqor.arrayIndexGet");
const REQOR_ARRAY_INDEX_SET = Symbol("reqor.arrayIndexSet");
const REQOR_ARRAY_LENGTH_GET = Symbol("reqor.arrayLengthGet");

/**
 * Configuration for retries 
*/
export type ReqorRetryConfig = {
  /**
   * How many retries to attempt.
   *
   * **`Important`**: If you called `Reqor.retry` before, the value will be overriden.
   */
  number: number;
  /**
   * Config for delay after a attempt to connect
   *
   * **`Important`**: If you called `Reqor.retryDelay` before, the value will be overriden.
   */
  delay?: {
    /**
     * Time to delay after a attempt to connect
     *
     * **`Important`**: If you called `Reqor.retryDelay` before, the value will be overriden.
     */
    number: number;

    /**
     * Function to increase delay after a retry
     *
     * **`Important`**: If you called `Reqor.retryDelay` before, the value will be overriden.
     */
    increaseFn?: (current: number) => number;
  };
  /**
   * Function that executes on a retry.
   *
   * **`Important`**: If you called `Reqor.onRetry` before, the value will be overriden.
   */
  onRetry?: (retryNumber?: number) => any;
};

/**
 * Configuration for timeouts
*/
export type ReqorTimeoutConfig = {
  /**
   * Function that executes after a timeout
   *
   * **`Important`**: If you called `Reqor.onTimeout` before, the value will be overriden.
   */
  onTimeout?: (retryNumber?: number) => any;

  /**
   * Amount of timeout for a attempt
   *
   * **`Important`**: If you called `Reqor.timeout` before, the value will be overriden.
   */
  time: number;
};
/**
 * Configuration for totalTimeouts
*/
export type ReqorTotalTimeoutConfig = {
  /**
   * Amount of timeout for the whole attempt to connect
   *
   * **`Important`**: If you called `Reqor.totalTimeout` before, the value will be overriden.
   */
  time: number;

  /**
   * Function that executes after a total timeout
   *
   * **`Important`**: If you called `Reqor.onTotalTimeout` before, the value will be overriden.
   */
  onTimeout?: () => any;
};

type ReqorSub = "Reqor.get" | "Reqor.post";
export type ReqorMiddlewareContext = {
  url: string;
  init: RequestInit;
  sub: ReqorSub;
};
/**
 * Type for middlewares in reqor
*/
type ReqorMiddleware = {
    /**
     * A function that executes 
     * 
     * **`Important`**: If you called `Reqor.retryDelay` before, the value will be overriden.
     */
  before?: (
    context: ReqorMiddlewareContext,
  ) =>
    | void
    | Partial<Pick<ReqorMiddlewareContext, "url" | "init">>
    | Promise<void | Partial<Pick<ReqorMiddlewareContext, "url" | "init">>>;
  after?: (
    response: Reqor.Response,
    context: ReqorMiddlewareContext,
  ) => void | Reqor.Response | Promise<void | Reqor.Response>;
  onError?: (
    error: any,
    context: ReqorMiddlewareContext,
  ) => void | any | Promise<void | any>;
};
type ReqorLocalMiddlewareInput = ReqorMiddleware | ReqorMiddleware[];
type ReqorGetOptions = {
  retry?: ReqorRetryConfig;
  timeout?: ReqorTimeoutConfig;
  totalTimeout?: ReqorTotalTimeoutConfig;
  params?: { [key: string]: string | number | boolean | null | undefined }[];
  middleware?: ReqorLocalMiddlewareInput;
};
type ReqorPostOptions = ReqorGetOptions;

function isReqorHeaders(value: unknown): value is Reqor.Headers.Map {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Reqor.Headers.Map).getHeadersClass === "function"
  );
}

function isReqorMiddleware(value: unknown): value is ReqorMiddleware {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.before === "function" ||
    typeof candidate.after === "function" ||
    typeof candidate.onError === "function"
  );
}

function normalizeLocalMiddleware(
  input?: ReqorLocalMiddlewareInput,
): ReqorMiddleware[] | undefined {
  if (!input) return undefined;
  const list = Array.isArray(input) ? input : [input];
  return list.filter(isReqorMiddleware);
}

function normalizeGetOptions(
  input?: ReqorGetOptions | ReqorLocalMiddlewareInput,
): ReqorGetOptions {
  if (!input) return {};
  if (Array.isArray(input)) return { middleware: input };
  if (isReqorMiddleware(input)) return { middleware: input };
  return input;
}

function normalizePostOptions(
  input?: ReqorPostOptions | ReqorLocalMiddlewareInput,
): ReqorPostOptions {
  if (!input) return {};
  if (Array.isArray(input)) return { middleware: input };
  if (isReqorMiddleware(input)) return { middleware: input };
  return input;
}

function isArrayIndexKey(property: PropertyKey): property is string {
  return typeof property === "string" && /^(0|[1-9][0-9]*)$/.test(property);
}
//#region The main reqor class
/**
 * The main class for Reqor.
 */
class Reqor {
  #url: string;
  //#region Middle Ware
  static use(middleware: ReqorMiddleware) {
    this.middlewares.push(middleware);
    return this;
  }
  static clearMiddlewares() {
    this.middlewares = [];
  }
  static middlewares: ReqorMiddleware[] = [];
  #middlewares: ReqorMiddleware[] = [];
  use(middleware: ReqorMiddleware) {
    this.#middlewares.push(middleware);
    return this;
  }
  clearMiddlewares() {
    this.#middlewares = [];
    return this;
  }
  #getMiddlewares(localMiddlewares?: ReqorMiddleware[]) {
    return [
      ...Reqor.middlewares,
      ...this.#middlewares,
      ...(localMiddlewares ?? []),
    ];
  }

  async #applyBeforeMiddlewares(
    context: ReqorMiddlewareContext,
    localMiddlewares?: ReqorMiddleware[],
  ): Promise<ReqorMiddlewareContext> {
    let current = context;
    for (const middleware of this.#getMiddlewares(localMiddlewares)) {
      const result = await middleware.before?.(current);
      if (!result) continue;
      current = {
        ...current,
        ...result,
        init: result.init ? { ...current.init, ...result.init } : current.init,
      };
    }
    return current;
  }

  async #applyAfterMiddlewares(
    response: Reqor.Response,
    context: ReqorMiddlewareContext,
    localMiddlewares?: ReqorMiddleware[],
  ): Promise<Reqor.Response> {
    let current = response;
    for (const middleware of this.#getMiddlewares(localMiddlewares)) {
      const result = await middleware.after?.(current, context);
      if (result) {
        current = result;
      }
    }
    return current;
  }

  async #applyErrorMiddlewares(
    error: any,
    context: ReqorMiddlewareContext,
    localMiddlewares?: ReqorMiddleware[],
  ): Promise<any> {
    let currentError = error;
    for (const middleware of this.#getMiddlewares(localMiddlewares)) {
      const result = await middleware.onError?.(currentError, context);
      if (result !== undefined) {
        currentError = result;
      }
    }
    return currentError;
  }
  //#endregion
  //#region GET
  #params: URLSearchParams;
  #retryConfig?: {
    number: ReqorRetryConfig["number"];
    delay?: ReqorRetryConfig["delay"];
    onRetry?: ReqorRetryConfig["onRetry"];
  };
  #timeoutConfig?: ReqorTimeoutConfig;
  #totalTimeoutConfig?: ReqorTotalTimeoutConfig;
  #after?: number;
  /**
   * A function to decide after how much time there is a timeout for a attempt.
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `timeout.time` parameter.
   */
  readonly timeout: (ms: number) => Reqor;
  /**
   * A function to decide after how much time there is a timeout for a attempt.
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `retry.number` parameter.
   */
  readonly retry: (count: number) => Reqor;

  /**
   * A function to decide after how much time there is a timeout for a attempt.
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `totalTimeout` parameter.
   */
  readonly totalTimeout: (ms: number) => Reqor;

  constructor(url: string) {
    this.#url = url;
    this.#params = new URLSearchParams();
    this.timeout = (ms: number) => {
      this.#timeoutConfig = {
        ...(this.#timeoutConfig ?? { time: 0 }),
        time: ms,
      };
      return this;
    };

    ((this.retry = (count: number) => {
      this.#retryConfig = {
        ...(this.#retryConfig ?? { number: 0 }),
        number: count,
      };
      return this;
    }),
      (this.totalTimeout = (ms: number) => {
        this.#totalTimeoutConfig = {
          ...(this.#totalTimeoutConfig ?? { time: 0 }),
          time: ms,
        };
        return this;
      }));
  }

/**
    * After how much time to start performing
    * 
    * **`Important`**: Calling this function again overrides the current option
*/
  after(number: number) {
    if (number < 0) return this;
    this.#after = number;
    return this;
  }

  #buildUrl(
    extraParams?: {
      [key: string]: string | number | boolean | null | undefined;
    }[],
  ) {
    const url = new URL(this.#url);
    const merged = new URLSearchParams(url.search);

    for (const [k, v] of this.#params.entries()) {
      merged.append(k, v);
    }

    if (extraParams) {
      for (const obj of extraParams) {
        for (const [k, v] of Object.entries(obj)) {
          merged.append(k, String(v));
        }
      }
    }

    url.search = merged.toString();
    return url.toString();
  }

  /**
   * ### THIS IS AN ASYNC FUNCTION
   * Send a response to the given URL
   */
  #toReqorResponse(a: globalThis.Response): Reqor.Response {
    return {
      raw: a,
      headers: new Reqor.Headers(a.headers),
      ok: a.ok,
      redirected: a.redirected,
      status: Reqor.createStatus(a.status, a.statusText),
      statusText: a.statusText,
      type: Reqor.createType(a.type),
      url: a.url,
      json: a.json.bind(a),
      text: a.text.bind(a),
      arrayBuffer: a.arrayBuffer.bind(a),
      blob: a.blob.bind(a),
      formData: a.formData.bind(a),
      clone: a.clone.bind(a),
      body: new Reqor.Body(a),
      bodyUsed: a.bodyUsed,
    };
  }

  async #dispatchRequest({
    signal,
    url,
    init,
    sub,
    localMiddlewares,
  }: {
    signal?: AbortSignal;
    url?: string;
    init: RequestInit;
    sub: ReqorSub;
    localMiddlewares?: ReqorMiddleware[];
  }): Promise<Reqor.Response | Reqor.ResponseLater> {
    // build the request url
    const requestUrl = url ?? this.#buildUrl();

    // create the base
    const baseContext: ReqorMiddlewareContext = {
      url: requestUrl,
      init: { ...init, signal },
      sub,
    };
    const middlewareContext = await this.#applyBeforeMiddlewares(
      baseContext,
      localMiddlewares,
    );

    if (this.#after !== undefined) {
      try {
        return await this.#scheduleFetchLater(
          middlewareContext.url,
          this.#after,
          middlewareContext.init.signal as AbortSignal | undefined,
          middlewareContext.init,
          sub,
          middlewareContext,
          localMiddlewares,
        );
      } catch (err: any) {
        throw await this.#applyErrorMiddlewares(
          err,
          middlewareContext,
          localMiddlewares,
        );
      }
    }

    try {
      const a = await this.#requestViaFetch(
        middlewareContext.url,
        middlewareContext.init,
        sub,
      );
      const response = this.#toReqorResponse(a);
      return this.#applyAfterMiddlewares(
        response,
        middlewareContext,
        localMiddlewares,
      );
    } catch (err: any) {
      throw await this.#applyErrorMiddlewares(
        err,
        middlewareContext,
        localMiddlewares,
      );
    }
  }

  async #executeWithPolicies(
    {
      retry,
      timeout,
      totalTimeout,
    }: {
      retry?: ReqorRetryConfig;
      timeout?: ReqorTimeoutConfig;
      totalTimeout?: ReqorTotalTimeoutConfig;
    },
    sub: "Reqor.get" | "Reqor.post",
    attemptRequest: (
      signal?: AbortSignal,
    ) => Promise<Reqor.Response | Reqor.ResponseLater>,
  ): Promise<Reqor.Response | Reqor.ResponseLater> {

    // -----------------
    // FETCHLATER
    // -----------------

    // if `after` config is defined
    if (this.#after !== undefined) {

        // check if theres a timeout
      if (timeout) {

        // create a abort controller
        const controller = new AbortController();

        // now set a timer to abort 
        const timer = setTimeout(() => {
          controller.abort();
          // perform the on timeout function
          timeout.onTimeout?.(0);
        }, timeout.time);
        try {
            // return 
          return await attemptRequest(controller.signal);
        } finally {
            // clearTimeout after await is complete
          clearTimeout(timer);
        }
      }
      // else just return the attempt request
      return attemptRequest();
    }

    // -----------------
    // NORMAL FETCH
    // -----------------
    // max retries
    const maxRetries = retry?.number ?? 0;

    // count of how many times we have already retried
    let retried = 0;

    // the last response we captured
    let current: Reqor.Response | undefined;

    // the last Error
    let lastError: any;

    // delay after each retry
    let delay = retry?.delay?.number ?? 0;

    // _________________
    // THE RETRY LOOP
    // _________________
    const retryLoop = (async () => {

        // loop that runs till we have retried `maxRetries` times or the server returned status `ok`
      while (retried <= maxRetries) {

        try {
            // if there is a timeout then
          if (timeout) {
            const controller = new AbortController();
            // after given timeout, abort
            const timer = setTimeout(() => {
              controller.abort();
              timeout.onTimeout?.(retried);
            }, timeout.time);
            
            // attempt request
            try {
              current = (await attemptRequest(
                controller.signal,
              )) as Reqor.Response;
            } finally {
              clearTimeout(timer);
            }
          } else {
            // just use attemptRequest() normally otherwise
            current = (await attemptRequest()) as Reqor.Response;
          }
          
          // if current is ok then break the loop
          // --------------------------
          // SUCCESS POINT IS HERE 👇👇
          // --------------------------
                  if (current?.ok) break; 
        } catch (err) {
            // set the last error
          lastError = err;
        }

        // increase the number of retried
        retried++;

        // if we have STILL not hit maxRetries, then
        if (retried <= maxRetries) {
            // get the increase fn
          const increaseFn = retry?.delay?.increaseFn;

           // if there is a increase function, then:
          if (increaseFn) {
            // set the delay
            delay = increaseFn(delay);
          }

          // wait for delay to complete
          await new Promise((resolve) => setTimeout(resolve, delay));

          // on retry
          retry?.onRetry?.(retried);
        }
      }

      if (!current?.ok) {
        throw lastError ?? new Reqor.Error("Failed after retries", sub);
      }
      return current;
    })();

    // totalTimeout handling
    if (totalTimeout) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          totalTimeout.onTimeout?.();
          reject(new Reqor.Error("Total timeout exceeded", sub));
        }, totalTimeout.time);
      });

      return Promise.race([retryLoop, timeoutPromise]);
    }

    return retryLoop;
  }

  async #get({
    signal,
    url,
    localMiddleware,
  }: {
    signal?: AbortSignal;
    url?: string;
    localMiddleware?: ReqorMiddleware[];
  } = {}): Promise<Reqor.Response | Reqor.ResponseLater> {
    return this.#dispatchRequest({
      signal,
      url,
      init: { method: "GET" },
      sub: "Reqor.get",
      localMiddlewares: localMiddleware,
    });
  }
  
  // get the fetch function
  #resolveFetch():
    | ((input: string, init?: RequestInit) => Promise<globalThis.Response>)
    | undefined {
    const maybeFetch = (globalThis as any).fetch;
    if (typeof maybeFetch !== "function") return undefined;
    return maybeFetch.bind(globalThis);
  }

  // get the fetch later function
  #resolveFetchLater() {
    const maybeFetch = (globalThis as any).fetchLater;
    if (typeof maybeFetch !== "function") return undefined;
    return maybeFetch.bind(globalThis);
  }

  async #requestViaFetch(
    requestUrl: string,
    init: RequestInit,
    sub: "Reqor.get" | "Reqor.post",
  ): Promise<globalThis.Response> {
    const fetchImpl = this.#resolveFetch();
    if (!fetchImpl) {
      throw new Reqor.Error("fetch API not found in this runtime.", sub);
    }

    try {
      return await fetchImpl(requestUrl, init);
    } catch (err: any) {
      throw new Reqor.Error(
        `fetch failed with Error "${JSON.stringify(err)}"`,
        sub,
      );
    }
  }

  async #scheduleFetchLater(
    requestUrl: string,
    activateAfter: number,
    signal?: AbortSignal,
    requestInit: RequestInit = { method: "GET" },
    sub: ReqorSub = "Reqor.get",
    middlewareContext?: ReqorMiddlewareContext,
    localMiddlewares?: ReqorMiddleware[],
  ): Promise<Reqor.ResponseLater> {
    if (activateAfter < 0) {
      throw new Reqor.Error(
        "fetchLater failed due to RangeError. This might be because you have put an negative number in Reqor.after",
        sub,
      );
    }

    let activated = false;
    let canceled = false;
    let completed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeAbortController: AbortController | undefined;
    let nativeHandle: any;

    let resolveDone!: () => void;
    let rejectDone!: (reason?: any) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    const finalizeResolve = () => {
      if (completed) return;
      completed = true;
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolveDone();
    };

    const finalizeReject = (reason: any) => {
      if (completed) return;
      completed = true;
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      rejectDone(reason);
    };

    const cancel = () => {
      if (completed) return false;
      canceled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (typeof nativeHandle?.cancel === "function") {
        try {
          nativeHandle.cancel();
        } catch {}
      }
      activeAbortController?.abort();
      finalizeResolve();
      return true;
    };

    const onAbort = () => {
      cancel();
    };

    if (signal) {
      if (signal.aborted) {
        cancel();
        return {
          get activated() {
            return activated || Boolean(nativeHandle?.activated);
          },
          get canceled() {
            return canceled;
          },
          cancel,
          done,
        };
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const fetchLaterImpl = this.#resolveFetchLater();
    if (fetchLaterImpl) {
      try {
        nativeHandle = await fetchLaterImpl(requestUrl, {
          ...requestInit,
          signal,
          activateAfter,
        });
        timer = setTimeout(() => {
          if (completed) return;
          activated = Boolean(nativeHandle?.activated ?? true);
          finalizeResolve();
        }, activateAfter);
      } catch (err: any) {
        if (err instanceof globalThis.RangeError) {
          throw new Reqor.Error(
            `fetchLater failed due to RangeError. This might be because you have put an negative number in Reqor.after`,
            sub,
          );
        } else {
          throw new Reqor.Error(
            `fetchLater failed with Error "${JSON.stringify(err)}"`,
            sub,
          );
        }
      }

      return {
        get activated() {
          return activated || Boolean(nativeHandle?.activated);
        },
        get canceled() {
          return canceled;
        },
        cancel,
        done,
      };
    }

    timer = setTimeout(async () => {
      if (completed || canceled) {
        finalizeResolve();
        return;
      }
      activated = true;
      activeAbortController = new AbortController();
      if (signal) {
        if (signal.aborted) {
          activeAbortController.abort();
        } else {
          signal.addEventListener(
            "abort",
            () => activeAbortController?.abort(),
            { once: true },
          );
        }
      }
      try {
        await this.#requestViaFetch(
          requestUrl,
          { ...requestInit, signal: activeAbortController.signal },
          sub,
        );
        finalizeResolve();
      } catch (err: any) {
        if (canceled || activeAbortController.signal.aborted) {
          finalizeResolve();
          return;
        }
        const finalError = middlewareContext
          ? await this.#applyErrorMiddlewares(
              err,
              middlewareContext,
              localMiddlewares,
            )
          : err;
        finalizeReject(finalError);
      }
    }, activateAfter);

    return {
      get activated() {
        return activated;
      },
      get canceled() {
        return canceled;
      },
      cancel,
      done,
    };
  }

  /**
   * A function to decide what params to add in the `get` query.
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `params` parameter.
   */
  params(
    values:
      | { [key: string]: string | number | boolean | null | undefined }
      | Array<{ [key: string]: string | number | boolean | null | undefined }>
      | URLSearchParams,
  ) {
    if (values instanceof URLSearchParams) {
      for (const [k, v] of values.entries()) {
        this.#params.append(k, v);
      }
      return this;
    }
    // If array
    if (Array.isArray(values)) {
      for (const entry of values) {
        for (const [k, v] of Object.entries(entry)) {
          if (v == null) continue;
          this.#params.append(k, String(v));
        }
      }
      return this;
    }

    for (const [k, v] of Object.entries(values)) {
      if (v == null) continue;
      this.#params.append(k, String(v));
    }
    return this;
  }

  /**
   * A function to decide what happens when there is a timeout on a try to connect.
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `retry.timeout.onTimeout` parameter.
   */
  onTimeout(handler: (retryNumber?: number) => any) {
    this.#timeoutConfig = {
      ...(this.#timeoutConfig ?? { time: 0 }),
      onTimeout: handler,
    };
    return this;
  }

  /**
   * A function to decide what happens when there is timeout on the whole try to connect.
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `totalTimeout.onTotalTimeout` parameter.
   */
  onTotalTimeout(handler: () => any) {
    this.#totalTimeoutConfig = {
      ...(this.#totalTimeoutConfig ?? { time: 0 }),
      onTimeout: handler,
    };
    return this;
  }

  /**
   * A function to decide what happens when there is a retry attempt.
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `retry.onRetry` parameter.
   */
  onRetry(handler: (retryNumber?: number) => any) {
    this.#retryConfig = {
      ...(this.#retryConfig ?? { number: 0 }),
      onRetry: handler,
    };
    return this;
  }

  /**
   * A function to decide how much to delay after a attempt to connect and the function to increase delay.
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `retry.delay` parameter.
   */
  retryDelay(number: number, increaseFn?: (current: number) => number) {
    this.#retryConfig = {
      ...(this.#retryConfig ?? { number: 0 }),
      delay: {
        number,
        increaseFn,
      },
    };
    return this;
  }

  async get(
    optionsOrMiddleware?: ReqorGetOptions | ReqorLocalMiddlewareInput,
  ): Promise<Reqor.Response | Reqor.ResponseLater> {
    // normalize get options to pick between chained options and given input options with fallbacks and validation
    const { retry, timeout, totalTimeout, params, middleware } =
      normalizeGetOptions(optionsOrMiddleware);

      // decide what configs to use
    const effective = {
      retry: retry ?? this.#retryConfig,
      timeout: timeout ?? this.#timeoutConfig,
      totalTimeout: totalTimeout ?? this.#totalTimeoutConfig,
    };
    // build request url via params, etc.
    const requestUrl = this.#buildUrl(params);

    // normalize middleware
    const localMiddlewares = normalizeLocalMiddleware(middleware);

    // use the execute with policies function
    return this.#executeWithPolicies(
      effective,
      "Reqor.get",
      (signal?: AbortSignal) =>
        this.#get({
          signal,
          url: requestUrl,
          localMiddleware: localMiddlewares,
        }),
    );
  }
  //#endregion
  //#region POST
  #_data: any;
  #cachedCt: undefined | string;
  #__headers: Reqor.Headers.Map = new Reqor.Headers(new Headers());
  /**
   * A function to decide what data gets passed to `post`
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `data` parameter.
   * 
   * **`Important`**: This is only exclusive for `post`
   */
  data(data: any) {
    this.#_data = data;
    this.#cachedCt = this.#identifyData(this.#_data);
    return this;
  }

  /**
   * A function to decide what headers gets passed to `post`
   *
   * **`Important`**: Calling this function again overrides the current option
   *
   * **`Important`**: This will not be used if you pass the `headers` parameter.
   * 
   * **`Important`**: This is only exclusive for `post`
   */
  headers(headers: Reqor.Headers.Map) {
    this.#__headers = headers;
    return this;
  }
  // prepare bost body
  #preparePostBody(
    data: any,
    headers: Reqor.Headers.Map,
  ): { body?: BodyInit; headers?: HeadersInit } {
    const buildHeaders = (contentType?: string): Headers => {
      const source =
        typeof headers.getHeadersClass === "function"
          ? headers.getHeadersClass()
          : undefined;
      const merged = new Headers(source);
      if (contentType) {
        merged.set("Content-Type", contentType);
      }
      return merged;
    };

    if (data == null) return { headers: buildHeaders() };

    if (typeof FormData !== "undefined" && data instanceof FormData) {
      return { body: data, headers: buildHeaders() };
    }
    if (
      typeof URLSearchParams !== "undefined" &&
      data instanceof URLSearchParams
    ) {
      return {
        body: data,
        headers: buildHeaders(
          "application/x-www-form-urlencoded;charset=UTF-8",
        ),
      };
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return {
        body: data,
        headers: buildHeaders(data.type || undefined),
      };
    }
    if (data instanceof ArrayBuffer) {
      return {
        body: data as unknown as BodyInit,
        headers: buildHeaders("application/octet-stream"),
      };
    }
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      return {
        body: view as unknown as BodyInit,
        headers: buildHeaders("application/octet-stream"),
      };
    }
    if (typeof data === "string") {
      return {
        body: data,
        headers: buildHeaders(this.#identifyData(data)),
      };
    }
    if (typeof data === "object") {
      return {
        body: JSON.stringify(data),
        headers: buildHeaders("application/json"),
      };
    }
    return {
      body: String(data),
      headers: buildHeaders("text/plain"),
    };
  }

  async #post({
    signal,
    url,
    data,
    localMiddleware,
    headers
  }: {
    signal?: AbortSignal;
    url?: string;
    data?: any;
    headers?: Reqor.Headers.Map;
    localMiddleware?: ReqorMiddleware[];
  } = {}): Promise<Reqor.Response | Reqor.ResponseLater> {
    const effectiveData = data ?? this.#_data;
    const effectiveHeaders = headers ?? this.#__headers;
    const payload = this.#preparePostBody(effectiveData, effectiveHeaders);
    return this.#dispatchRequest({
      signal,
      url,
      init: {
        method: "POST",
        body: payload.body,
        headers: payload.headers,
      },
      sub: "Reqor.post",
      localMiddlewares: localMiddleware,
    });
  }

  async post(
    data?: any,
    headersOrOptions?:
      | Reqor.Headers.Map
      | ReqorPostOptions
      | ReqorLocalMiddlewareInput,
    optionsOrMiddleware: ReqorPostOptions | ReqorLocalMiddlewareInput = {},
  ): Promise<Reqor.Response | Reqor.ResponseLater> {
    const hasHeaders = isReqorHeaders(headersOrOptions);
    const resolvedHeaders = hasHeaders ? headersOrOptions : undefined;
    const resolvedOptions = hasHeaders
      ? optionsOrMiddleware
      : headersOrOptions ?? optionsOrMiddleware;

    const { retry, timeout, totalTimeout, params, middleware } =
      normalizePostOptions(resolvedOptions);
    const effectiveRetry = retry ?? this.#retryConfig;
    const effectiveTimeout = timeout ?? this.#timeoutConfig;
    const effectiveTotalTimeout = totalTimeout ?? this.#totalTimeoutConfig;
    const requestUrl = this.#buildUrl(params);
    const localMiddlewares = normalizeLocalMiddleware(middleware);

    return this.#executeWithPolicies(
      {
        retry: effectiveRetry,
        timeout: effectiveTimeout,
        totalTimeout: effectiveTotalTimeout,
      },
      "Reqor.post",
      (signal?: AbortSignal) =>
        this.#post({
          signal,
          url: requestUrl,
          data,
          headers: resolvedHeaders,
          localMiddleware: localMiddlewares,
        }),
    );
  }

  #identifyData(data: any) {
    if (!data) return "text/plain";
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      return "application/octet-stream";
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return data.type || "application/octet-stream";
    }
    let dataType = typeof data;
    if (dataType === "object") {
      return "application/json";
    }
    if (dataType === "string") {
      if (data.trim().startsWith("<")) return "text/html";
      return "text/plain";
    }

    return "text/plain";
  }
  //#endregion
}

//#endregion The main reqor class
namespace Reqor {
  /**
   * Error instance used by Reqor.
   */
  //#region Main Error class
  export class Error extends globalThis.Error {
    constructor(message: string, sub?: string) {
      super(message);
      this.name = `reqor ${sub ? `.${sub}` : ""}`;
      if (typeof (globalThis as any).Error?.captureStackTrace === "function") {
        (globalThis as any).Error.captureStackTrace(this, Reqor.Error);
      }
    }
  }
  //#endregion Main Error class
  //#region Response class
  export interface ResponseLater {
    [key: string]: any;
    /**
     * Whether the response activated or not
     */
    activated: boolean;
    /**
     * Whether the delayed request has been canceled.
     */
    canceled: boolean;
    /**
     * Cancels the delayed request before/during activation.
     * Returns true when cancellation was applied.
     */
    cancel: () => boolean;
    /**
     * Resolves when delayed request scheduling completes.
     */
    done: Promise<void>;
  }
  /**
   * Response returned by **reqor**.
   */
  export interface Response {
    [key: string]: any;
    /**
     * Raw Response returned by fetch()
     */
    raw: globalThis.Response;

    /**
     * A easier way to use [**Response.headers**](https://developer.mozilla.org/en-US/docs/Web/API/Response/headers)
     */
    headers: Reqor.Headers;

    /**
     * The **`ok`** read-only property of the Response interface contains a Boolean stating whether the response was successful (status in the range 200-299) or not.
     *
     * from [**Response.ok**](https://developer.mozilla.org/en-US/docs/Web/API/Response/ok)
     */
    ok: boolean;

    /**
     * The **`redirected`** read-only property of the Response interface indicates whether or not the response is the result of a request you made which was redirected.
     *
     * from [**Response.redirected**](https://developer.mozilla.org/en-US/docs/Web/API/Response/redirected)
     */
    redirected: boolean;

    /**
     * Status of the response.
     */
    status: Reqor.Status;
    /**
     * The **`statusText`** read-only property of the Response interface contains the status message corresponding to the HTTP status code in Response.status.
     *
     * from [**Response.statusText**](https://developer.mozilla.org/en-US/docs/Web/API/Response/statusText)
     */
    statusText: string;
    /**
     * Type of response.
     */
    type: Reqor.Type;
    /**
     *
     */
    url: string;
  }
  //#endregion
  //#region Headers
  /**
   * **Headers** returned in a Reqor Response
   */
  export class Headers {
    constructor(original: globalThis.Headers) {
      let h: Reqor.Headers.Map = {};
      // an easy wrapper for h.append
      h.new = (name: string, value?: any) => {
        return Reqor.Headers.value(original, name, value);
      };
      h.append = h.new;
      h.getContentType = () =>
        original.get("content-type") || original.get("Content-Type");
      h.add = h.new;
      h.getHeadersClass = () =>  original
       h.http = Reqor.Headers.HTTPHeaders.create(original);
      h[Symbol.iterator] = original.entries.bind(original);
      h[Symbol.asyncIterator] = async function* () {
        for (const entry of original.entries()) yield entry;
      };
      // MERGING original header functions with h
      h = {
        ...h,
        ...{
          /**
           * The **`delete()`** method of the Headers interface deletes a header from the current Headers object.
           *
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          delete: original.delete.bind(original),
          /**
           * The **`has()`** method of the Headers interface returns a boolean stating whether a Headers object contains a certain header.
           *
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          has: original.has.bind(original),
          /**
           * Returns an iterator allowing to go through all values of the key/value pairs contained in this object.
           *
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          values: original.values.bind(original),
          /**
           * Returns an iterator allowing to go through all keys of the key/value pairs contained in this object.
           *
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          keys: original.keys.bind(original),
          /**
           * The **`getSetCookie()`** method of the Headers interface returns an array containing the values of all Set-Cookie headers associated with a response.
           *
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          getSetCookie: original.getSetCookie.bind(original),
          /**
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          forEach: original.forEach.bind(original),
          /**
           * The **`get()`** method of the Headers interface returns a byte string of all the values of a header within a Headers object with a given name.
           *
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          get: original.get.bind(original),
          /**
           * The **`set()`** method of the Headers interface sets a new value for an existing header inside a Headers object, or adds the header if it does not already exist.
           *
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          set: original.set.bind(original),
          /**
           * Returns an iterator allowing to go through all key/value pairs contained in this object.
           *
           * from [globalThis.Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
           */
          entries: original.entries.bind(original),
        },
      };
      return h;
    }
  }
  //#endregion
  //#region Status
  export class Status {
    private _status: number;
    private _statusText: string;

    constructor(status: number, statusText: string) {
      this._status = status;
      this._statusText = statusText;
    }

    get status() {
      return this._status;
    }
    get text() {
      return this._statusText;
    }

    set(status: number, statusText?: string) {
      this._status = status;
      if (statusText !== undefined) {
        this._statusText = statusText;
      }
    }

    get ok() {
      return this._status >= 200 && this._status < 300;
    }
    get redirected() {
      return this._status >= 300 && this._status < 400;
    }
    get clientError() {
      return this._status >= 400 && this._status < 500;
    }
    get serverError() {
      return this._status >= 500 && this._status < 600;
    }

    toString() {
      return `${this._status} ${this._statusText}`;
    }
    valueOf() {
      return this._status;
    }
    [Symbol.toPrimitive](hint: string) {
      if (hint === "number") return this._status;
      return this.toString();
    }
  }

  export function createStatus(status: number, statusText: string) {
    const controller = new Status(status, statusText);
    return controller;
  }
  //#endregion
  //#region Type
  export class Type {
    private _type: string;

    static readonly VALID_TYPES = [
      "basic",
      "cors",
      "error",
      "opaque",
      "opaqueredirect",
      "default",
    ] as const;

    constructor(type: string) {
      if (!Type.VALID_TYPES.includes(type as any)) {
        throw new Reqor.Error(
          `Invalid Response.type "${type}"`,
          "Reqor.Response.Type",
        );
      }
      this._type = type;
    }

    get value() {
      return this._type;
    }

    isBasic() {
      return this._type === "basic";
    }
    isCors() {
      return this._type === "cors";
    }
    isError() {
      return this._type === "error";
    }
    isOpaque() {
      return this._type === "opaque";
    }
    isOpaqueRedirect() {
      return this._type === "opaqueredirect";
    }

    toString() {
      return this._type;
    }
    valueOf() {
      return this._type;
    }
    [Symbol.toPrimitive](_hint: string) {
      return this._type;
    }
  }

  export function createType(type: string) {
    const controller = new Type(type);
    return controller;
  }
  export class Body {
    private _response: globalThis.Response;

    constructor(response: globalThis.Response) {
      this._response = response;
    }

    get stream(): ReadableStream<Uint8Array> | null {
      return this._response.body;
    }

    get used(): boolean {
      return this._response.bodyUsed;
    }

    async pump(onChunk: (chunk: Uint8Array) => void) {
      const reader = this._response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) onChunk(value);
      }
    }

    pipeTo(dest: WritableStream<Uint8Array>) {
      return this._response.body?.pipeTo(dest);
    }

    pipeThrough<T>(transform: TransformStream<Uint8Array, T>) {
      return this._response.body?.pipeThrough(transform);
    }

    async json<T = any>(): Promise<T> {
      return this._response.json();
    }
    async text(): Promise<string> {
      return this._response.text();
    }
    async arrayBuffer(): Promise<ArrayBuffer> {
      return this._response.arrayBuffer();
    }
    async blob(): Promise<Blob> {
      return this._response.blob();
    }
    async formData(): Promise<FormData> {
      return this._response.formData();
    }
  }

  //#endregion
}

//#region Headers Members
namespace Reqor.Headers {
  export interface Map {
    [key: string]: any;
    [key: symbol]: any;
    /** Creates a new **Key**-**Value** in the header.
     * @example
     * reqor("myurl").get().headers.new("key")("value")
     */
    new?: (name: string, value?: any) => void | ((value: any) => void);
  }
  export function value(headers: globalThis.Headers, k: string, v?: any) {
    headers.append(k, v);
    let d;
    let func = (value?: any) => {
      if (d || !headers.has(k))
        throw new Reqor.Error(
          "Value is deleted and hence can not be used",
          "Reqor.Headers.value",
        );
      if (value) {
        headers.set(k, value);
        v = value;
        return func;
      }
    };
    func.toString = () => v;
    func.valueOf = () => v;
    (func as any)[Symbol.toPrimitive] = (hint: string) => {
      if (hint === "number") return Number(v);
      return String(v);
    };
    return new Proxy(func, {
      get(target, property) {
        if (property === "delete") {
          if (d || !headers.has(k))
            throw new Reqor.Error(
              "Value is deleted and hence can not be used",
              "Reqor.Headers.value.delete",
            );
          return () => {
            headers.delete(k);
          };
        }
        if (property === Symbol.toPrimitive)
          return (target as any)[Symbol.toPrimitive];
        if (property === Symbol.toStringTag) return "ReqorHeaderValue";
      },
    });
  }
}
//#endregion
namespace Reqor.Headers.HTTPHeaders {
  type ValidityCheck = string[] | ((value?: string) => boolean);
  type HeaderPrimitive = string | number | boolean;
  type HeaderMode =
    | "mime"
    | "mime-array"
    | "valid-string"
    | "valid-string-array"
    | "any-string"
    | "any-string-array"
    | "number"
    | "number-array"
    | "string-bool"
    | "string-bool-array";
  type HeaderController =
    | MIME
    | MIME_ARRAY
    | VALID_STRING
    | VALID_STRING_ARRAY
    | ANY_STRING
    | ANY_STRING_ARRAY
    | NUMBER_STRING
    | NUMBER_ARRAY
    | STRING_BOOL
    | STRING_BOOL_ARRAY;

  interface HeaderSpec {
    key: string;
    mode: HeaderMode;
    defaultValue: HeaderPrimitive | HeaderPrimitive[];
    validStrings?: ValidityCheck;
  }

  const headerNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

  export const contentTypeValidBases = [
    "application",
    "audio",
    "font",
    "example",
    "image",
    "message",
    "model",
    "multipart",
    "text",
    "video",
    "*",
  ] as const;

  const commonHttpMethods = [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
    "TRACE",
  ] as const;

  const HEADER_SPECS: Readonly<Record<string, HeaderSpec>> = {
    accept: { key: "Accept", mode: "mime-array", defaultValue: "text/plain" },
    acceptCharset: {
      key: "Accept-Charset",
      mode: "any-string-array",
      defaultValue: [],
    },
    acceptEncoding: {
      key: "Accept-Encoding",
      mode: "valid-string-array",
      defaultValue: ["*"],
      validStrings: [
        "gzip",
        "deflate",
        "compress",
        "br",
        "zstd",
        "dcb",
        "dcz",
        "identity",
        "*",
        ";q=",
      ],
    },
    acceptLanguage: {
      key: "Accept-Language",
      mode: "any-string-array",
      defaultValue: [],
    },
    acceptPatch: {
      key: "Accept-Patch",
      mode: "mime-array",
      defaultValue: "text/plain",
    },
    acceptPost: {
      key: "Accept-Post",
      mode: "mime-array",
      defaultValue: "text/plain",
    },
    acceptRanges: {
      key: "Accept-Ranges",
      mode: "valid-string",
      defaultValue: "none",
      validStrings: ["none", "bytes"],
    },
    age: { key: "Age", mode: "number", defaultValue: 0 },
    allow: { key: "Allow", mode: "any-string-array", defaultValue: [] },
    altSvc: { key: "Alt-Svc", mode: "any-string", defaultValue: "" },
    authorization: {
      key: "Authorization",
      mode: "any-string",
      defaultValue: "",
    },
    cacheControl: {
      key: "Cache-Control",
      mode: "any-string",
      defaultValue: "",
    },
    connection: {
      key: "Connection",
      mode: "any-string-array",
      defaultValue: [],
    },
    contentDisposition: {
      key: "Content-Disposition",
      mode: "any-string",
      defaultValue: "",
    },
    contentEncoding: {
      key: "Content-Encoding",
      mode: "any-string-array",
      defaultValue: [],
    },
    contentLanguage: {
      key: "Content-Language",
      mode: "any-string-array",
      defaultValue: [],
    },
    contentLength: { key: "Content-Length", mode: "number", defaultValue: 0 },
    contentRange: {
      key: "Content-Range",
      mode: "any-string",
      defaultValue: "",
    },
    contentType: {
      key: "Content-Type",
      mode: "mime",
      defaultValue: "text/plain",
    },
    cookie: { key: "Cookie", mode: "any-string", defaultValue: "" },
    date: { key: "Date", mode: "any-string", defaultValue: "" },
    etag: { key: "ETag", mode: "any-string", defaultValue: "" },
    expires: { key: "Expires", mode: "any-string", defaultValue: "" },
    host: { key: "Host", mode: "any-string", defaultValue: "" },
    ifMatch: { key: "If-Match", mode: "any-string", defaultValue: "" },
    ifModifiedSince: {
      key: "If-Modified-Since",
      mode: "any-string",
      defaultValue: "",
    },
    ifNoneMatch: { key: "If-None-Match", mode: "any-string", defaultValue: "" },
    ifUnmodifiedSince: {
      key: "If-Unmodified-Since",
      mode: "any-string",
      defaultValue: "",
    },
    lastModified: {
      key: "Last-Modified",
      mode: "any-string",
      defaultValue: "",
    },
    link: { key: "Link", mode: "any-string", defaultValue: "" },
    location: { key: "Location", mode: "any-string", defaultValue: "" },
    maxForwards: { key: "Max-Forwards", mode: "number", defaultValue: 0 },
    origin: { key: "Origin", mode: "any-string", defaultValue: "" },
    pragma: { key: "Pragma", mode: "any-string-array", defaultValue: [] },
    range: { key: "Range", mode: "any-string", defaultValue: "" },
    referer: { key: "Referer", mode: "any-string", defaultValue: "" },
    retryAfter: { key: "Retry-After", mode: "any-string", defaultValue: "" },
    server: { key: "Server", mode: "any-string", defaultValue: "" },
    setCookie: { key: "Set-Cookie", mode: "any-string", defaultValue: "" },
    strictTransportSecurity: {
      key: "Strict-Transport-Security",
      mode: "any-string",
      defaultValue: "",
    },
    transferEncoding: {
      key: "Transfer-Encoding",
      mode: "any-string-array",
      defaultValue: [],
    },
    upgradeInsecureRequests: {
      key: "Upgrade-Insecure-Requests",
      mode: "valid-string",
      defaultValue: "1",
      validStrings: ["0", "1"],
    },
    userAgent: { key: "User-Agent", mode: "any-string", defaultValue: "" },
    vary: { key: "Vary", mode: "any-string-array", defaultValue: [] },
    wwwAuthenticate: {
      key: "WWW-Authenticate",
      mode: "any-string",
      defaultValue: "",
    },
    xContentTypeOptions: {
      key: "X-Content-Type-Options",
      mode: "valid-string",
      defaultValue: "nosniff",
      validStrings: ["nosniff"],
    },
    xFrameOptions: {
      key: "X-Frame-Options",
      mode: "valid-string",
      defaultValue: "SAMEORIGIN",
      validStrings: ["DENY", "SAMEORIGIN", "ALLOW-FROM"],
    },
    xXssProtection: {
      key: "X-XSS-Protection",
      mode: "valid-string",
      defaultValue: "1; mode=block",
      validStrings: ["0", "1", "1; mode=block"],
    },

    accessControlAllowCredentials: {
      key: "Access-Control-Allow-Credentials",
      mode: "string-bool",
      defaultValue: "false",
    },
    accessControlAllowHeaders: {
      key: "Access-Control-Allow-Headers",
      mode: "any-string-array",
      defaultValue: [],
    },
    accessControlAllowMethods: {
      key: "Access-Control-Allow-Methods",
      mode: "valid-string-array",
      defaultValue: ["GET", "POST", "OPTIONS"],
      validStrings: [...commonHttpMethods, "*"],
    },
    accessControlAllowOrigin: {
      key: "Access-Control-Allow-Origin",
      mode: "any-string",
      defaultValue: "*",
    },
    accessControlExposeHeaders: {
      key: "Access-Control-Expose-Headers",
      mode: "any-string-array",
      defaultValue: [],
    },
    accessControlMaxAge: {
      key: "Access-Control-Max-Age",
      mode: "number",
      defaultValue: 0,
    },
    accessControlRequestHeaders: {
      key: "Access-Control-Request-Headers",
      mode: "any-string-array",
      defaultValue: [],
    },
    accessControlRequestMethod: {
      key: "Access-Control-Request-Method",
      mode: "valid-string",
      defaultValue: "GET",
      validStrings: [...commonHttpMethods],
    },

    // Backward-compatible aliases for previous typoed keys
    accessControlKeyCredentials: {
      key: "Access-Control-Allow-Credentials",
      mode: "string-bool",
      defaultValue: "false",
    },
    accessControlKeyHeaders: {
      key: "Access-Control-Allow-Headers",
      mode: "any-string-array",
      defaultValue: [],
    },
  };
  class MIME {
    protected _value: string;
    protected _h: globalThis.Headers;
    protected _key: string;

    constructor(
      h: globalThis.Headers,
      key: string,
      defaultVal: string = "text/plain",
    ) {
      this._h = h;
      this._key = key;
      this._value = h.get(key) ?? defaultVal;
    }

    set(val: string) {
      this._value = val;
      this._h.set(this._key, val);
    }

    base(base: string) {
      const parts = this._value.split("/");
      parts[0] = base;
      this._value = parts.join("/");
      this._h.set(this._key, this._value);
      return this;
    }

    subtype(sub: string) {
      const parts = this._value.split("/");
      parts[1] = sub;
      this._value = parts.join("/");
      this._h.set(this._key, this._value);
      return this;
    }

    [Symbol.hasInstance](instance: any) {
      if (instance instanceof MIME) return true;
      let b = instance.split("/");
      const isValidBase = (
        HTTPHeaders.ContentType.validBases as readonly string[]
      ).includes(b[0]);
      return isValidBase;
    }
    toString() {
      return this._value;
    }
    valueOf() {
      return this._value;
    }
    [Symbol.toPrimitive](hint: string) {
      if (hint === "number") return Number(this._value);
      return this._value;
    }
  }

  class MIME_ARRAY {
    protected _value: string;
    protected _h: globalThis.Headers;
    protected _key: string;

    get length() {
      return this.array.length;
    }
    #isValidArray(arr: string[] | string) {
      const parts = Array.isArray(arr) ? arr : arr.split(",");

      for (let i = 0; i < parts.length; i++) {
        let v = parts[i];
        let b = v.split("/");

        const isValidBase = (
          HTTPHeaders.ContentType.validBases as readonly string[]
        ).includes(b[0]);

        if (isValidBase) return true;
      }
      return false;
    }
    [Symbol.hasInstance](instance: any) {
      if (instance instanceof MIME_ARRAY) return true;
      return this.#isValidArray(instance);
    }
    [Symbol.search](string: string) {
      return this.array.map((a) => a.toString()).indexOf(string);
    }
    constructor(
      h: globalThis.Headers,
      key: string,
      defaultVal: string = "text/plain",
    ) {
      this._h = h;
      this._key = key;
      this._value = h.get(key) ?? defaultVal;
    }

    get array(): MIME[] {
      return this._value.split(",").map((str) => {
        const [base, subtype] = str.trim().split("/");
        return new MIME(this._h, this._key)
          .base(base ?? "text")
          .subtype(subtype ?? "plain");
      });
    }

    set(val: string | string[] | MIME[]) {
      if (Array.isArray(val)) {
        this._value = val.map((v) => v.toString()).join(",");
      } else {
        this._value = val;
      }
      this._h.set(this._key, this._value);
    }

    at(index: number) {
      const arr = this.array;
      const normalized = index < 0 ? arr.length + index : index;
      return arr[normalized];
    }

    [REQOR_ARRAY_LENGTH_GET]() {
      return this.length;
    }

    [REQOR_ARRAY_INDEX_GET](index: number) {
      return this.array[index];
    }

    [REQOR_ARRAY_INDEX_SET](index: number, value: MIME | string) {
      const arr = this.array.map((v) => v.toString());
      arr[index] = value instanceof MIME ? value.toString() : String(value);
      this.set(arr);
    }

    toString() {
      return this._value;
    }
    valueOf() {
      return this._value;
    }
    [Symbol.toPrimitive](hint: string) {
      if (hint === "number") return Number(this._value);
      return this._value;
    }
    get [Symbol.isConcatSpreadable]() {
      return true;
    }
    [Symbol.iterator](): IterableIterator<MIME> {
      return this.array[Symbol.iterator]();
    }
    async *[Symbol.asyncIterator](): AsyncIterableIterator<MIME> {
      for (const item of this.array) yield item;
    }
    get [Symbol.toStringTag]() {
      return "Array";
    }
    get [Symbol.unscopables]() {
      return (Array.prototype as any)[Symbol.unscopables] ?? {};
    }
  }

  class VALID_STRING {
    #key: string;
    #value: string;
    #h: globalThis.Headers;
    #v: ValidityCheck;
    constructor(
      h: globalThis.Headers,
      key: string,
      defaultVal: string = "*",
      validStrings: ValidityCheck,
    ) {
      this.#key = key;
      this.#value = defaultVal;
      this.#h = h;
      this.#v = validStrings;
    }
    isValid(string: string) {
      if (typeof this.#v === "function") return this.#v(string);
      return this.#v.includes(string);
    }
    set(string: string) {
      if (this.isValid(string)) {
        this.#value = string;
        this.#h.set(this.#key, string);
        return;
      }
      throw new Reqor.Error(
        `Invalid value "${string}" for header "${this.#key}"`,
        "Reqor.Headers.HTTPHeaders",
      );
    }

    valueOf() {
      return this.#value;
    }
    toString() {
      return this.#value;
    }
    get value() {
      return this.#value;
    }
    get validityArrayOrFunction() {
      return this.#v;
    }
    get key() {
      return this.#key;
    }
    [Symbol.toPrimitive](hint: string) {
      if (hint === "number") return Number(this.#value);
      return this.#value;
    }
  }

  class ANY_STRING extends VALID_STRING {
    constructor(h: globalThis.Headers, key: string, defaultVal: string = "") {
      super(h, key, defaultVal, () => true);
    }
  }

  class NUMBER_STRING extends VALID_STRING {
    constructor(h: globalThis.Headers, key: string, defaultVal: string = "0") {
      const validityFn = (value?: string) => {
        if (!value) return false;
        return /^[0-9]+$/.test(value);
      };

      super(h, key, defaultVal, validityFn);
    }

    get number(): number {
      return parseInt(this.toString(), 10);
    }

    set number(n: number) {
      const str = String(n);
      if (this.isValid(str)) {
        this.set(str);
      } else {
        throw new Reqor.Error(
          `Invalid numeric string "${str}" for header "${this.key}"`,
          "Reqor.Headers.HTTPHeaders",
        );
      }
    }
  }

  class NUMBER_ARRAY {
    #key: string;
    #items: number[] = [];
    #h: globalThis.Headers;

    constructor(
      h: globalThis.Headers,
      key: string,
      defaultVals: number[] = [],
    ) {
      this.#h = h;
      this.#key = key;
      const existing = this.#h.get(this.#key);
      if (existing && existing.trim().length > 0) {
        this.#items = existing
          .split(",")
          .map((v) => Number(v.trim()))
          .filter((v) => Number.isFinite(v));
      } else {
        this.#items = defaultVals.filter((v) => Number.isFinite(v));
        if (this.#items.length > 0) {
          this.#h.set(this.#key, this.toString());
        }
      }
    }

    add(value: number) {
      if (!Number.isFinite(value)) {
        throw new Reqor.Error(
          `Invalid number "${value}" for header "${this.#key}"`,
          "Reqor.Headers.HTTPHeaders",
        );
      }
      this.#items.push(value);
      this.#h.set(this.#key, this.toString());
    }

    remove(value: number) {
      this.#items = this.#items.filter((v) => v !== value);
      this.#h.set(this.#key, this.toString());
    }

    set(vals: number[]) {
      this.#items = vals.filter((v) => Number.isFinite(v));
      this.#h.set(this.#key, this.toString());
    }

    at(index: number) {
      const normalized = index < 0 ? this.#items.length + index : index;
      return this.#items[normalized];
    }
    get length() {
      return this.#items.length;
    }
    [REQOR_ARRAY_LENGTH_GET]() {
      return this.#items.length;
    }
    [REQOR_ARRAY_INDEX_GET](index: number) {
      return this.#items[index];
    }
    [REQOR_ARRAY_INDEX_SET](index: number, value: number) {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new Reqor.Error(
          `Invalid number "${value}" for header "${this.#key}"`,
          "Reqor.Headers.HTTPHeaders",
        );
      }
      this.#items[index] = n;
      this.#h.set(this.#key, this.toString());
    }

    get array() {
      return [...this.#items];
    }
    valueOf() {
      return this.#items.join(",");
    }
    toString() {
      return this.#items.join(",");
    }
    [Symbol.toPrimitive](hint: string) {
      if (hint === "number") return this.#items.length;
      return this.toString();
    }
    get [Symbol.isConcatSpreadable]() {
      return true;
    }
    [Symbol.iterator](): IterableIterator<number> {
      return this.array[Symbol.iterator]();
    }
    async *[Symbol.asyncIterator](): AsyncIterableIterator<number> {
      for (const item of this.array) yield item;
    }
    get [Symbol.toStringTag]() {
      return "Array";
    }
    get [Symbol.unscopables]() {
      return (Array.prototype as any)[Symbol.unscopables] ?? {};
    }
  }

  class ANY_STRING_ARRAY {
    #key: string;
    #items: string[] = [];
    #h: globalThis.Headers;

    constructor(
      h: globalThis.Headers,
      key: string,
      defaultVals: string[] = [],
    ) {
      this.#h = h;
      this.#key = key;
      const existing = this.#h.get(this.#key);
      if (existing && existing.trim().length > 0) {
        this.#items = existing
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      } else {
        this.#items = defaultVals;
      }
      if (this.#items.length > 0) {
        this.#h.set(this.#key, this.#items.join(","));
      }
    }

    add(str: string) {
      this.#items.push(str);
      this.#h.set(this.#key, this.toString());
    }

    remove(str: string) {
      this.#items = this.#items.filter((v) => v !== str);
      this.#h.set(this.#key, this.toString());
    }

    set(vals: string[]) {
      this.#items = vals;
      this.#h.set(this.#key, this.toString());
    }

    at(index: number) {
      const normalized = index < 0 ? this.#items.length + index : index;
      return this.#items[normalized];
    }
    get length() {
      return this.#items.length;
    }
    [REQOR_ARRAY_LENGTH_GET]() {
      return this.#items.length;
    }
    [REQOR_ARRAY_INDEX_GET](index: number) {
      return this.#items[index];
    }
    [REQOR_ARRAY_INDEX_SET](index: number, value: string) {
      this.#items[index] = String(value);
      this.#h.set(this.#key, this.toString());
    }

    get array() {
      return [...this.#items];
    }

    valueOf() {
      return this.#items.join(",");
    }
    toString() {
      return this.#items.join(",");
    }
    [Symbol.toPrimitive](hint: string) {
      if (hint === "number") return this.#items.length;
      return this.toString();
    }
    get [Symbol.isConcatSpreadable]() {
      return true;
    }
    [Symbol.iterator](): IterableIterator<string> {
      return this.array[Symbol.iterator]();
    }
    async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
      for (const item of this.array) yield item;
    }
    get [Symbol.toStringTag]() {
      return "Array";
    }
    get [Symbol.unscopables]() {
      return (Array.prototype as any)[Symbol.unscopables] ?? {};
    }
  }

  class STRING_BOOL extends VALID_STRING {
    constructor(
      h: globalThis.Headers,
      key: string,
      defaultVal: string = "false",
    ) {
      super(h, key, defaultVal, ["true", "false"]);
    }
  }

  class VALID_STRING_ARRAY {
    #key: string;
    #items: VALID_STRING[];
    #h: globalThis.Headers;

    constructor(
      h: globalThis.Headers,
      key: string,
      defaultVals: string[] = ["*"],
      validStrings: ValidityCheck,
    ) {
      this.#key = key;
      this.#h = h;
      this.#items = defaultVals.map(
        (val) => new VALID_STRING(h, key, val, validStrings),
      );
      this.#h.set(this.#key, this.#items.map((i) => i.toString()).join(","));
    }

    add(str: string) {
      const v = new VALID_STRING(
        this.#h,
        this.#key,
        str,
        this.#items[0].validityArrayOrFunction,
      );
      if (v.isValid(str)) {
        this.#items.push(v);
        this.#h.set(this.#key, this.toString());
        return;
      }
      throw new Reqor.Error(
        `Invalid value "${str}" for header "${this.#key}"`,
        "Reqor.Headers.HTTPHeaders",
      );
    }

    remove(str: string) {
      this.#items = this.#items.filter((v) => v.toString() !== str);
      this.#h.set(this.#key, this.toString());
    }

    set(vals: string[]) {
      this.#items = vals
        .map(
          (val) =>
            new VALID_STRING(
              this.#h,
              this.#key,
              val,
              this.#items[0].validityArrayOrFunction,
            ),
        )
        .filter((v) => v.isValid(v.toString()));
      this.#h.set(this.#key, this.toString());
    }

    at(index: number) {
      const arr = this.array;
      const normalized = index < 0 ? arr.length + index : index;
      return arr[normalized];
    }
    get length() {
      return this.#items.length;
    }
    [REQOR_ARRAY_LENGTH_GET]() {
      return this.#items.length;
    }
    [REQOR_ARRAY_INDEX_GET](index: number) {
      return this.array[index];
    }
    [REQOR_ARRAY_INDEX_SET](index: number, value: string) {
      const next = this.array;
      next[index] = String(value);
      this.set(next);
    }

    get array() {
      return this.#items.map((v) => v.toString());
    }
    valueOf() {
      return this.#items.map((v) => v.toString()).join(",");
    }
    toString() {
      return this.#items.map((v) => v.toString()).join(",");
    }
    [Symbol.toPrimitive](hint: string) {
      if (hint === "number") return this.#items.length;
      return this.toString();
    }
    get [Symbol.isConcatSpreadable]() {
      return true;
    }
    [Symbol.iterator](): IterableIterator<string> {
      return this.array[Symbol.iterator]();
    }
    async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
      for (const item of this.array) yield item;
    }
    get [Symbol.toStringTag]() {
      return "Array";
    }
    get [Symbol.unscopables]() {
      return (Array.prototype as any)[Symbol.unscopables] ?? {};
    }
  }

  class STRING_BOOL_ARRAY extends VALID_STRING_ARRAY {
    constructor(
      h: globalThis.Headers,
      key: string,
      defaultVals: string[] = ["false"],
    ) {
      super(h, key, defaultVals, ["true", "false"]);
    }
  }

  function isValidHeaderName(name: string): boolean {
    return name
      .trim()
      .split("-")
      .every((part) => part.length > 0 && headerNamePattern.test(part));
  }

  function toMethodName(headerName: string): string {
    const normalized = headerName.trim().replace(/_/g, "-");
    const kebab = normalized.includes("-")
      ? normalized
      : normalized.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
    const parts = kebab.toLowerCase().split("-").filter(Boolean);
    return parts
      .map((part, index) =>
        index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
      )
      .join("");
  }

  function toHeaderName(name: string): string {
    const normalized = name.trim().replace(/_/g, "-");
    const kebab = normalized.includes("-")
      ? normalized
      : normalized.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
    const header = kebab
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("-");
    if (!header || !isValidHeaderName(header)) {
      throw new Reqor.Error(
        `Invalid HTTP header name: "${name}"`,
        "Reqor.Headers.HTTPHeaders",
      );
    }
    return header;
  }

  function createForSpec(
    h: globalThis.Headers,
    spec: HeaderSpec,
  ): HeaderController {
    switch (spec.mode) {
      case "mime":
        return new MIME(h, spec.key, String(spec.defaultValue));
      case "mime-array":
        return new MIME_ARRAY(h, spec.key, String(spec.defaultValue));
      case "valid-string":
        if (!spec.validStrings) {
          throw new Reqor.Error(
            "Missing validity rule for header",
            "Reqor.Headers.HTTPHeaders",
          );
        }
        return new VALID_STRING(
          h,
          spec.key,
          String(spec.defaultValue),
          spec.validStrings,
        );
      case "any-string-array":
        if (!Array.isArray(spec.defaultValue)) {
          throw new Reqor.Error(
            "Expected array default for any-string-array",
            "Reqor.Headers.HTTPHeaders",
          );
        }
        return new ANY_STRING_ARRAY(h, spec.key, spec.defaultValue.map(String));
      case "any-string":
        return new ANY_STRING(h, spec.key, String(spec.defaultValue));
      case "number":
        return new NUMBER_STRING(h, spec.key, String(spec.defaultValue));
      case "number-array":
        if (!Array.isArray(spec.defaultValue)) {
          throw new Reqor.Error(
            "Expected array default for number-array",
            "Reqor.Headers.HTTPHeaders",
          );
        }
        return new NUMBER_ARRAY(h, spec.key, spec.defaultValue.map(Number));
      case "string-bool":
        return new STRING_BOOL(h, spec.key, String(spec.defaultValue));
      case "string-bool-array":
        if (!Array.isArray(spec.defaultValue)) {
          throw new Reqor.Error(
            "Expected array default for string-bool-array",
            "Reqor.Headers.HTTPHeaders",
          );
        }
        return new STRING_BOOL_ARRAY(
          h,
          spec.key,
          spec.defaultValue.map(String),
        );
      case "valid-string-array":
        if (!Array.isArray(spec.defaultValue) || !spec.validStrings) {
          throw new Reqor.Error(
            "Missing validity rule for header array",
            "Reqor.Headers.HTTPHeaders",
          );
        }
        return new VALID_STRING_ARRAY(
          h,
          spec.key,
          spec.defaultValue.map(String),
          spec.validStrings,
        );
      default:
        throw new Reqor.Error(
          `Unsupported header mode "${String(spec.mode)}"`,
          "Reqor.Headers.HTTPHeaders",
        );
    }
  }

  function toCallableController<T extends HeaderController>(controller: T) {
    return createCallableObject(controller, (v?: unknown) => {
      if (
        v !== undefined &&
        "set" in controller &&
        typeof controller.set === "function"
      ) {
        controller.set(v as never);
      }
      return controller;
    });
  }

  function fromHeaderName(h: globalThis.Headers, headerName: string) {
    const key = toHeaderName(headerName);
    const spec = HEADER_SPECS[toMethodName(key)];
    if (spec) return toCallableController(createForSpec(h, spec));
    return toCallableController(
      new VALID_STRING(h, key, h.get(key) ?? "", () => true),
    );
  }

  export function create(h: globalThis.Headers) {
    return new Proxy({} as Record<string, unknown>, {
      get(_target, property) {
        if (property === Symbol.iterator) return h.entries.bind(h);
        if (property === Symbol.asyncIterator) {
          return async function* () {
            for (const entry of h.entries()) yield entry;
          };
        }
        if (property === Symbol.toStringTag) return "ReqorHTTPHeaders";
        if (typeof property !== "string") return undefined;
        return fromHeaderName(h, property);
      },
    });
  }

  export function header(h: globalThis.Headers, name: string) {
    return fromHeaderName(h, name);
  }

  export function typed(
    h: globalThis.Headers,
    name: string,
    mode: HeaderMode,
    defaultValue: HeaderPrimitive | HeaderPrimitive[],
    validStrings?: ValidityCheck,
  ) {
    const spec: HeaderSpec = {
      key: toHeaderName(name),
      mode,
      defaultValue,
      validStrings,
    };
    return toCallableController(createForSpec(h, spec));
  }

  export function contentType(h: globalThis.Headers) {
    return fromHeaderName(h, "Content-Type");
  }

  export function accept(h: globalThis.Headers) {
    return fromHeaderName(h, "Accept");
  }

  export function acceptEncoding(h: globalThis.Headers) {
    return fromHeaderName(h, "Accept-Encoding");
  }

  export function acceptLanguage(h: globalThis.Headers) {
    return fromHeaderName(h, "Accept-Language");
  }

  export function acceptPatch(h: globalThis.Headers) {
    return fromHeaderName(h, "Accept-Patch");
  }

  export function acceptPost(h: globalThis.Headers) {
    return fromHeaderName(h, "Accept-Post");
  }
}
function createCallableObject<T extends object>(
  target: T,
  handler: (v?: any) => T,
): T & ((v?: any) => T) {
  const fn = (v?: any) => handler(v);

  (fn as any).valueOf = () =>
    typeof (target as any)?.valueOf === "function"
      ? (target as any).valueOf()
      : target;
  (fn as any).toString = () =>
    typeof (target as any)?.toString === "function"
      ? (target as any).toString()
      : String(target);
  (fn as any)[Symbol.toPrimitive] = (hint: string) => {
    if (typeof (target as any)?.[Symbol.toPrimitive] === "function") {
      return (target as any)[Symbol.toPrimitive](hint);
    }
    if (hint === "number") return Number((fn as any).valueOf());
    if (hint === "string") return (fn as any).toString();
    return (fn as any).valueOf();
  };

  return new Proxy(fn as any, {
    get(innerTarget, property, receiver) {
      if (
        property === "length" &&
        typeof (target as any)?.[REQOR_ARRAY_LENGTH_GET] === "function"
      ) {
        return (target as any)[REQOR_ARRAY_LENGTH_GET]();
      }
      if (
        isArrayIndexKey(property) &&
        typeof (target as any)?.[REQOR_ARRAY_INDEX_GET] === "function"
      ) {
        return (target as any)[REQOR_ARRAY_INDEX_GET](Number(property));
      }
      if (property in target) {
        const value = (target as any)[property];
        return typeof value === "function" ? value.bind(target) : value;
      }
      return Reflect.get(innerTarget, property, receiver);
    },
    set(innerTarget, property, value, receiver) {
      if (
        isArrayIndexKey(property) &&
        typeof (target as any)?.[REQOR_ARRAY_INDEX_SET] === "function"
      ) {
        (target as any)[REQOR_ARRAY_INDEX_SET](Number(property), value);
        return true;
      }
      if (property in target) {
        (target as any)[property] = value;
        return true;
      }
      return Reflect.set(innerTarget, property, value, receiver);
    },
    has(innerTarget, property) {
      if (
        property === "length" &&
        typeof (target as any)?.[REQOR_ARRAY_LENGTH_GET] === "function"
      ) {
        return true;
      }
      if (
        isArrayIndexKey(property) &&
        typeof (target as any)?.[REQOR_ARRAY_LENGTH_GET] === "function"
      ) {
        return Number(property) < (target as any)[REQOR_ARRAY_LENGTH_GET]();
      }
      return property in target || Reflect.has(innerTarget, property);
    },
    ownKeys(innerTarget) {
      const keys = [
        ...Reflect.ownKeys(innerTarget),
        ...Reflect.ownKeys(target as any),
      ];
      if (typeof (target as any)?.[REQOR_ARRAY_LENGTH_GET] === "function") {
        const len = (target as any)[REQOR_ARRAY_LENGTH_GET]();
        keys.push("length");
        for (let i = 0; i < len; i++) keys.push(String(i));
      }
      return Array.from(new Set(keys));
    },
    getOwnPropertyDescriptor(innerTarget, property) {
      if (
        property === "length" &&
        typeof (target as any)?.[REQOR_ARRAY_LENGTH_GET] === "function"
      ) {
        return {
          configurable: true,
          enumerable: false,
          writable: false,
          value: (target as any)[REQOR_ARRAY_LENGTH_GET](),
        };
      }
      if (
        isArrayIndexKey(property) &&
        typeof (target as any)?.[REQOR_ARRAY_LENGTH_GET] === "function"
      ) {
        const idx = Number(property);
        const len = (target as any)[REQOR_ARRAY_LENGTH_GET]();
        if (idx < len) {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value:
              typeof (target as any)?.[REQOR_ARRAY_INDEX_GET] === "function"
                ? (target as any)[REQOR_ARRAY_INDEX_GET](idx)
                : undefined,
          };
        }
      }
      return (
        Reflect.getOwnPropertyDescriptor(target as any, property) ??
        Reflect.getOwnPropertyDescriptor(innerTarget, property)
      );
    },
  }) as T & ((v?: any) => T);
}

namespace Reqor.Headers.HTTPHeaders.ContentType {
  export const validBases = Reqor.Headers.HTTPHeaders.contentTypeValidBases;
  export type validBases = (typeof validBases)[number];
}

/**
 * Create a new reqor instance using an easy function-based approach
 * @param url - The target URL for the request
 */
function req(url: string): Reqor {
  if (!JSTC.for([url]).check(["checkurl"])) {
    throw new Reqor.Error(`[reqor] Invalid URL: ${url}`);
  }
  return new Reqor(url);
}

const reqor = new Proxy(req, {
  get(target, prop, receiver) {
    switch (prop) {
      case "use":
        return (middleware: ReqorMiddleware) => {
          Reqor.use(middleware);
          return receiver;
        };

      case "clearMiddlewares":
        return () => {
          Reqor.clearMiddlewares();
          return receiver;
        };

      case "headers":
        return class extends Reqor.Headers {
          constructor() {
            super(new Headers());
          }
        };

      default:
        return Reflect.get(target, prop, receiver);
    }
  },
});

export default reqor as {
  (url: string): Reqor;
  use: (middleware: ReqorMiddleware) => typeof reqor;
  clearMiddlewares: () => typeof reqor;
  headers: new () => Reqor.Headers;
};
