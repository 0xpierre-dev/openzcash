import { describe, expect, it } from "vitest";
import { parseAaipNews, parseUrcdpNews } from "./public-sources";
import { aaipListing, urcdpListing } from "./public-fixtures";
const day = "2026-10-15";
describe("LATAM public authority sources", () => {
  it("reads Argentina's nested HTML without executing it or changing legislative status", () => {
    const [item] = parseAaipNews(aaipListing, day);
    expect(item).toMatchObject({ sourceId: "aaip", publishedAt: "2026-10-09", jurisdictions: ["Argentina"], regions: ["latam"], status: "Official update" });
    expect(item.summary).toBe("La AAIP anunció una consulta sobre protección de datos.");
    expect(item.topics).toContain("Privacy"); expect(item.reviewedAt).toBeUndefined();
  });
  it("distinguishes access-to-information policy from personal-data privacy", () => {
    const [item] = parseAaipNews(aaipListing.replaceAll("Protección de datos personales", "Ley de acceso a la información").replaceAll("protección de datos.", "acceso a la información."), day);
    expect(item.topics).toEqual(["Policy", "Regulation"]);
  });
  it("keeps Uruguay's publication date separate from an event date in its summary", () => {
    const [item] = parseUrcdpNews(urcdpListing.replace("Consulta sobre", "El 28 de agosto: consulta sobre"), day);
    expect(item).toMatchObject({ sourceId: "urcdp", publishedAt: "2026-09-03", jurisdictions: ["Uruguay"], status: "Official update" });
    expect(item.topics).toContain("Regulation");
  });
  it.each([
    [parseAaipNews, aaipListing.replace('datetime="2026-10-09 13:18:27"', '')],
    [parseAaipNews, aaipListing.replace('2026-10-09 13:18:27', '2026-02-30 13:18:27')],
    [parseAaipNews, aaipListing.replace('/noticias/proteccion-de-datos', 'https://evil.example/noticias/proteccion-de-datos')],
    [parseAaipNews, aaipListing.replace('2026-10-09 13:18:27', '2027-10-09 13:18:27')],
    [parseUrcdpNews, urcdpListing.replace('03/09/2026', '03/19/2026')],
    [parseUrcdpNews, urcdpListing.replace('href="/', 'href="https://evil.example/')],
    [parseAaipNews, '<main>Sign in</main>'],
    [parseUrcdpNews, '<main>Maintenance</main>'],
  ])("fails closed for malformed dates, unsafe links and changed layouts", (parse, html) => {
    expect(() => parse(html, day)).toThrow();
  });
});
