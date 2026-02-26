import reqor from "./index.js";

function assertImmediateResponse(response: Awaited<ReturnType<ReturnType<typeof reqor>["get"]>>) {
    if (!("ok" in response)) {
        throw new Error("Expected an immediate Response, but got a delayed ResponseLater.");
    }
    return response;
}

function assertDelayedResponse(response: Awaited<ReturnType<ReturnType<typeof reqor>["get"]>>) {
    if (!("cancel" in response)) {
        throw new Error("Expected a delayed ResponseLater, but got an immediate Response.");
    }
    return response;
}

async function basicGetExample() {
    const response = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/1")
            .params({ source: "reqor-test", basic: true })
            .get(),
    );

    console.log("[basic] status:", response.status.toString(), "ok:", response.ok);
    console.log("[basic] content-type:", response.headers.getContentType?.() ?? "<none>");

    const body = await response.json();
    console.log("[basic] body:", body);
}

async function retryAndTimeoutExample() {
    const response = assertImmediateResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/2")
            .retry(2)
            .retryDelay(250, (current) => current + 250)
            .onRetry((retryNumber) => console.log("[retry] attempt:", retryNumber))
            .timeout(2000)
            .onTimeout((retryNumber) => console.log("[timeout] per-request timeout at retry:", retryNumber))
            .totalTimeout(7000)
            .onTotalTimeout(() => console.log("[timeout] total timeout exceeded"))
            .get(),
    );

    console.log("[retry/timeout] final status:", response.status.toString());
}

async function headersHelperExample() {
    const response = assertImmediateResponse(await reqor("https://jsonplaceholder.typicode.com/posts/1").get());
    const httpHeaders = response.headers.http as any;

    const contentType = httpHeaders.contentType();
    const cacheControl = httpHeaders.cacheControl();

    console.log("[headers] contentType:", contentType.toString());
    console.log("[headers] cacheControl:", cacheControl.toString());
}

async function delayedFetchCancelExample() {
    const delayed = assertDelayedResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/3")
            .after(3000)
            .get(),
    );

    setTimeout(() => {
        const canceled = delayed.cancel();
        console.log("[delayed/cancel] cancel() called:", canceled);
    }, 1000);

    await delayed.done;
    console.log("[delayed/cancel] activated:", delayed.activated, "canceled:", delayed.canceled);
}

async function delayedFetchActivationExample() {
    const delayed = assertDelayedResponse(
        await reqor("https://jsonplaceholder.typicode.com/todos/4")
            .after(500)
            .get(),
    );

    await delayed.done;
    console.log("[delayed/activate] activated:", delayed.activated, "canceled:", delayed.canceled);
}

async function main() {
    await basicGetExample();
    await retryAndTimeoutExample();
    await headersHelperExample();
    await delayedFetchCancelExample();
    await delayedFetchActivationExample();
}

main().catch((error) => {
    console.error("[test] failed:", error);
});
