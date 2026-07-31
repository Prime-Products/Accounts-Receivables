import { describe, expect, it } from "vitest";
import {
  buildSoftOneVesselOwnerQuery,
  normalizeSoftOneVessels,
  softOneVesselsQuery,
} from "./lib/softoneVessels";

describe("SoftOne vessel sync", () => {
  it("uses the supplied vessel registry fields and receivables-only owners", () => {
    expect(softOneVesselsQuery).toContain("[dbo].[CCCCUSTSHIP]");
    expect(softOneVesselsQuery).toContain("owner.[SODTYPE] = 13");
    expect(softOneVesselsQuery).toContain("owner.[TRDGROUP] <> 473");
    expect(softOneVesselsQuery).toContain("[dbo].[CCCPRJCVESSEL]");
    expect(softOneVesselsQuery).toContain("contract.[ACTIVE247] = 1");
  });

  it("normalizes CCCCUSTSHIP, TRDR, name, IMO and type", () => {
    expect(
      normalizeSoftOneVessels([
        {
          VESSEL_ID: 8123,
          TRDR: 456,
          CODE: "SHIP-1",
          VESSEL_NAME: "MV TEST STAR",
          IMO: "9321483",
          VESSEL_TYPE: "Tanker",
          OWNER_NAME: "TEST OWNER",
          HAS_ACTIVE_CONTRACT: 1,
        },
      ])[0],
    ).toEqual({
      id: 8123,
      customerSoftoneId: "456",
      name: "MV TEST STAR",
      imo: "9321483",
      vesselType: "Tanker",
      ownerName: "TEST OWNER",
      hasActiveContract: true,
    });
  });

  it("rejects duplicate source identifiers", () => {
    const row = { VESSEL_ID: 1, TRDR: 2, VESSEL_NAME: "ONE" };
    expect(() => normalizeSoftOneVessels([row, row])).toThrow(/duplicate vessel id/);
  });

  it("builds a read-only, eligible single-owner lookup", () => {
    const query = buildSoftOneVesselOwnerQuery(40022);
    expect(query).toContain("owner.[TRDR] = 40022");
    expect(query).toContain("owner.[SODTYPE] = 13");
    expect(query).toContain("owner.[ISACTIVE] = 1");
    expect(query).toContain("owner.[TRDGROUP] <> 473");
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|EXEC)\b/i);
    expect(() => buildSoftOneVesselOwnerQuery(-1)).toThrow(/invalid/i);
  });
});
