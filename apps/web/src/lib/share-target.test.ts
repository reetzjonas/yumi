import { describe, expect, test } from "bun:test";
import { pwaOptions } from "../../pwa.config";
import { shareTargetSearch } from "./share-target";

describe("recipe share target", () => {
  test("registers a GET landing page without saving or importing on navigation", () => {
    expect(pwaOptions.manifest.share_target).toEqual({
      action: "/recipes/import",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { url: "url", text: "text", title: "title" },
    });
  });

  test("prefers the explicit URL and drops untrusted metadata", () => {
    expect(
      shareTargetSearch({
        url: " https://recipes.example/soup?servings=4&lang=de#steps ",
        text: "https://other.example/",
        title: "<script>alert(1)</script>",
      }),
    ).toEqual({
      url: "https://recipes.example/soup?servings=4&lang=de#steps",
    });
  });

  test.each([
    "https://recipes.example/soup",
    "Soup\nhttps://recipes.example/soup",
    "Try this: (https://recipes.example/soup).",
    '<a href="https://recipes.example/soup">Soup</a>',
  ])("extracts an Android text URL from %s", (text) => {
    expect(shareTargetSearch({ text })).toEqual({
      url: "https://recipes.example/soup",
    });
  });

  test("falls back from invalid URL to text, then a URL-only title", () => {
    expect(
      shareTargetSearch({
        url: "javascript:alert(1)",
        text: "https://recipes.example/soup",
      }),
    ).toEqual({ url: "https://recipes.example/soup" });
    expect(
      shareTargetSearch({
        text: "Soup",
        title: "https://recipes.example/soup",
      }),
    ).toEqual({ url: "https://recipes.example/soup" });
    expect(
      shareTargetSearch({ title: "Soup https://recipes.example/soup" }),
    ).toEqual({ url: undefined });
  });

  test("takes the first valid text URL and supports HTTP", () => {
    expect(
      shareTargetSearch({
        text: "https://user:secret@invalid.example/ http://recipes.example/soup https://other.example/",
      }),
    ).toEqual({ url: "http://recipes.example/soup" });
  });

  test.each(
    [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "//recipes.example/soup",
      "/recipes/soup",
      "https:recipes.example/soup",
      "https://",
      "https://user:secret@recipes.example/soup",
      "https://recipes.example/\nheader",
      "https://recipes.example/\u0000",
      `https://recipes.example/${"x".repeat(2000)}`,
      ["https://recipes.example/soup"],
      { url: "https://recipes.example/soup" },
      123,
      null,
    ].map((url) => ({ url })),
  )("ignores invalid source URL %#", ({ url }) => {
    expect(shareTargetSearch({ url })).toEqual({ url: undefined });
  });

  test("bounds text scanning and rejects malformed payload types", () => {
    expect(
      shareTargetSearch({
        text: `${"x".repeat(10_000)} https://recipes.example/soup`,
      }),
    ).toEqual({ url: undefined });
    expect(
      shareTargetSearch({
        text: ["https://recipes.example/soup"],
        title: { url: "https://recipes.example/soup" },
      }),
    ).toEqual({ url: undefined });
  });

  test("decodes a share query once and leaves encoded URL content intact", () => {
    const url = "https://recipes.example/soup?q=a+b&next=%2Frecipe%3Fx%3D1";
    const search = Object.fromEntries(
      new URLSearchParams({ text: `Soup\n${url}`, title: "Soup & bread" }),
    );
    expect(shareTargetSearch(search)).toEqual({ url });
  });

  test("preserves the manual entry point without a shared URL", () => {
    expect(shareTargetSearch({})).toEqual({ url: undefined });
    expect(shareTargetSearch({ text: "Soup", title: "Soup" })).toEqual({
      url: undefined,
    });
  });
});
