import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AfterShipTrackingClient,
  getAfterShipTrackingUrl,
  mapAfterShipTagToOrderStatus,
} from "./aftership-tracking.service";
import { createShipmentSchema } from "../../validations/shipping.validation";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AfterShipTrackingClient", () => {
  it("registers tracking with the selected courier and uses the Tracking API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        data: {
          id: "aftership-id",
          tracking_number: "ANJ123",
          slug: "anjani-courier",
          tag: "InfoReceived",
          aftership_tracking_url: "https://track.example.com/ANJ123",
        },
      }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new AfterShipTrackingClient("test-api-key");
    const tracking = await client.createTracking({
      trackingNumber: "ANJ123",
      courierSlug: "anjani-courier",
      orderNumber: "ORDER-123",
      destinationCountry: "IND",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.aftership.com/tracking/2026-07/trackings",
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "as-api-key": "test-api-key",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      tracking: {
        tracking_number: "ANJ123",
        order_id: "ORDER-123",
        order_number: "ORDER-123",
        slug: "anjani-courier",
        destination_country_region: "IND",
      },
    });
    expect(tracking.id).toBe("aftership-id");
  });

  it("returns sorted courier choices and filters malformed entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: {
        couriers: [
          { slug: "z-courier", name: "Z Courier" },
          { slug: "a-courier", name: "A Courier" },
          { name: "Missing slug" },
        ],
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new AfterShipTrackingClient("test-api-key").listCouriers(),
    ).resolves.toEqual([
      { slug: "a-courier", name: "A Courier" },
      { slug: "z-courier", name: "Z Courier" },
    ]);
  });

  it("fetches a tracking record by its AfterShip ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: { id: "id/with space", tracking_number: "ANJ123" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await new AfterShipTrackingClient("test-api-key").getTracking("id/with space");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.aftership.com/tracking/2026-07/trackings/id%2Fwith%20space",
    );
  });

  it("surfaces API errors instead of fabricating tracking data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response({ meta: { message: "Invalid API key" } }, 401),
    ));

    await expect(
      new AfterShipTrackingClient("test-api-key").listCouriers(),
    ).rejects.toThrow("Invalid API key");
  });

  it("reports connection failures explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(
      new AfterShipTrackingClient("test-api-key").listCouriers(),
    ).rejects.toThrow("Could not connect to AfterShip Tracking");
  });
});

describe("AfterShip tracking helpers", () => {
  it("uses the configured AfterShip page or a safe public tracking fallback", () => {
    expect(getAfterShipTrackingUrl({
      id: "id",
      tracking_number: "ANJ 123",
      aftership_tracking_url: "https://track.example.com/ANJ123",
    })).toBe("https://track.example.com/ANJ123");

    expect(getAfterShipTrackingUrl({
      id: "id",
      tracking_number: "ANJ 123",
    }, "anjani-courier")).toBe(
      "https://track.aftership.com/anjani-courier/ANJ%20123",
    );
  });

  it("maps known statuses and leaves unknown statuses unchanged", () => {
    expect(mapAfterShipTagToOrderStatus("Delivered")).toBe("delivered");
    expect(mapAfterShipTagToOrderStatus("InTransit")).toBe("shipped");
    expect(mapAfterShipTagToOrderStatus("NewTag")).toBeNull();
  });
});

describe("createShipmentSchema AfterShip validation", () => {
  it("requires a courier and tracking number only for AfterShip", () => {
    expect(createShipmentSchema.safeParse({ provider: "shiprocket" }).success).toBe(true);
    expect(createShipmentSchema.safeParse({ provider: "aftership" }).success).toBe(false);
    expect(createShipmentSchema.safeParse({
      provider: "aftership",
      carrierName: "Anjani Courier",
      trackingNumber: "ANJ123",
      courierSlug: "anjani-courier",
    }).success).toBe(true);
  });
});
