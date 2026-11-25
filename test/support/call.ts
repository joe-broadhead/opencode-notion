import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"

/** A handler call, as one door would build it, with the alias the register resolved. */
export function methodCall(account = "work", overrides: Partial<MethodCall> = {}): MethodCall {
  const base = {
    sessionID: "ses_test",
    agent: "build",
    messageID: "msg_test",
    id: "call_test",
    signal: new AbortController().signal,
    progress: async () => {},
    account,
    door: "tool",
  }
  return { ...base, ...overrides } as unknown as MethodCall
}
