import { describe, expect, it } from "vitest";
import { filterLegalItems, legalDate } from "./presentation";
import type { LegalItem } from "./types";
const item = (id: string, rest: Partial<LegalItem>): LegalItem => ({id,title:id,summary:"",url:"https://example.org/record",sourceId:"authority",publishedAt:"2026-09-23",regions:["latam"],jurisdictions:["Brazil"],topics:["Regulation"],kind:"Regulation",status:"Adopted",...rest});
const items = [item("Brazil custody rule",{}),item("Policy memo",{sourceId:"pgp",regions:["north-america"],jurisdictions:["United States"],topics:["Privacy","Policy"],kind:"Policy memo",status:"Analysis",publishedAt:"2026-09-28"})];
describe("Legal news discovery",()=>{
  it("intersects region, topic, country search and source without changing statuses",()=>{
    expect(filterLegalItems(items,{region:"latam",topic:"Regulation",q:"Brazil custody"}).map(x=>x.id)).toEqual(["Brazil custody rule"]);
    expect(filterLegalItems(items,{region:"latam",topic:"Privacy"})).toEqual([]);
    expect(filterLegalItems(items,{sourceId:"pgp"})).toMatchObject([{id:"Policy memo",status:"Analysis"}]);
  });
  it("uses country names and orders by the recorded publication date",()=>{
    expect(filterLegalItems(items,{q:"united states"})[0].id).toBe("Policy memo");
    expect(filterLegalItems(items,{}).map(x=>x.id)).toEqual(["Policy memo","Brazil custody rule"]);
    expect(items[0].id).toBe("Brazil custody rule");
  });
  it("keeps date-only source dates stable across local time zones",()=>{
    expect(legalDate("2026-09-28")).toBe("28 Sept 2026");
    expect(legalDate("invalid")).toBe("Date not provided");
  });
});
