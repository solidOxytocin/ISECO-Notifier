import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapApifyPostsToItems } from "./apify.ts";

Deno.test("maps a photo post to a feed item with fb_ id and full image uri", () => {
  const items = mapApifyPostsToItems([
    {
      postId: "1397878851694949",
      url: "https://www.facebook.com/100044185428261/posts/1397878851694949",
      time: "2026-06-15T10:41:16.000Z",
      text: "SCHEDULED POWER INTERRUPTION\nJune 16, 2026",
      media: [
        {
          __typename: "Photo",
          thumbnail: "https://scontent.xx.fbcdn.net/thumb.jpg",
          photo_image: { uri: "https://scontent.xx.fbcdn.net/full.jpg" },
        },
      ],
    },
  ]);

  assertEquals(items.length, 1);
  assertEquals(items[0].sourcePostId, "fb_1397878851694949");
  assertEquals(items[0].caption, "SCHEDULED POWER INTERRUPTION\nJune 16, 2026");
  assertEquals(items[0].publishedAt, "2026-06-15T10:41:16.000Z");
  assertEquals(items[0].imageUrls, ["https://scontent.xx.fbcdn.net/full.jpg"]);
});

Deno.test("prefers photo_image.uri but falls back to thumbnail", () => {
  const items = mapApifyPostsToItems([
    {
      postId: "1",
      media: [{ thumbnail: "https://scontent.xx.fbcdn.net/only-thumb.jpg" }],
    },
  ]);
  assertEquals(items[0].imageUrls, ["https://scontent.xx.fbcdn.net/only-thumb.jpg"]);
});

Deno.test("deduplicates repeated image urls", () => {
  const items = mapApifyPostsToItems([
    {
      postId: "1",
      media: [
        { photo_image: { uri: "https://scontent.xx.fbcdn.net/a.jpg" } },
        { photo_image: { uri: "https://scontent.xx.fbcdn.net/a.jpg" } },
      ],
    },
  ]);
  assertEquals(items[0].imageUrls, ["https://scontent.xx.fbcdn.net/a.jpg"]);
});

Deno.test("handles posts with no media", () => {
  const items = mapApifyPostsToItems([{ postId: "1", text: "text only" }]);
  assertEquals(items[0].imageUrls, []);
});

Deno.test("derives fb_ id from post url when postId is missing", () => {
  const items = mapApifyPostsToItems([
    { url: "https://www.facebook.com/ISECO.Official/posts/987654321" },
  ]);
  assertEquals(items[0].sourcePostId, "fb_987654321");
});
