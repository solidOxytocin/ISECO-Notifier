export interface RssItem {
  sourcePostId: string;
  title: string;
  caption: string;
  publishedAt: string;
  imageUrls: string[];
  link: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(cdata) ?? block.match(plain);
  return m ? stripHtml(m[1]) : "";
}

function extractImageUrls(block: string): string[] {
  const urls: string[] = [];

  const enclosureRe = /<enclosure[^>]+url="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = enclosureRe.exec(block)) !== null) {
    if (m[1].match(/\.(jpg|jpeg|png|webp)/i)) urls.push(m[1]);
  }

  const mediaRe = /<media:content[^>]+url="([^"]+)"[^>]*>/gi;
  while ((m = mediaRe.exec(block)) !== null) {
    urls.push(m[1]);
  }

  const imgRe = /<img[^>]+src="([^"]+)"/gi;
  while ((m = imgRe.exec(block)) !== null) {
    urls.push(m[1]);
  }

  return [...new Set(urls)];
}

function extractPostId(link: string, guid: string): string {
  const fbMatch = link.match(/\/posts\/(\d+)/) ?? link.match(/story_fbid=(\d+)/);
  if (fbMatch) return `fb_${fbMatch[1]}`;
  const hash = guid || link;
  return `post_${btoa(hash).slice(0, 32)}`;
}

export function parseRssFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const description = extractTag(block, "description");
    const link = extractTag(block, "link");
    const guid = extractTag(block, "guid");
    const pubDate = extractTag(block, "pubDate");
    const imageUrls = extractImageUrls(block);

    const caption = description || title;

    items.push({
      sourcePostId: extractPostId(link, guid),
      title,
      caption,
      publishedAt: pubDate,
      imageUrls,
      link,
    });
  }

  return items;
}
