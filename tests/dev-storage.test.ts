import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "../src/app/api/dev-storage/route";
import { getFakeStorage } from "../src/adapters/storage";
import { MAX_FILE_BYTES } from "../src/lib/db/files";

const URL_BASE = "http://localhost:3000/api/dev-storage";

function putReq(key: string, body: Uint8Array, type: string) {
  return new NextRequest(`${URL_BASE}?key=${encodeURIComponent(key)}&type=${encodeURIComponent(type)}`, {
    method: "PUT",
    body: Buffer.from(body),
  });
}

function getReq(key: string) {
  return new NextRequest(`${URL_BASE}?key=${encodeURIComponent(key)}`);
}

const savedRailway = process.env.RAILWAY_ENVIRONMENT_NAME;
const savedNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (savedRailway === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME;
  else process.env.RAILWAY_ENVIRONMENT_NAME = savedRailway;
  (process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv;
});

describe("dev-storage route", () => {
  it("serves the fake store in a dev environment (baseline)", async () => {
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    const put = await PUT(putReq("t/x/p/y/base.png", new Uint8Array([1, 2, 3]), "image/png"));
    expect(put.status).toBe(200);
    expect(getFakeStorage()).not.toBeNull(); // fake adapter is active
    const get = await GET(getReq("t/x/p/y/base.png"));
    expect(get.status).toBe(200);
  });

  it("returns 404 for both handlers when RAILWAY_ENVIRONMENT_NAME is set, even with the fake adapter active", async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = "production";
    expect(getFakeStorage()).not.toBeNull();
    const put = await PUT(putReq("t/x/p/y/blocked.png", new Uint8Array([1]), "image/png"));
    expect(put.status).toBe(404);
    // The key stored in the baseline test is unreachable too.
    const get = await GET(getReq("t/x/p/y/base.png"));
    expect(get.status).toBe(404);
  });

  it("returns 404 for both handlers when NODE_ENV is production", async () => {
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    expect((await PUT(putReq("t/x/p/y/n.png", new Uint8Array([1]), "image/png"))).status).toBe(404);
    expect((await GET(getReq("t/x/p/y/base.png"))).status).toBe(404);
  });

  it("enforces the upload allowlist and size cap on PUT, same as the presign path", async () => {
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    const badType = await PUT(
      putReq("t/x/p/y/app.exe", new Uint8Array([1]), "application/x-msdownload")
    );
    expect(badType.status).toBe(400);

    const oversize = await PUT(
      putReq("t/x/p/y/big.png", new Uint8Array(MAX_FILE_BYTES + 1), "image/png")
    );
    expect(oversize.status).toBe(400);

    expect(getFakeStorage()!.store.has("t/x/p/y/app.exe")).toBe(false);
    expect(getFakeStorage()!.store.has("t/x/p/y/big.png")).toBe(false);
  });
});
