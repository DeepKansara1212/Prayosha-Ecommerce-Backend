import { afterEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { Order, type IOrder } from "../../../models/order.model";
import { Product } from "../../../models/product.model";
import { User } from "../../../models/user.model";
import { ShiprocketProvider } from "./shiprocket.provider";

vi.mock("../../../models/product.model", () => ({
  Product: { find: vi.fn() },
}));

vi.mock("../../../models/user.model", () => ({
  User: { findById: vi.fn() },
}));

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeOrder(): IOrder {
  const order = new Order({
    orderNumber: "ORDER-SHIPROCKET-TEST",
    user: new Types.ObjectId(),
    items: [
      {
        product: new Types.ObjectId(),
        name: "Test item",
        image: "",
        sku: "TEST-1",
        price: 100,
        quantity: 1,
      },
    ],
    shippingAddress: {
      fullName: "Test Customer",
      phone: "9876543210",
      line1: "1 Test Street",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    },
    subtotal: 100,
    discount: 0,
    shippingCharge: 0,
    tax: 0,
    total: 100,
    paymentMethod: "cod",
    paymentStatus: "pending",
    status: "confirmed",
  });
  order.createdAt = new Date("2026-01-01T00:00:00.000Z");
  return order;
}

function mockProductLookup(products: unknown[] = []): void {
  const query = {
    select: vi.fn(),
    populate: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.populate.mockReturnValueOnce(query).mockResolvedValueOnce(products);
  vi.mocked(Product.find).mockReturnValue(query as never);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ShiprocketProvider.createShipment", () => {
  it("creates an order, assigns the default courier, requests pickup, then generates a manifest", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ token: "test-token" }))
      .mockResolvedValueOnce(response({ order_id: 101, shipment_id: 202 }))
      .mockResolvedValueOnce(response({
        awb_assign_status: 1,
        response: {
          data: {
            awb_code: "AWB-202",
            courier_company_id: 303,
            courier_name: "Test Courier",
          },
        },
      }))
      .mockResolvedValueOnce(response({ pickup_status: 1 }))
      .mockResolvedValueOnce(response({
        status: 1,
        manifest_url: "https://example.com/manifest.pdf",
      }));
    vi.stubGlobal("fetch", fetchMock);
    mockProductLookup();
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ email: "test@example.com" }),
    } as never);

    const provider = new ShiprocketProvider({
      email: "shiprocket-test@example.com",
      password: "password",
    });
    const result = await provider.createShipment(makeOrder());

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://apiv2.shiprocket.in/v1/external/auth/login",
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
      "https://apiv2.shiprocket.in/v1/external/courier/generate/pickup",
      "https://apiv2.shiprocket.in/v1/external/manifests/generate",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toEqual({
      shipment_id: 202,
    });
    expect(JSON.parse(fetchMock.mock.calls[3][1]?.body as string)).toEqual({
      shipment_id: [202],
    });
    expect(JSON.parse(fetchMock.mock.calls[4][1]?.body as string)).toEqual({
      shipment_id: [202],
    });
    expect(result).toMatchObject({
      shipmentId: "202",
      trackingNumber: "AWB-202",
      carrier: "Test Courier",
      status: "Pickup Scheduled",
      manifestUrl: "https://example.com/manifest.pdf",
      providerMeta: { shiprocketOrderId: "101", courierCompanyId: 303 },
    });
  });

  it("uses the cheapest serviceable courier rate for the package and destination", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(response({ token: "test-token" }))
        .mockResolvedValueOnce(response({
          data: {
            available_courier_companies: [
              { courier_company_id: 303, courier_name: "Higher Rate", rate: 128.5 },
              { courier_company_id: 404, courier_name: "Lowest Rate", rate: 74.25 },
            ],
          },
        }));
      vi.stubGlobal("fetch", fetchMock);
      mockProductLookup();

      const provider = new ShiprocketProvider({
        email: "shiprocket-rate-test@example.com",
        password: "password",
        pickupPostcode: "560001",
      });
      const order = makeOrder();
      const result = await provider.calculateShippingRate(
        order.items,
        order.shippingAddress.pincode,
        "prepaid",
        order.subtotal,
      );

      expect(result).toEqual({
        charge: 74.25,
        courierCompanyId: 404,
        courierName: "Lowest Rate",
      });
      const serviceabilityUrl = new URL(String(fetchMock.mock.calls[1][0]));
      expect(serviceabilityUrl.pathname).toBe(
        "/v1/external/courier/serviceability/",
      );
      expect(Object.fromEntries(serviceabilityUrl.searchParams.entries())).toEqual({
        pickup_postcode: "560001",
        delivery_postcode: "400001",
        weight: "0.5",
        length: "10",
        breadth: "10",
        height: "10",
        cod: "0",
        declared_value: "100",
      });
  });

  it("requires a configured pickup postcode before requesting a live rate", async () => {
      const provider = new ShiprocketProvider({
        email: "shiprocket-missing-pickup-test@example.com",
        password: "password",
      });

      await expect(
        provider.calculateShippingRate(
          makeOrder().items,
          "400001",
          "prepaid",
          100,
        ),
      ).rejects.toThrow(/valid 6-digit Shiprocket pickup postcode/);
  });

  it("uses parcel dimensions to send volumetric weight when it exceeds actual weight", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ token: "test-token" }))
      .mockResolvedValueOnce(response({
        data: {
          available_courier_companies: [
            { courier_company_id: 505, rate: 210 },
          ],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const order = makeOrder();
    mockProductLookup([{
      _id: order.items[0].product,
      useCategoryShipping: false,
      shipping: {
        weight: "200 g",
        length: "50",
        breadth: "50",
        height: "50",
      },
    }]);

    const provider = new ShiprocketProvider({
      email: "shiprocket-dimensional-rate-test@example.com",
      password: "password",
      pickupPostcode: "560001",
    });
    await provider.calculateShippingRate(
      order.items,
      order.shippingAddress.pincode,
      "prepaid",
      order.subtotal,
    );

    const serviceabilityUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(serviceabilityUrl.searchParams.get("weight")).toBe("25");
  });

});

describe("ShiprocketProvider.createShipment failures", () => {
  it("surfaces shipment identifiers and stops before pickup when AWB assignment fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ token: "test-token" }))
      .mockResolvedValueOnce(response({ order_id: 111, shipment_id: 222 }))
      .mockResolvedValueOnce(response({ message: "No courier available" }));
    vi.stubGlobal("fetch", fetchMock);
    mockProductLookup();
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ email: "test@example.com" }),
    } as never);

    const provider = new ShiprocketProvider({
      email: "shiprocket-failure-test@example.com",
      password: "password",
    });

    await expect(provider.createShipment(makeOrder())).rejects.toThrow(
      /order 111 \(shipment 222\).*AWB\/courier assignment failed.*Check ShipRocket/
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
