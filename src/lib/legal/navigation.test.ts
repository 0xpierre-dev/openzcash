import { describe, expect, it } from "vitest";
import { phoneHeaderOf } from "@/lib/phone-header";
import { APPS, backOf, paletteEntries, placeOf } from "@/lib/design-routes";
describe("Privacy & Policy navigation",()=>{
  it("is a top-level section directly after ZEC Observatory with only one Updates destination",()=>{
    const legal=APPS.find(app=>app.id==="legal")!;
    expect(legal.parentId).toBeUndefined();
    expect(APPS[APPS.indexOf(legal)-1].id).toBe("zec-observatory");
    expect(legal.pages).toEqual([{href:"/legal",label:"Updates"}]);
    expect(phoneHeaderOf(placeOf("/legal"))).toMatchObject({level:"app",title:"Privacy & Policy"});
    expect(backOf("/legal")).toEqual({href:"/zcg",label:"ZCG"});
    expect(paletteEntries(legal).some(entry=>entry.href==="/legal/pgp")).toBe(false);
  });
});
