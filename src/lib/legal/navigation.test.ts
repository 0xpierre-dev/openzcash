import { describe, expect, it } from "vitest";
import { phoneHeaderOf } from "@/lib/phone-header";
import { APPS, backOf, paletteEntries, placeOf } from "@/lib/design-routes";
describe("Zcash Legal navigation",()=>{
  it("is a top-level section next to News with PGP inside it",()=>{
    const legal=APPS.find(app=>app.id==="legal")!;
    expect(legal.parentId).toBeUndefined();
    expect(APPS[APPS.indexOf(legal)-1].id).toBe("news");
    expect(placeOf("/legal/pgp")).toMatchObject({app:{id:"legal"},page:{label:"PGP"}});
    expect(phoneHeaderOf(placeOf("/legal"))).toMatchObject({level:"app",title:"Zcash Legal"});
    expect(backOf("/legal")).toEqual({href:"/zcg",label:"ZCG"});
    expect(backOf("/legal/pgp")).toEqual({href:"/legal",label:"Zcash Legal"});
    expect(paletteEntries(legal)).toEqual(expect.arrayContaining([{href:"/legal/pgp",label:"PGP"}]));
  });
});
